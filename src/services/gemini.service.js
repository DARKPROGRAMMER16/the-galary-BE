import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import logger from '../utils/logger.js';

const SENSITIVITY_THRESHOLD = 0.5;
const MAX_FRAMES = 8; // cap to stay within reasonable token budget

const PROMPT = `You are a content moderation AI analyzing video frames.

Examine every frame provided and return ONLY a valid JSON object — no markdown, no explanation:
{
  "violence": <float 0.0-1.0>,
  "adult":    <float 0.0-1.0>,
  "hate":     <float 0.0-1.0>
}

Scoring criteria:
- violence : physical harm, weapons, blood/gore, self-harm imagery
- adult    : nudity, sexual content, explicit material
- hate     : hate symbols, slurs, discriminatory text/imagery

0.0 = completely absent  |  1.0 = extreme / unmistakable presence
Respond with the JSON object only.`;

/**
 * Send extracted video frames to Gemini Flash for content moderation.
 *
 * @param {string[]}  framePaths  Array of local JPEG frame file paths.
 * @param {Function}  onLog       Optional callback(message: string) for real-time log streaming.
 * @returns {{ violence: number, adult: number, hate: number, flagged: boolean }}
 */
export const analyzeFrames = async (framePaths, onLog = () => {}) => {
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('[Gemini] GEMINI_API_KEY not set — skipping real analysis, defaulting to safe.');
    onLog('⚠️  GEMINI_API_KEY not configured — skipping analysis, marking as safe.');
    return { violence: 0, adult: 0, hate: 0, flagged: false };
  }

  if (!framePaths || framePaths.length === 0) {
    logger.warn('[Gemini] No frames provided — defaulting to safe.');
    onLog('⚠️  No frames were extracted from this video — marking as safe by default.');
    return { violence: 0, adult: 0, hate: 0, flagged: false };
  }

  onLog(`🎞  ${framePaths.length} frame(s) available for analysis.`);

  // Sample evenly if we have more frames than the cap
  const sampled =
    framePaths.length <= MAX_FRAMES
      ? framePaths
      : Array.from({ length: MAX_FRAMES }, (_, i) =>
          framePaths[Math.floor((i * framePaths.length) / MAX_FRAMES)]
        );

  if (sampled.length < framePaths.length) {
    onLog(`📐  Sampling ${sampled.length} of ${framePaths.length} frames (cap: ${MAX_FRAMES}).`);
  } else {
    onLog(`📐  Using all ${sampled.length} frame(s).`);
  }

  // Build the multimodal request parts: prompt + all frames
  const parts = [{ text: PROMPT }];
  let loadedCount = 0;

  for (let i = 0; i < sampled.length; i++) {
    const framePath = sampled[i];
    try {
      const data = fs.readFileSync(framePath).toString('base64');
      parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      loadedCount++;
      onLog(`🖼  Loaded frame ${i + 1} / ${sampled.length}`);
    } catch (e) {
      logger.warn(`[Gemini] Could not read frame ${framePath}: ${e.message}`);
      onLog(`⚠️  Could not read frame ${i + 1} — skipping.`);
    }
  }

  parts.push({ text: 'Return the JSON scores for the frames above.' });

  onLog(`🤖  Sending ${loadedCount} frame(s) to Gemini AI for content moderation...`);

  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
  });

  onLog('📨  Response received from Gemini AI — parsing scores...');

  const raw = result.response.text();

  // Strip markdown code fences Gemini sometimes adds
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let scores;
  try {
    scores = JSON.parse(cleaned);
  } catch {
    logger.error(`[Gemini] Could not parse response: ${raw}`);
    onLog('❌  Failed to parse Gemini response as JSON.');
    throw new Error('Gemini returned non-JSON response.');
  }

  const clamp = (v) => Math.min(1, Math.max(0, parseFloat(v) || 0));
  const violence = clamp(scores.violence);
  const adult    = clamp(scores.adult);
  const hate     = clamp(scores.hate);
  const sensitivityScore = parseFloat(Math.max(violence, adult, hate).toFixed(3));

  onLog(`🔴  Violence score  : ${violence.toFixed(3)}`);
  onLog(`🔞  Adult content   : ${adult.toFixed(3)}`);
  onLog(`☣️   Hate content    : ${hate.toFixed(3)}`);
  onLog(`📊  Overall score   : ${sensitivityScore.toFixed(3)} (threshold: ${SENSITIVITY_THRESHOLD})`);

  logger.info(
    `[Gemini] Scores — violence:${violence} adult:${adult} hate:${hate} → ${sensitivityScore >= SENSITIVITY_THRESHOLD ? 'FLAGGED' : 'safe'}`
  );

  return {
    violence,
    adult,
    hate,
    sensitivityScore,
    flagged: sensitivityScore >= SENSITIVITY_THRESHOLD,
  };
};
