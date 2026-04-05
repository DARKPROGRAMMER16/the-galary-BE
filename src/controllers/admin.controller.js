import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

// All handlers are scoped to req.user.organisation.
// Superadmin cross-org operations live in superadmin.controller.js.

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({
      organisation: req.user.organisation,
      role: { $ne: 'superadmin' },
    })
      .sort('-createdAt')
      .select('-password');

    res.json(new ApiResponse(200, { users }));
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return next(new ApiError(400, 'Invalid role. Must be viewer, editor, or admin.'));
    }
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot change your own role.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'You can only manage users in your organisation.'));
    }

    target.role = role;
    await target.save();

    res.json(new ApiResponse(200, { user: target }, 'Role updated.'));
  } catch (err) {
    next(err);
  }
};

export const toggleUserStatus = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot deactivate yourself.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'You can only manage users in your organisation.'));
    }

    target.isActive = !target.isActive;
    await target.save();

    const statusLabel = target.isActive ? 'activated' : 'deactivated';
    res.json(new ApiResponse(200, { user: target }, `User ${statusLabel}.`));
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot delete yourself.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));
    if (target.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'You can only manage users in your organisation.'));
    }

    await User.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'User permanently deleted.'));
  } catch (err) {
    next(err);
  }
};
