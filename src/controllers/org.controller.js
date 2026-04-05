import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

// GET /api/org/users
// Editor: returns users in their own organisation.
// Admin: returns users in the organisation specified by ?organisation= query param,
//        falling back to the admin's own organisation.
export const getOrgUsers = async (req, res, next) => {
  try {
    const org =
      req.user.role === 'admin'
        ? (req.query.organisation || req.user.organisation)
        : req.user.organisation;

    const users = await User.find({ organisation: org }).sort('-createdAt').select('-password');
    res.json(new ApiResponse(200, { users }));
  } catch (err) {
    next(err);
  }
};

// DELETE /api/org/users/:id
// Editor: can delete viewers/editors in their own org (not admins, not themselves).
// Admin: can delete anyone in any org (but not themselves).
export const deleteOrgUser = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return next(new ApiError(400, 'You cannot delete yourself.'));
    }

    const target = await User.findById(req.params.id);
    if (!target) return next(new ApiError(404, 'User not found.'));

    if (req.user.role === 'editor') {
      if (target.organisation !== req.user.organisation) {
        return next(new ApiError(403, 'You can only delete users in your organisation.'));
      }
      if (target.role === 'admin') {
        return next(new ApiError(403, 'Editors cannot delete admin users.'));
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'User deleted.'));
  } catch (err) {
    next(err);
  }
};
