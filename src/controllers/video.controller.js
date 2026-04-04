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
  body('storageKey').trim().notEmpty().withMessage('storageKey is required'),
  body('originalName').trim().notEmpty().withMessage('originalName is required'),
  body('fileSize').isNumeric().withMessage('fileSize must be a number'),
  body('mimeType').trim().notEmpty().withMessage('mimeType is required'),
];

// --- Handlers ---

export const uploadVideo = async (req, res, next) => {
  try {
    const {
      title,
      description,
      tags,
      storageKey,
      originalName,
      fileSize,
      mimeType,
      duration,
      resolution,
    } = req.body;

    const tagsArray = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const video = await Video.create({
      title,
      description,
      tags: tagsArray,
      storageKey,
      originalName,
      fileSize: Number(fileSize),
      mimeType,
      duration: duration ? Number(duration) : 0,
      resolution: resolution || { width: 0, height: 0 },
      uploadedBy: req.user._id,
      organisation: req.user.organisation,
    });

    // Kick off mock sensitivity processing in the background — do not await
    processSensitivity(video._id.toString(), req.user._id.toString());

    res
      .status(201)
      .json(new ApiResponse(201, { video }, 'Upload registered. Processing has started.'));
  } catch (err) {
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
