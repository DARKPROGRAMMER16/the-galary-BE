import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

// GET /api/org/users — editor-level: own org users only (no superadmins shown)
export const getOrgUsers = async (req, res, next) => {
  try {
    const org = req.query.organisation || req.user.organisation;

    // Only superadmin may query a different org; editors are locked to own org
    if (req.user.role === 'editor' && org !== req.user.organisation) {
      return next(new ApiError(403, 'Access denied.'));
    }

    const users = await User.find({
      organisation: org,
      role: { $ne: 'superadmin' },
    })
      .sort('-createdAt')
      .select('-password');

    res.json(new ApiResponse(200, { users }));
  } catch (err) {
    next(err);
  }
};

// DELETE /api/org/users/:id — editor can delete viewers/editors in their org (not admins)
export const deleteOrgUser = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot delete yourself.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));

    if (target.organisation !== req.user.organisation) {
      return next(new ApiError(403, 'You can only delete users in your organisation.'));
    }
    if (['admin', 'superadmin'].includes(target.role)) {
      return next(new ApiError(403, 'Editors cannot delete admin or superadmin users.'));
    }

    await User.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'User deleted.'));
  } catch (err) {
    next(err);
  }
};
