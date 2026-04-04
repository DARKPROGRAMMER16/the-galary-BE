import { ImageKit, toFile } from '@imagekit/nodejs';
import fs from 'fs';
import logger from '../utils/logger.js';

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/**
 * Upload a local file to ImageKit.
 * Returns { url, fileId } on success, throws on failure.
 */
export const uploadFile = async (localPath, fileName, folder = '/') => {
  const stream = fs.createReadStream(localPath);
  const uploadable = await toFile(stream, fileName);

  const result = await imagekit.files.upload({
    file: uploadable,
    fileName,
    folder,
  });

  logger.info(`[ImageKit] Uploaded ${fileName} → ${result.url}`);
  return { url: result.url, fileId: result.fileId };
};

/**
 * Delete a file from ImageKit by its fileId.
 * Non-fatal — logs a warning on failure.
 */
export const deleteFile = async (fileId) => {
  try {
    await imagekit.files.delete(fileId);
    logger.info(`[ImageKit] Deleted fileId ${fileId}`);
  } catch (err) {
    logger.warn(`[ImageKit] Failed to delete fileId ${fileId}: ${err.message}`);
  }
};
