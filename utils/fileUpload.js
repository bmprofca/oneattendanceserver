import generateString from './generateString.js';
import {
  getContentTypeFromFileName,
  uploadBufferToB2,
} from './b2Storage.js';
import { productionBaseDomain } from '../config/config.js';

const sanitizeFilename = (filename) =>
  String(filename ?? 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';

/**
 * Upload a server-generated file buffer to B2 and return a proxy download URL.
 */
export const uploadFileBuffer = async (buffer, filename, mimeType = 'application/pdf') => {
  const safeFilename = sanitizeFilename(filename);
  const objectKey = `${generateString(20)}_${safeFilename}`;
  const contentType = mimeType || getContentTypeFromFileName(safeFilename);

  await uploadBufferToB2(objectKey, buffer, contentType);

  return `${productionBaseDomain}/api/media/${encodeURIComponent(objectKey)}`;
};
