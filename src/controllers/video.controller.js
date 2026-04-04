import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Video from '../models/Video.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { processSensitivity } from '../services/sensitivity.service.js';
import { uploadFile, deleteFile } from '../services/imagekit.service.js';
import { validateVideoFile, generateThumbnail } from '../services/ffmpeg.service.js';

// ─── Upload ────────────────────────────────────────────────────────────────

export const uploadVideo = async (req, res, next) => {
  let tempThumbPath = null;

  try {
    if (!req.file) return next(new ApiError(400, 'No video file provided.'));

    const { title, description, tags } = req.body;
    if (!title?.trim()) {
      fs.unlink(req.file.path, () => {});
      return next(new ApiError(400, 'Title is required.'));
    }

    // 1. Validate the file is a real video and extract metadata
    const validation = await validateVideoFile(req.file.path);
    if (!validation.valid) {
      fs.unlink(req.file.path, () => {});
      return next(new ApiError(400, `Invalid video file: ${validation.reason}`));
    }

    // 2. Generate thumbnail with ffmpeg (temp local file)
    const tempId = uuidv4();
    tempThumbPath = await generateThumbnail(req.file.path, tempId);

    // 3. Upload video to ImageKit
    const videoResult = await uploadFile(
      req.file.path,
      req.file.originalname,
      '/galary/videos'
    );

    // 4. Upload thumbnail to ImageKit (if generated)
    let thumbnailUrl = null;
    let imagekitThumbnailFileId = null;
    const resolvedThumbPath = tempThumbPath ? path.resolve(tempThumbPath) : null;

    if (resolvedThumbPath && fs.existsSync(resolvedThumbPath)) {
      const thumbResult = await uploadFile(
        resolvedThumbPath,
        `${videoResult.fileId}_thumb.jpg`,
        '/galary/thumbnails'
      );
      thumbnailUrl = thumbResult.url;
      imagekitThumbnailFileId = thumbResult.fileId;
    }

    // 5. Cleanup temp files
    fs.unlink(req.file.path, () => {});
    if (resolvedThumbPath && fs.existsSync(resolvedThumbPath)) {
      fs.unlink(resolvedThumbPath, () => {});
    }

    // 6. Save metadata to MongoDB
    const tagsArray = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const video = await Video.create({
      title: title.trim(),
      description: description?.trim() ?? '',
      tags: tagsArray,
      videoUrl: videoResult.url,
      thumbnailUrl,
      imagekitFileId: videoResult.fileId,
      imagekitThumbnailFileId,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      duration: validation.meta.duration,
      resolution: validation.meta.resolution,
      codec: validation.meta.codec,
      fps: validation.meta.fps,
      bitrate: validation.meta.bitrate,
      hasAudio: validation.meta.hasAudio,
      uploadedBy: req.user._id,
      organisation: req.user.organisation,
    });

    // 7. Kick off mock sensitivity analysis in the background
    processSensitivity(video._id.toString(), req.user._id.toString());

    res
      .status(201)
      .json(new ApiResponse(201, { video }, 'Upload successful. Processing has started.'));
  } catch (err) {
    // Clean up temp files on any error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    if (tempThumbPath) {
      const resolved = path.resolve(tempThumbPath);
      if (fs.existsSync(resolved)) fs.unlink(resolved, () => {});
    }
    next(err);
  }
};

// ─── List & single ─────────────────────────────────────────────────────────

export const getVideos = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 12, sort = '-createdAt' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const filter = {};

    if (req.user.role !== 'admin') {
      filter.organisation = req.user.organisation;
    }

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

// ─── Update ────────────────────────────────────────────────────────────────

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

// ─── Delete ────────────────────────────────────────────────────────────────

export const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(new ApiError(404, 'Video not found.'));

    const isOwner = String(video.uploadedBy) === String(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return next(new ApiError(403, 'Only the uploader or an admin can delete this video.'));
    }

    // Async cleanup from ImageKit — non-blocking, non-fatal
    if (video.imagekitFileId) deleteFile(video.imagekitFileId);
    if (video.imagekitThumbnailFileId) deleteFile(video.imagekitThumbnailFileId);

    video.isDeleted = true;
    await video.save();

    res.json(new ApiResponse(200, null, 'Video deleted.'));
  } catch (err) {
    next(err);
  }
};

// ─── Stats ─────────────────────────────────────────────────────────────────

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
