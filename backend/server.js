import 'dotenv/config';
import './src/config/ffmpeg.config.js';
import http from 'http';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { initSocket } from './src/config/socket.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`Health check → http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
    httpServer.close(() => process.exit(1));
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    httpServer.close(() => process.exit(0));
  });
};

startServer();
