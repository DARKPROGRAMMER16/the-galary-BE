import fs from 'fs';
import path from 'path';
import { body } from 'express-validator';
import Video from '../models/Video.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { processSensitivity } from '../services/sensitivity.service.js';

// --- Validation rules ---

export const uploadValidation = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('tags').optional().isString(),
];

// --- Handlers ---

export const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) return next(new ApiError(400, 'No video file provided.'));

    const { title, description, tags } = req.body;
    const tagsArray = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Step 1: Validate the file is actually a real video (not a renamed file)
    const { validateVideoFile } = await import('../services/ffmpeg.service.js');
    const validation = await validateVideoFile(req.file.path);

    if (!validation.valid) {
      fs.unlink(req.file.path, () => {});
      return next(new ApiError(400, `Invalid video file: ${validation.reason}`));
    }

    // Step 2: Save the video document with metadata from ffprobe
    const video = await Video.create({
      title,
      description,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      organisation: req.user.organisation,
      tags: tagsArray,
      duration: validation.meta.duration,
      resolution: validation.meta.resolution,
      codec: validation.meta.codec,
      fps: validation.meta.fps,
      bitrate: validation.meta.bitrate,
      hasAudio: validation.meta.hasAudio,
    });

    // Step 3: Generate thumbnail in the background — do not await
    const { generateThumbnail } = await import('../services/ffmpeg.service.js');
    generateThumbnail(req.file.path, video._id.toString()).then(async (thumbPath) => {
      if (thumbPath) {
        await Video.findByIdAndUpdate(video._id, { thumbnailPath: thumbPath });
      }
    });

    // Step 4: Kick off sensitivity processing in the background — do not await
    processSensitivity(video._id.toString(), req.user._id.toString());

    res
      .status(201)
      .json(new ApiResponse(201, { video }, 'Upload successful. Processing has started.'));
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    next(err);
  }
};

export const getVideos = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 12, sort = '-createdAt' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const filter = {};

    // Multi-tenancy isolation
    if (req.user.role !== 'admin') {
      filter.organisation = req.user.organisation;
    }

    // Status filter
    if (status && ['pending', 'processing', 'safe', 'flagged', 'error'].includes(status)) {
      filter.status = status;
    }

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .populate('uploadedBy', 'name email')
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Video.countDocuments(filter),
    ]);

    res.json(
      new ApiResponse(200, {
        videos,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      })
    );
  } catch (err) {
    next(err);
  }
};

export const getVideoById = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id).populate('uploadedBy', 'name email');
    if (!video) return next(new ApiError(404, 'Video not found.'));

    if (req.user.role !== 'admin' && video.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'Access denied.'));
    }

    res.json(new ApiResponse(200, { video }));
  } catch (err) {
    next(err);
  }
};

export const streamVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(new ApiError(404, 'Video not found.'));

    if (req.user.role !== 'admin' && video.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'Access denied.'));
    }

    if (!['safe', 'flagged'].includes(video.status)) {
      return next(new ApiError(400, 'Video is still processing and cannot be streamed yet.'));
    }

    const filePath = path.resolve(video.filePath);
    if (!fs.existsSync(filePath)) {
      return next(new ApiError(404, 'Video file not found on server.'));
    }

    const fileSize = fs.statSync(filePath).size;
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mimeType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': video.mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
};

export const updateVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(new ApiError(404, 'Video not found.'));

    const isOwner = String(video.uploadedBy) === String(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return next(new ApiError(403, 'Only the uploader or an admin can edit this video.'));
    }

    const { title, description, tags } = req.body;
    if (title) video.title = title;
    if (description !== undefined) video.description = description;
    if (tags) video.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);

    await video.save();
    res.json(new ApiResponse(200, { video }, 'Video updated.'));
  } catch (err) {
    next(err);
  }
};

export const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(new ApiError(404, 'Video not found.'));

    const isOwner = String(video.uploadedBy) === String(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return next(new ApiError(403, 'Only the uploader or an admin can delete this video.'));
    }

    video.isDeleted = true; // Soft delete
    await video.save();

    res.json(new ApiResponse(200, null, 'Video deleted.'));
  } catch (err) {
    next(err);
  }
};

export const getStats = async (req, res, next) => {
  try {
    const matchFilter =
      req.user.role === 'admin'
        ? { isDeleted: { $ne: true } }
        : { organisation: req.user.organisation, isDeleted: { $ne: true } };

    const stats = await Video.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
        },
      },
    ]);

    const result = {
      total: 0, safe: 0, flagged: 0,
      processing: 0, pending: 0, error: 0, totalSize: 0,
    };

    stats.forEach(({ _id, count, totalSize }) => {
      result[_id] = count;
      result.total += count;
      result.totalSize += totalSize;
    });

    res.json(new ApiResponse(200, { stats: result }));
  } catch (err) {
    next(err);
  }
};

// GET /api/videos/:id/thumbnail
// Serves the thumbnail .jpg file for the video library UI
export const serveThumbnail = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id).select('thumbnailPath organisation status');
    if (!video) return next(new ApiError(404, 'Video not found.'));

    if (req.user.role !== 'admin' && video.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'Access denied.'));
    }

    if (!video.thumbnailPath) {
      return next(new ApiError(404, 'Thumbnail not yet generated. Video may still be processing.'));
    }

    const thumbPath = path.resolve(video.thumbnailPath);
    if (!fs.existsSync(thumbPath)) {
      return next(new ApiError(404, 'Thumbnail file not found on server.'));
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache for 24 hours
    fs.createReadStream(thumbPath).pipe(res);
  } catch (err) {
    next(err);
  }
};
