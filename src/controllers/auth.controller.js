import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import User from '../models/User.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

// --- Validation rules ---

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 50 }),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('organisation').trim().notEmpty().withMessage('Organisation is required'),
  body('role')
    .optional()
    .isIn(['viewer', 'editor', 'admin'])
    .withMessage('Role must be viewer, editor, or admin'),
  // superadmin cannot be created via the public registration endpoint
];

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// --- Handlers ---

export const register = async (req, res, next) => {
  try {
    const { name, email, password, organisation, role } = req.body;

    if (role === 'superadmin') {
      return next(new ApiError(403, 'Cannot register as superadmin.'));
    }

    const existing = await User.findOne({ email });
    if (existing) return next(new ApiError(409, 'Email is already registered.'));

    const user = await User.create({
      name,
      email,
      password,
      organisation,
      role: role || 'viewer',
    });

    const token = signToken({
      userId: user._id,
      role: user.role,
      organisation: user.organisation,
    });

    res.status(201).json(new ApiResponse(201, { user, token }, 'Registration successful'));
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return next(new ApiError(401, 'Invalid email or password.'));
    }

    if (!user.isActive) {
      return next(new ApiError(403, 'Account is deactivated. Contact your admin.'));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken({
      userId: user._id,
      role: user.role,
      organisation: user.organisation,
    });

    res.json(new ApiResponse(200, { user, token }, 'Login successful'));
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    res.json(new ApiResponse(200, { user: req.user }));
  } catch (err) {
    next(err);
  }
};
