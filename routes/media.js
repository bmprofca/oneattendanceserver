import express from 'express';
import { getSignedB2DownloadUrl, getContentTypeFromFileName, isB2Configured } from '../utils/b2Storage.js';

const router = express.Router();

/**
 * GET /api/media/:key(*)
 *
 * Public proxy endpoint that fetches a file from B2 and streams it
 * to the client. This avoids exposing B2 signed URLs to the browser,
 * which can be unreachable on certain networks/firewalls.
 *
 * Supports both URL-encoded keys and nested path keys.
 */
router.get('/:key(*)', async (req, res) => {
  try {
    const rawKey = req.params.key || req.params[0] || '';
    const objectKey = decodeURIComponent(rawKey).replace(/^\/+/, '');

    if (!objectKey || !isB2Configured()) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const signedUrl = await getSignedB2DownloadUrl(objectKey);
    if (!signedUrl) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) {
      return res.status(fileResponse.status).json({
        success: false,
        message: 'Failed to fetch file from storage',
      });
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const contentType =
      fileResponse.headers.get('content-type') ||
      getContentTypeFromFileName(objectKey) ||
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (err) {
    console.error('Media proxy error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to serve media' });
  }
});

export default router;
