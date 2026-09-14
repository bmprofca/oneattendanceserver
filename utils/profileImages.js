import path from 'path';

import generateString from './generateString.js';
import {
  getContentTypeFromFileName,
  uploadBufferToB2,
  deleteB2Object,
  deleteB2ObjectsByPrefix,
  isB2Configured,
} from './b2Storage.js';
import { MEDIA_PREFIXES } from './media.js';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limit

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const normalizeExtension = value =>
  String(value ?? '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();

const getExtensionFromUrl = url => {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext ? ext.toLowerCase() : '';
  } catch {
    return '';
  }
};

const resolveExtension = (url, contentType) => {
  const urlExtension = getExtensionFromUrl(url);
  if (urlExtension) {
    return urlExtension;
  }

  return MIME_EXTENSION_MAP[String(contentType ?? '').toLowerCase()] || '.jpg';
};

export const parseDataUrl = dataUrl => {
  const match = String(dataUrl ?? '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const joinObjectKey = (prefix, name) => {
  const key = String(name ?? '').replace(/^\/+/, '');
  return prefix ? `${prefix}/${key}` : key;
};

const sanitizeObjectKeyBaseName = (name) => {
  const sanitized = String(name ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);

  if (!sanitized) {
    throw new Error('Invalid identifier for image storage');
  }

  return sanitized;
};

const buildObjectKey = (prefix, extension, objectKeyBaseName = null) => {
  const normalizedExtension = normalizeExtension(extension);
  const safeExtension = normalizedExtension === 'jpeg' ? 'jpg' : normalizedExtension;
  const allowed = ['jpg', 'png', 'webp', 'gif'];

  if (!allowed.includes(safeExtension)) {
    throw new Error('Image must be JPG, PNG, WEBP, or GIF');
  }

  const fileName = objectKeyBaseName
    ? `${sanitizeObjectKeyBaseName(objectKeyBaseName)}.${safeExtension}`
    : `${generateString(30)}.${safeExtension}`;

  return joinObjectKey(prefix, fileName);
};

export const extractObjectKey = (value, prefix) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname);
      if (prefix) {
        const marker = `/file/${prefix}/`;
        const markerIndex = pathname.indexOf(marker);
        if (markerIndex >= 0) {
          return pathname.slice(markerIndex + marker.length).split('?')[0] || null;
        }
      }

      const mediaMarker = '/api/media/';
      const mediaIndex = pathname.indexOf(mediaMarker);
      if (mediaIndex >= 0) {
        return decodeURIComponent(pathname.slice(mediaIndex + mediaMarker.length).split('?')[0]) || null;
      }

      const directMediaMarker = '/media/';
      const directMediaIndex = pathname.indexOf(directMediaMarker);
      if (directMediaIndex >= 0) {
        return decodeURIComponent(pathname.slice(directMediaIndex + directMediaMarker.length).split('?')[0]) || null;
      }

      const segments = pathname.split('/').filter(Boolean);
      const fileName = segments[segments.length - 1];
      return fileName ? joinObjectKey(prefix, fileName.split('?')[0]) : null;
    } catch {
      return null;
    }
  }

  if (raw.includes('/')) {
    return raw.replace(/^\/+/, '').split('?')[0] || null;
  }

  return joinObjectKey(prefix, raw.split('?')[0]);
};

export const uploadImageBufferToB2 = async ({
  buffer,
  contentType,
  prefix = MEDIA_PREFIXES.profilePicture,
  objectKeyBaseName = null,
  url = '',
  oldObjectKey = null,
}) => {
  if (!buffer?.length) {
    throw new Error('Image file is empty');
  }

  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error('Image exceeds maximum size of 10 MB');
  }

  const extension = resolveExtension(url, contentType);
  const objectKey = buildObjectKey(prefix, extension, objectKeyBaseName);

  if (objectKeyBaseName) {
    const deletePrefix = joinObjectKey(prefix, sanitizeObjectKeyBaseName(objectKeyBaseName) + '.');
    await deleteB2ObjectsByPrefix(deletePrefix);
  } else if (oldObjectKey && oldObjectKey !== objectKey) {
    await deleteB2Object(oldObjectKey);
  }

  await uploadBufferToB2(objectKey, buffer, contentType || getContentTypeFromFileName(objectKey));

  return { objectKey, size: buffer.length };
};

export const uploadImageFromUrlToB2 = async (
  url,
  prefix = MEDIA_PREFIXES.profilePicture,
  objectKeyBaseName = null,
  oldObjectKey = null
) => {
  const trimmedUrl = String(url ?? '').trim();
  if (!trimmedUrl) {
    throw new Error('Image url is required');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error(`Invalid image url: ${trimmedUrl}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported image url protocol: ${parsedUrl.protocol}`);
  }

  const response = await fetch(trimmedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadImageBufferToB2({
    buffer,
    contentType,
    prefix,
    objectKeyBaseName,
    url: trimmedUrl,
    oldObjectKey,
  });
};

export const resolveProfileImageInput = async (
  imageValue,
  currentObjectKey = null,
  prefix = MEDIA_PREFIXES.profilePicture,
  objectKeyBaseName = null,
) => {
  if (imageValue === undefined) {
    return currentObjectKey;
  }

  const raw = String(imageValue ?? '').trim();
  if (!raw) {
    if (currentObjectKey) {
      if (objectKeyBaseName) {
        const deletePrefix = joinObjectKey(prefix, sanitizeObjectKeyBaseName(objectKeyBaseName) + '.');
        await deleteB2ObjectsByPrefix(deletePrefix);
      } else {
        await deleteB2Object(currentObjectKey);
      }
    }
    return null;
  }

  const parsedDataUrl = parseDataUrl(raw);
  if (parsedDataUrl) {
    const { objectKey } = await uploadImageBufferToB2({
      buffer: parsedDataUrl.buffer,
      contentType: parsedDataUrl.contentType,
      prefix,
      objectKeyBaseName,
      oldObjectKey: currentObjectKey,
    });
    return objectKey;
  }

  const existingKey = extractObjectKey(raw, prefix);
  if (existingKey && !/^https?:\/\//i.test(raw)) {
    return existingKey;
  }

  if (/^https?:\/\//i.test(raw)) {
    const extractedKey = extractObjectKey(raw, prefix);
    if (extractedKey && currentObjectKey && extractedKey === currentObjectKey) {
      return currentObjectKey;
    }

    if (isB2Configured()) {
      const { objectKey } = await uploadImageFromUrlToB2(raw, prefix, objectKeyBaseName, currentObjectKey);
      return objectKey;
    }

    return raw;
  }

  return existingKey;
};

export const resolveUserProfileImageInput = (
  imageValue,
  currentObjectKey = null,
  identifier = null,
) => resolveProfileImageInput(imageValue, currentObjectKey, MEDIA_PREFIXES.profilePicture, identifier);

export const downloadProfileImage = async (url, prefix = MEDIA_PREFIXES.profilePicture) => {
  const { objectKey, size } = await uploadImageFromUrlToB2(url, prefix);
  return { fileName: objectKey, size };
};
