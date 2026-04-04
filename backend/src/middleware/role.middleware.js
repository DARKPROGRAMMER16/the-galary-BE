import ApiError from '../utils/ApiError.js';

// Usage: requireRole('admin') or requireRole('editor', 'admin')
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(
      new ApiError(403, `Access denied. Required role(s): ${roles.join(', ')}`)
    );
  }
  next();
};
