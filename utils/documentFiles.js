import path from 'path';

import generateString from './generateString.js';
import {
  getContentTypeFromExtension,
  getContentTypeFromFileName,
  uploadBufferToB2,
  deleteB2Object,
} from './b2Storage.js';

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

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

  return MIME_EXTENSION_MAP[String(contentType ?? '').toLowerCase()] || '';
};

export const removeSavedDocumentFile = async (objectKey) => {
  if (objectKey) {
    await deleteB2Object(objectKey);
  }
};

export const downloadPlatformDocument = async ({ url, prefix = 'documents' }) => {
  const trimmedUrl = String(url ?? '').trim();

  if (!trimmedUrl) {
    throw new Error('Document url is required');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error(`Invalid document url: ${trimmedUrl}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported document url protocol: ${parsedUrl.protocol}`);
  }

  const response = await fetch(trimmedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download document (${response.status}) from ${trimmedUrl}`);
  }

  const contentType = response.headers.get('content-type');
  const extension = resolveExtension(trimmedUrl, contentType) || '.bin';

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileSize = buffer.length;

  if (fileSize <= 0) {
    throw new Error('Downloaded document is empty');
  }

  const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;
  const baseName = `${generateString(30)}${cleanExt}`;
  const objectKey = prefix ? `${prefix}/${baseName}` : baseName;

  await uploadBufferToB2(
    objectKey,
    buffer,
    contentType || getContentTypeFromFileName(objectKey),
  );

  return {
    fileName: objectKey,
    objectKey,
    size: fileSize,
  };
};

export default {
  downloadPlatformDocument,
  removeSavedDocumentFile,
};
