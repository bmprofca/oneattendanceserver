export const sendSuccess = (res, statusCode = 200, message = "Success", data = null, meta = null) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta && typeof meta === "object" && Object.keys(meta).length > 0) response.meta = meta;
  return res.status(statusCode).json(response);
};

export const sendError = (res, statusCode = 500, message = "Internal server error", errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

export const buildMeta = (page, limit, total, dataLength) => {
  const offset = (page - 1) * limit;
  return {
    total,
    total_pages: Math.ceil(total / limit),
    page,
    limit,
    has_prev: page > 1,
    has_next: offset + dataLength < total,
    is_last_page: offset + dataLength >= total,
  };
};

export const parseJSONSafe = (value, fallback = null) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

export const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
};

export const sanitizeText = (value, maxLength = 1000) => {
  if (value === undefined || value === null) return null;
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
};