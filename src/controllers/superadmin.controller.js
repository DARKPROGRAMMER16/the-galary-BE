import User from '../models/User.model.js';
import Video from '../models/Video.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { deleteFile } from '../services/imagekit.service.js';

// ─── Organisations ─────────────────────────────────────────────────────────

// GET /api/superadmin/organisations
// Returns each distinct organisation with member + video counts.
export const getOrganisations = async (req, res, next) => {
  try {
    const [userAgg, videoAgg] = await Promise.all([
      User.aggregate([
        { $match: { role: { $ne: 'superadmin' }, organisation: { $ne: '' } } },
        { $group: { _id: '$organisation', memberCount: { $sum: 1 } } },
      ]),
      Video.aggregate([
        { $match: { isDeleted: { $ne: true }, organisation: { $ne: '' } } },
        { $group: { _id: '$organisation', videoCount: { $sum: 1 } } },
      ]),
    ]);

    const videoMap = Object.fromEntries(videoAgg.map((v) => [v._id, v.videoCount]));

    const organisations = userAgg
      .map((u) => ({
        name: u._id,
        memberCount: u.memberCount,
        videoCount: videoMap[u._id] ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(new ApiResponse(200, { organisations }));
  } catch (err) {
    next(err);
  }
};

// ─── Users ─────────────────────────────────────────────────────────────────

// GET /api/superadmin/organisations/:org/users
export const getOrgUsers = async (req, res, next) => {
  try {
    const users = await User.find({
      organisation: req.params.org,
      role: { $ne: 'superadmin' },
    })
      .sort('-createdAt')
      .select('-password');

    res.json(new ApiResponse(200, { users }));
  } catch (err) {
    next(err);
  }
};

// PATCH /api/superadmin/users/:id/role
export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return next(new ApiError(400, 'Invalid role. Must be viewer, editor, or admin.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.role === 'superadmin') {
      return next(new ApiError(403, 'Cannot change superadmin role.'));
    }

    target.role = role;
    await target.save();
    res.json(new ApiResponse(200, { user: target }, 'Role updated.'));
  } catch (err) {
    next(err);
  }
};

// PATCH /api/superadmin/users/:id/toggle
export const toggleUserStatus = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.role === 'superadmin') {
      return next(new ApiError(403, 'Cannot deactivate a superadmin.'));
    }

    target.isActive = !target.isActive;
    await target.save();

    const label = target.isActive ? 'activated' : 'deactivated';
    res.json(new ApiResponse(200, { user: target }, `User ${label}.`));
  } catch (err) {
    next(err);
  }
};

// DELETE /api/superadmin/users/:id
export const deleteUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.role === 'superadmin') {
      return next(new ApiError(403, 'Cannot delete a superadmin.'));
    }

    await User.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'User permanently deleted.'));
  } catch (err) {
    next(err);
  }
};

// ─── Videos ────────────────────────────────────────────────────────────────

// GET /api/superadmin/organisations/:org/videos
export const getOrgVideos = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const filter = { organisation: req.params.org };

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
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      })
    );
  } catch (err) {
    next(err);
  }
};

// DELETE /api/superadmin/videos/:id
export const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(new ApiError(404, 'Video not found.'));

    if (video.imagekitFileId) deleteFile(video.imagekitFileId);
    if (video.imagekitThumbnailFileId) deleteFile(video.imagekitThumbnailFileId);

    video.isDeleted = true;
    await video.save();

    res.json(new ApiResponse(200, null, 'Video deleted.'));
  } catch (err) {
    next(err);
  }
};
