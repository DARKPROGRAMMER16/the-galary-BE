import Video from '../models/Video.model.js';
import { getIO } from '../config/socket.js';
import { extractFrames, cleanupFrames } from './ffmpeg.service.js';
import logger from '../utils/logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ANALYSIS_STEPS = [
  { label: 'Extracting frames from video', progress: 20 },
  { label: 'Running visual analysis',       progress: 40 },
  { label: 'Analysing audio content',       progress: 60 },
  { label: 'Computing sensitivity score',   progress: 85 },
  { label: 'Finalising report',             progress: 100 },
];

const SENSITIVITY_THRESHOLD = 0.5;

export const processSensitivity = async (videoId, userId) => {
  let framesExtracted = false;

  try {
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingProgress: 0,
    });

    const io = getIO();
    const doc = await Video.findById(videoId);

    // Step 1: Extract frames using FFmpeg (real work happens here)
    // These frames would be sent to a real AI model in production.
    try {
      logger.debug(`[Sensitivity] Extracting frames for video ${videoId}`);
      await extractFrames(doc.filePath, videoId, 5);
      framesExtracted = true;
      logger.debug(`[Sensitivity] Frames ready for video ${videoId}`);
    } catch (frameErr) {
      // Frame extraction failure is non-fatal — continue with mock analysis
      logger.warn(`[Sensitivity] Frame extraction failed, continuing: ${frameErr.message}`);
    }

    // Step 2: Run through analysis stages with progress events
    for (const { label, progress } of ANALYSIS_STEPS) {
      await sleep(1200 + Math.random() * 1200);

      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });

      io.to(`user:${userId}`).emit('video:progress', { videoId, progress, step: label });

      logger.debug(`[Sensitivity] Video ${videoId} — ${label} (${progress}%)`);
    }

    // Step 3: Generate mock sensitivity scores
    // In production: replace this block with real AI API calls using the extracted frames
    const violence = parseFloat((Math.random() * 0.6).toFixed(3));
    const adult    = parseFloat((Math.random() * 0.5).toFixed(3));
    const hate     = parseFloat((Math.random() * 0.4).toFixed(3));
    const sensitivityScore = parseFloat(Math.max(violence, adult, hate).toFixed(3));
    const status = sensitivityScore >= SENSITIVITY_THRESHOLD ? 'flagged' : 'safe';

    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      {
        status,
        sensitivityScore,
        sensitivityDetails: { violence, adult, hate },
        processingProgress: 100,
      },
      { new: true }
    ).populate('uploadedBy', 'name email');

    // Step 4: Notify the frontend
    io.to(`user:${userId}`).emit('video:done', {
      videoId,
      status,
      sensitivityScore,
      sensitivityDetails: { violence, adult, hate },
      video: updatedVideo,
    });

    logger.info(`[Sensitivity] Video ${videoId} → ${status} (score: ${sensitivityScore})`);
  } catch (error) {
    logger.error(`[Sensitivity] Failed for video ${videoId}: ${error.message}`);
    await Video.findByIdAndUpdate(videoId, { status: 'error' });

    try {
      const io = getIO();
      io.to(`user:${userId}`).emit('video:error', {
        videoId,
        message: 'Processing failed. Please try re-uploading.',
      });
    } catch (_) {}
  } finally {
    // Always clean up extracted frames to avoid filling disk
    if (framesExtracted) {
      cleanupFrames(videoId);
    }
  }
};
