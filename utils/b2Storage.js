import crypto from 'crypto';

import axios from 'axios';

import {
  B2_BUCKET,
  B2_ACCESS_KEY,
  B2_SECRET_KEY,
  B2_DOWNLOAD_AUTH_TTL_SECONDS,
} from '../config/config.js';

let authCache = null;
let bucketIdCache = null;

const DEFAULT_DOWNLOAD_AUTH_TTL_SECONDS = 86400;
const MAX_DOWNLOAD_AUTH_TTL_SECONDS = 604800;

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function isB2Configured() {
  return Boolean(B2_BUCKET && B2_ACCESS_KEY && B2_SECRET_KEY);
}

export function assertB2Configured() {
  if (!isB2Configured()) {
    throw new Error('Backblaze B2 storage is not configured in config/config.js');
  }
}

async function authorizeB2() {
  if (authCache && authCache.expires > Date.now()) {
    return authCache;
  }

  const credentials = Buffer.from(`${B2_ACCESS_KEY}:${B2_SECRET_KEY}`).toString('base64');

  const { data } = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  });

  authCache = {
    apiUrl: data.apiUrl,
    authToken: data.authorizationToken,
    downloadUrl: String(data.downloadUrl || '').replace(/\/$/, ''),
    accountId: data.accountId,
    expires: Date.now() + 22 * 60 * 60 * 1000,
  };

  return authCache;
}

async function getBucketId() {
  if (bucketIdCache) {
    return bucketIdCache;
  }

  const auth = await authorizeB2();
  const { data } = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_list_buckets`,
    {
      accountId: auth.accountId,
      bucketName: B2_BUCKET,
    },
    { headers: { Authorization: auth.authToken } },
  );

  const bucket =
    data.buckets?.find(item => item.bucketName === B2_BUCKET) || data.buckets?.[0];

  if (!bucket?.bucketId) {
    throw new Error(`B2 bucket not found: ${B2_BUCKET}`);
  }

  bucketIdCache = bucket.bucketId;
  return bucketIdCache;
}

function getDownloadAuthTtlSeconds() {
  const configured = Number(B2_DOWNLOAD_AUTH_TTL_SECONDS);
  const ttl =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_DOWNLOAD_AUTH_TTL_SECONDS;

  return Math.min(Math.max(Math.floor(ttl), 60), MAX_DOWNLOAD_AUTH_TTL_SECONDS);
}

function encodeB2FilePath(objectKey) {
  return objectKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

let bucketDownloadAuth = null;

async function getDownloadAuthorization() {
  if (bucketDownloadAuth && bucketDownloadAuth.expires > Date.now() + 60_000) {
    return bucketDownloadAuth.token;
  }

  const validDurationInSeconds = getDownloadAuthTtlSeconds();
  const auth = await authorizeB2();
  const bucketId = await getBucketId();

  const { data } = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId,
      fileNamePrefix: '',
      validDurationInSeconds,
    },
    { headers: { Authorization: auth.authToken } },
  );

  bucketDownloadAuth = {
    token: data.authorizationToken,
    expires: Date.now() + validDurationInSeconds * 1000,
  };

  return bucketDownloadAuth.token;
}

export function getContentTypeFromExtension(ext) {
  const normalized = String(ext ?? '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  return MIME_BY_EXTENSION[normalized] || 'application/octet-stream';
}

export function getContentTypeFromFileName(fileName) {
  const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
  return getContentTypeFromExtension(ext);
}

/**
 * Upload a buffer to B2. Returns the object key stored in the bucket.
 */
export async function uploadBufferToB2(objectKey, buffer, contentType) {
  assertB2Configured();

  const auth = await authorizeB2();
  const bucketId = await getBucketId();

  const { data: uploadData } = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId },
    { headers: { Authorization: auth.authToken } },
  );

  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');

  await axios.post(uploadData.uploadUrl, buffer, {
    headers: {
      Authorization: uploadData.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(objectKey),
      'Content-Type': contentType || 'application/octet-stream',
      'X-Bz-Content-Sha1': sha1,
      'Content-Length': buffer.length,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return objectKey;
}

/**
 * Returns a time-limited authorized download URL for a private B2 object.
 */
function extractB2ObjectKeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    const marker = `/file/${B2_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx >= 0) {
      const raw = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
      return raw || null;
    }
  } catch { /* not a valid URL */ }
  return null;
}

export async function getSignedB2DownloadUrl(objectKey) {
  if (!objectKey) {
    return null;
  }

  if (/^https?:\/\//i.test(objectKey)) {
    const extracted = extractB2ObjectKeyFromUrl(objectKey);
    if (extracted) {
      return getSignedB2DownloadUrl(extracted);
    }
    return objectKey;
  }

  assertB2Configured();

  const auth = await authorizeB2();
  const downloadToken = await getDownloadAuthorization();
  const encodedPath = encodeB2FilePath(objectKey);

  return `${auth.downloadUrl}/file/${B2_BUCKET}/${encodedPath}?Authorization=${downloadToken}`;
}

/**
 * Delete all versions of a file in B2 by its exact name.
 * Silently succeeds if the file does not exist.
 */
export async function deleteB2Object(objectKey) {
  if (!objectKey) return;
  assertB2Configured();

  const auth = await authorizeB2();
  const bucketId = await getBucketId();

  try {
    const { data } = await axios.post(
      `${auth.apiUrl}/b2api/v2/b2_list_file_names`,
      {
        bucketId,
        prefix: objectKey,
        maxFileCount: 10,
      },
      { headers: { Authorization: auth.authToken } },
    );

    const matches = (data.files || []).filter(f => f.fileName === objectKey);
    for (const file of matches) {
      await axios.post(
        `${auth.apiUrl}/b2api/v2/b2_delete_file_version`,
        { fileName: file.fileName, fileId: file.fileId },
        { headers: { Authorization: auth.authToken } },
      );
    }
  } catch (err) {
    console.error(`B2 delete failed for "${objectKey}":`, err.message);
  }
}

/**
 * Delete all B2 files whose name starts with the given prefix.
 * Useful for cleaning up old profile images when the extension changes.
 */
export async function deleteB2ObjectsByPrefix(prefix) {
  if (!prefix) return;
  assertB2Configured();

  const auth = await authorizeB2();
  const bucketId = await getBucketId();

  try {
    const { data } = await axios.post(
      `${auth.apiUrl}/b2api/v2/b2_list_file_names`,
      {
        bucketId,
        prefix,
        maxFileCount: 20,
      },
      { headers: { Authorization: auth.authToken } },
    );

    for (const file of data.files || []) {
      await axios.post(
        `${auth.apiUrl}/b2api/v2/b2_delete_file_version`,
        { fileName: file.fileName, fileId: file.fileId },
        { headers: { Authorization: auth.authToken } },
      );
    }
  } catch (err) {
    console.error(`B2 prefix delete failed for "${prefix}":`, err.message);
  }
}

export async function initB2Storage() {
  if (!isB2Configured()) {
    return false;
  }

  await authorizeB2();
  return true;
}
