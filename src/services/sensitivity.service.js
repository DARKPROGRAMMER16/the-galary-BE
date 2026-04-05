import fs from 'fs';
import path from 'path';
import Video from '../models/Video.model.js';
import { getIO } from '../config/socket.js';
import { analyzeFrames } from './gemini.service.js';
import logger from '../utils/logger.js';

const SENSITIVITY_THRESHOLD = 0.5;

const emitEvent = (event, userId, payload) => {
  try { getIO().to(`user:${userId}`).emit(event, payload); } catch (_) {}
};

/**
 * Emit a single log line to the uploading user.
 * Frontend listens on 'video:log' and appends to a live terminal panel.
 */
const emitLog = (userId, videoId, message) => {
  emitEvent('video:log', userId, {
    videoId,
    message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Run Gemini-based sensitivity analysis on extracted video frames.
 *
 * @param {string}   videoId    MongoDB Video _id
 * @param {string}   userId     Uploader's user _id (for socket room)
 * @param {string[]} framePaths Local JPEG frame paths extracted during upload
 */
export const processSensitivity = async (videoId, userId, framePaths = []) => {
  const log = (message) => emitLog(userId, videoId, message);

  try {
    await Video.findByIdAndUpdate(videoId, { status: 'processing', processingProgress: 0 });

    log('━━━ Sensitivity analysis started ━━━');
    emitEvent('video:progress', userId, { videoId, progress: 10, step: 'Starting analysis' });

    // ── Step 1: hand off to Gemini ──────────────────────────────────────────
    log('🔍  Initiating content moderation pipeline...');
    emitEvent('video:progress', userId, { videoId, progress: 30, step: 'Analysing frames with Gemini' });

    const { violence, adult, hate, sensitivityScore, flagged } =
      await analyzeFrames(framePaths, log);

    emitEvent('video:progress', userId, { videoId, progress: 80, step: 'Computing sensitivity score' });

    // ── Step 2: derive final status ─────────────────────────────────────────
    const score = sensitivityScore ?? parseFloat(Math.max(violence, adult, hate).toFixed(3));
    const status = (flagged || score >= SENSITIVITY_THRESHOLD) ? 'flagged' : 'safe';

    log(`✅  Final verdict: ${status.toUpperCase()} (score: ${score.toFixed(3)})`);
    log('━━━ Analysis complete ━━━');

    // ── Step 3: persist results ─────────────────────────────────────────────
    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      {
        status,
        sensitivityScore: score,
        sensitivityDetails: { violence, adult, hate },
        processingProgress: 100,
      },
      { new: true }
    ).populate('uploadedBy', 'name email');

    emitEvent('video:progress', userId, { videoId, progress: 100, step: 'Done' });
    emitEvent('video:done', userId, {
      videoId,
      status,
      sensitivityScore: score,
      sensitivityDetails: { violence, adult, hate },
      video: updatedVideo,
    });

    logger.info(`[Sensitivity] Video ${videoId} → ${status} (score: ${score})`);
  } catch (error) {
    logger.error(`[Sensitivity] Failed for video ${videoId}: ${error.message}`);
    log(`❌  Analysis failed: ${error.message}`);
    await Video.findByIdAndUpdate(videoId, { status: 'error' }).catch(() => {});
    emitEvent('video:error', userId, {
      videoId,
      message: 'Sensitivity analysis failed. Please try re-uploading.',
    });
  } finally {
    cleanupFrames(framePaths);
  }
};

function cleanupFrames(framePaths) {
  if (!framePaths || framePaths.length === 0) return;

  const dirs = new Set();
  for (const fp of framePaths) {
    try { fs.unlinkSync(fp); } catch (_) {}
    dirs.add(path.dirname(fp));
  }
  for (const dir of dirs) {
    try { fs.rmdirSync(dir); } catch (_) {}
  }
}
