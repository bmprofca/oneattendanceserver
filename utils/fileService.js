import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import generateString from './generateString.js';
import {
  uploadBufferToB2,
  getContentTypeFromFileName,
  getContentTypeFromExtension,
} from './b2Storage.js';
import { buildProxyUrl } from './media.js';
import { SERVER_BASE_URL, NODE_ENV, productionBaseDomain } from '../config/config.js';

const BASE_URL =
  productionBaseDomain ||
  (NODE_ENV === 'production'
    ? SERVER_BASE_URL || 'https://oneattendanceserver.onesaas.in'
    : 'http://localhost:7736');

const MAX_SIZE_MB = 25;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
];

const MIME_EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

function generateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sanitizeFileName(name) {
  return String(name ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function validateFileSignature(buffer, mime) {
  if (buffer.length < 4) {
    return false;
  }

  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }

  if (mime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50;
  }

  if (mime === 'image/webp') {
    return buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  if (mime === 'application/pdf') {
    return buffer.toString('ascii', 0, 4) === '%PDF';
  }

  if (mime === 'text/plain' || mime === 'text/csv') {
    return true;
  }

  if (
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('excel')
  ) {
    return true;
  }

  if (mime.includes('zip')) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  return true;
}

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl ?? '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

/**
 * Save media from an external URL or data URL and store it directly in Backblaze B2.
 * Preserves compatibility with existing routes expecting { success, file_name, file_url, ... }
 */
export const saveMediaFromUrl = async ({
  url,
  folder = 'common',
  optimizeImage = true,
}) => {
  try {
    if (!url) {
      throw new Error('URL required');
    }

    const trimmed = String(url).trim();
    let buffer;
    let mimeType;

    const parsedDataUrl = parseDataUrl(trimmed);
    if (parsedDataUrl) {
      buffer = parsedDataUrl.buffer;
      mimeType = parsedDataUrl.mimeType;
    } else {
      let headResponse;
      try {
        headResponse = await axios.head(trimmed, {
          timeout: 5000,
          maxRedirects: 5,
        });
      } catch {
        headResponse = await axios.get(trimmed, {
          timeout: 5000,
        });
      }

      if (headResponse.status !== 200) {
        throw new Error('Unable to access file');
      }

      mimeType = headResponse.headers['content-type']?.split(';')[0]?.toLowerCase();

      if (!mimeType) {
        throw new Error('Unknown file type');
      }

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      const fileResponse = await axios.get(trimmed, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxRedirects: 5,
      });

      buffer = Buffer.from(fileResponse.data);
    }

    const sizeBytes = buffer.length;
    if (sizeBytes > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File exceeds ${MAX_SIZE_MB}MB`);
    }

    const validSignature = validateFileSignature(buffer, mimeType);
    if (!validSignature) {
      throw new Error('File signature mismatch');
    }

    const hash = generateHash(buffer);
    const isImage = mimeType.startsWith('image/');
    let width = null;
    let height = null;
    let optimized = false;
    let ext = MIME_EXT_MAP[mimeType] || 'bin';

    if (isImage && optimizeImage) {
      try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        width = metadata.width;
        height = metadata.height;

        buffer = await image
          .rotate()
          .jpeg({
            quality: 85,
            mozjpeg: true,
          })
          .toBuffer();

        ext = 'jpg';
        mimeType = 'image/jpeg';
        optimized = true;
      } catch (sharpErr) {
        console.warn('Image optimization skipped:', sharpErr.message);
      }
    }

    const randomStr = generateString(16);
    const fileName = sanitizeFileName(`${Date.now()}-${randomStr}.${ext}`);
    const year = new Date().getFullYear();
    const cleanFolder = String(folder ?? 'common').replace(/^\/+|\/+$/g, '');
    const objectKey = `${cleanFolder}/${year}/${fileName}`;

    // Upload to Backblaze B2 storage
    await uploadBufferToB2(objectKey, buffer, mimeType);

    return {
      success: true,
      file_name: fileName,
      object_key: objectKey,
      file_url: objectKey,
      mime_type: mimeType,
      size_bytes: buffer.length,
      size_kb: Number((buffer.length / 1024).toFixed(2)),
      hash,
      is_image: isImage,
      optimized,
      width,
      height,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'File processing failed',
    };
  }
};

/**
 * Universal file URL builder.
 * Resolves B2 object keys into proxy media URLs, while preserving
 * legacy '/uploads/...' paths and external HTTP(S) URLs.
 */
export function buildFileUrl(storedValue, req = null) {
  if (!storedValue) {
    return null;
  }

  const raw = String(storedValue).trim();
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const base = req
    ? `${req.protocol}://${req.get('host')}`
    : BASE_URL;

  // Preserve legacy local file uploads
  if (raw.startsWith('/uploads/')) {
    return `${base}${raw}`;
  }

  // Stored B2 objectKey -> generate proxy URL
  const cleanKey = raw.replace(/^\/+/, '');
  return `${base}/api/media/${encodeURIComponent(cleanKey)}`;
}

export default {
  saveMediaFromUrl,
  buildFileUrl,
};
