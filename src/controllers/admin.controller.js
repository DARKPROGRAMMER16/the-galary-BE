import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort('-createdAt').select('-password');
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

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return next(new ApiError(404, 'User not found.'));

    res.json(new ApiResponse(200, { user }, 'Role updated.'));
  } catch (err) {
    next(err);
  }
};

export const toggleUserStatus = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot deactivate yourself.'));
    }

    const user = await User.findById(req.params.id);
    if (!user) return next(new ApiError(404, 'User not found.'));

    user.isActive = !user.isActive;
    await user.save();

    const statusLabel = user.isActive ? 'activated' : 'deactivated';
    res.json(new ApiResponse(200, { user }, `User ${statusLabel}.`));
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot delete yourself.'));
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return next(new ApiError(404, 'User not found.'));

    res.json(new ApiResponse(200, null, 'User permanently deleted.'));
  } catch (err) {
    next(err);
  }
};
