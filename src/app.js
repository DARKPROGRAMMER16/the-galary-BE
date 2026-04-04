import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import pathModule from 'path';
import authRoutes from './routes/auth.routes.js';
import videoRoutes from './routes/video.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import logger from './utils/logger.js';

const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));

const app = express();

// --- Security headers ---
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- CORS ---
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

// --- Static thumbnails (no auth, cacheable) ---
// Access via: GET /thumbnails/<videoId>.jpg
app.use(
  '/thumbnails',
  express.static(pathModule.join(__dirname, '../uploads/thumbnails'), {
    maxAge: '1d',
    immutable: true,
  })
);

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/admin', adminRoutes);

// --- 404 + global error handler (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;
