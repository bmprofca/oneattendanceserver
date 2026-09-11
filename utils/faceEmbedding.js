import { safeNumber } from "./sendResponse.js";

export const FACE_EMBEDDING_DIMENSION = 128;
export const FACE_MATCH_THRESHOLD = 0.8;

export function parseFaceEmbedding(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length < 8 || parsed.length > 2048) {
    return null;
  }
  const embedding = parsed.map(Number);
  if (embedding.some((item) => !Number.isFinite(item))) {
    return null;
  }
  const norm = Math.sqrt(embedding.reduce((sum, item) => sum + item * item, 0));
  if (!Number.isFinite(norm) || norm <= 0) {
    return null;
  }
  return embedding.map((item) => item / norm);
}

export function cosineSimilarity(left, right) {
  const a = parseFaceEmbedding(left);
  const b = parseFaceEmbedding(right);
  if (!a || !b || a.length !== b.length) {
    return null;
  }
  return a.reduce((sum, item, index) => sum + item * b[index], 0);
}

export function faceEmployeeId(row) {
  return safeNumber(row?.user_id ?? row?.employee_id ?? row?.id, 0);
}
