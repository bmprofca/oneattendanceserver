import { getSignedB2DownloadUrl, getContentTypeFromFileName, isB2Configured } from './b2Storage.js';
import { productionBaseDomain } from '../config/config.js';

const MEDIA_PREFIXES = {
  profilePicture: 'profile_picture',
  companyLogo: 'company',
  leaveAttachment: 'leave',
  attendanceAttachment: 'attendance',
  employeeDocument: 'documents',
  payrollDocument: 'payroll',
  clientProfile: '',
  staffProfile: '',
  serviceImage: '',
  orderDocument: '',
  libraryDocument: '',
  caProfile: '',
};

const normalizeStoredKey = (value, prefix) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.includes('/')) {
    return raw.replace(/^\/+/, '');
  }

  return prefix ? `${prefix}/${raw}` : raw;
};

/**
 * Build a proxy URL that routes through the server instead of
 * exposing a B2 signed URL to the browser. This avoids network
 * restrictions that block direct access to B2 hosts.
 */
const buildProxyUrl = (storedValue, prefix = '', req = null) => {
  if (!storedValue) return null;

  const raw = String(storedValue).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const base = req
    ? `${req.protocol}://${req.get('host')}`
    : productionBaseDomain;

  // Support legacy local uploads path (/uploads/...)
  if (raw.startsWith('/uploads/')) {
    return `${base}${raw}`;
  }

  const objectKey = normalizeStoredKey(raw, prefix);
  if (!objectKey) return null;

  return `${base}/api/media/${encodeURIComponent(objectKey)}`;
};

export const resolveMediaDownloadUrl = async (storedValue, prefix) => {
  const objectKey = normalizeStoredKey(storedValue, prefix);
  if (!objectKey) {
    return null;
  }

  return getSignedB2DownloadUrl(objectKey);
};

export const buildProfileImageUrl = (filename, req) =>
  buildProxyUrl(filename, MEDIA_PREFIXES.profilePicture, req);

export const buildCompanyLogoUrl = (filename, req) =>
  buildProxyUrl(filename, MEDIA_PREFIXES.companyLogo, req);

export const buildFileUrl = (filename, req) =>
  buildProxyUrl(filename, '', req);

/**
 * Resolve a publicly accessible HTTPS URL for WhatsApp template header media.
 * WhatsApp/OneChatting must fetch the image externally, so prefer a B2 signed URL.
 */
export const resolveWhatsAppMediaUrl = async (storedValue, prefix = '') => {
  const objectKey = normalizeStoredKey(storedValue, prefix);
  if (!objectKey) {
    return null;
  }

  if (/^https?:\/\//i.test(objectKey)) {
    if (isB2Configured()) {
      try {
        const signedUrl = await getSignedB2DownloadUrl(objectKey);
        if (signedUrl) {
          return signedUrl;
        }
      } catch {
        // fall through to the raw URL
      }
    }
    return objectKey;
  }

  if (isB2Configured()) {
    try {
      const signedUrl = await getSignedB2DownloadUrl(objectKey);
      if (signedUrl) {
        return signedUrl;
      }
    } catch {
      // fall through to production proxy URL
    }
  }

  if (productionBaseDomain) {
    return `${productionBaseDomain}/api/media/${encodeURIComponent(objectKey)}`;
  }

  return null;
};

const sanitizeContentDispositionFilename = (name) =>
  String(name ?? 'download').replace(/[\r\n"]/g, '').trim() || 'download';

/**
 * Fetch a stored object from B2 (via signed URL) and stream it as a download response.
 */
export async function streamStoredFileDownload(res, { objectKey, downloadName }) {
  const signedUrl = await getSignedB2DownloadUrl(objectKey);
  if (!signedUrl) {
    throw new Error('File not found');
  }

  const fileResponse = await fetch(signedUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to fetch file from storage (${fileResponse.status})`);
  }

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const contentType =
    fileResponse.headers.get('content-type') ||
    getContentTypeFromFileName(objectKey) ||
    'application/octet-stream';
  const safeName = sanitizeContentDispositionFilename(downloadName || objectKey);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

export { MEDIA_PREFIXES, buildProxyUrl };
export default buildProxyUrl;
