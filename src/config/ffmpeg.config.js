import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import logger from '../utils/logger.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

logger.info(`FFmpeg path: ${ffmpegInstaller.path}`);
logger.info(`FFprobe path: ${ffprobeInstaller.path}`);

export default ffmpeg;
