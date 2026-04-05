import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes.js';
import videoRoutes from './routes/video.routes.js';
import adminRoutes from './routes/admin.routes.js';
import orgRoutes from './routes/org.routes.js';
import superadminRoutes from './routes/superadmin.routes.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import logger from './utils/logger.js';

const app = express();

// --- Security headers ---
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- CORS ---
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
);

// --- Rate limiting ---
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Try again later.' },
  })
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
  })
);

// --- Request logging ---
app.use(morgan('dev', { stream: { write: (msg) => logger.http(msg.trim()) } }));

// --- Body parsing ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/superadmin', superadminRoutes);

// --- 404 + global error handler (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;
