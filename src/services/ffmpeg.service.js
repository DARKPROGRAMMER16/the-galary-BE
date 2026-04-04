import path from 'path';
import fs from 'fs';
import ffmpeg from '../config/ffmpeg.config.js';
import logger from '../utils/logger.js';

// ─── Helper ────────────────────────────────────────────────────────────────

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// ─── 1. Metadata Extraction ────────────────────────────────────────────────
//
// Reads video duration, width, height, codec, and framerate using ffprobe.
// Returns a plain object — throws if the file is not a valid video.

export const extractMetadata = (filePath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        logger.error(`[FFmpeg] ffprobe failed for ${filePath}: ${err.message}`);
        return reject(new Error('Could not read video metadata. File may be corrupt or invalid.'));
      }

      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      const audioStream = data.streams.find((s) => s.codec_type === 'audio');

      if (!videoStream) {
        return reject(new Error('No video stream found. File is not a valid video.'));
      }

      // Parse framerate — stored as a fraction string e.g. "30/1" or "24000/1001"
      const fpsRaw = videoStream.r_frame_rate || '0/1';
      const [num, den] = fpsRaw.split('/').map(Number);
      const fps = den ? parseFloat((num / den).toFixed(2)) : 0;

      resolve({
        duration: parseFloat(parseFloat(data.format.duration || 0).toFixed(2)),
        fileSize: parseInt(data.format.size || 0, 10),
        bitrate: parseInt(data.format.bit_rate || 0, 10),
        resolution: {
          width: videoStream.width || 0,
          height: videoStream.height || 0,
        },
        codec: videoStream.codec_name || 'unknown',
        fps,
        hasAudio: !!audioStream,
        formatName: data.format.format_name || 'unknown',
      });
    });
  });

// ─── 2. Thumbnail Generation ───────────────────────────────────────────────
//
// Captures one frame at the 1-second mark and saves it as a .jpg.
// Returns the relative path to the thumbnail file.
// Falls back gracefully — if generation fails, returns null (not a fatal error).

export const generateThumbnail = (filePath, videoId) =>
  new Promise((resolve) => {
    const outputDir = path.resolve('uploads/thumbnails');
    const thumbnailName = `${videoId}.jpg`;
    const thumbnailPath = path.join(outputDir, thumbnailName);

    ensureDir(outputDir);

    ffmpeg(filePath)
      .on('end', () => {
        logger.debug(`[FFmpeg] Thumbnail created: ${thumbnailPath}`);
        resolve(`uploads/thumbnails/${thumbnailName}`);
      })
      .on('error', (err) => {
        // Non-fatal — the video still works without a thumbnail
        logger.warn(`[FFmpeg] Thumbnail generation failed for ${videoId}: ${err.message}`);
        resolve(null);
      })
      .screenshots({
        count: 1,
        timemarks: ['1'], // capture at 1 second
        filename: thumbnailName,
        folder: outputDir,
        size: '640x?', // 640px wide, height auto-calculated to keep aspect ratio
      });
  });

// ─── 3. Format Validation ──────────────────────────────────────────────────
//
// Confirms the file actually contains a valid video stream.
// Multer checks the MIME type header, but a user can rename any file to .mp4.
// This catches that by inspecting the real binary content.

export const validateVideoFile = async (filePath) => {
  try {
    const meta = await extractMetadata(filePath);
    if (!meta.resolution.width || !meta.resolution.height) {
      return { valid: false, reason: 'Video has no readable resolution.' };
    }
    if (meta.duration <= 0) {
      return { valid: false, reason: 'Video has zero duration.' };
    }
    return { valid: true, meta };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
};

// ─── 4. Frame Extraction ──────────────────────────────────────────────────
//
// Extracts one frame every N seconds and saves them as numbered .jpg files
// inside a per-video subfolder: uploads/frames/<videoId>/frame-001.jpg etc.
// Returns an array of absolute file paths to the extracted frames.
// Used to feed individual images into the sensitivity analyser.

export const extractFrames = (filePath, videoId, intervalSeconds = 5) =>
  new Promise((resolve, reject) => {
    const outputDir = path.resolve(`uploads/frames/${videoId}`);
    ensureDir(outputDir);

    ffmpeg(filePath)
      .on('end', () => {
        // The 'filenames' event only fires for screenshots(), not .output() patterns.
        // Read the directory after ffmpeg finishes to get the actual files.
        try {
          const files = fs.readdirSync(outputDir)
            .filter((f) => f.endsWith('.jpg'))
            .sort()
            .map((f) => path.join(outputDir, f));
          logger.debug(`[FFmpeg] Extracted ${files.length} frames for video ${videoId}`);
          resolve(files);
        } catch (err) {
          logger.warn(`[FFmpeg] Could not read frames dir for ${videoId}: ${err.message}`);
          resolve([]);
        }
      })
      .on('error', (err) => {
        logger.error(`[FFmpeg] Frame extraction failed for ${videoId}: ${err.message}`);
        reject(err);
      })
      .output(path.join(outputDir, 'frame-%03d.jpg')) // frame-001.jpg, frame-002.jpg …
      .outputOptions([
        `-vf fps=1/${intervalSeconds}`, // 1 frame per N seconds
        '-q:v 3',                        // JPEG quality (1=best, 31=worst)
        '-vframes 20',                   // hard cap at 20 frames max
      ])
      .run();
  });

// ─── 5. Cleanup Helper ────────────────────────────────────────────────────
//
// Removes the extracted frames folder after sensitivity analysis is done.
// Call this at the end of processSensitivity() to avoid filling the disk.

export const cleanupFrames = (videoId) => {
  const dir = path.resolve(`uploads/frames/${videoId}`);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.debug(`[FFmpeg] Cleaned up frames for video ${videoId}`);
  }
};
