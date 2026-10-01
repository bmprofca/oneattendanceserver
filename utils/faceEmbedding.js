import { safeNumber } from "./sendResponse.js";

export const FACE_EMBEDDING_DIMENSION = 512;
// 512-D FaceNet threshold: genuine matches >= 0.85, imposters <= 0.35. Standard threshold is 0.75.
export let FACE_MATCH_THRESHOLD = process.env.FACE_MATCH_THRESHOLD
  ? parseFloat(process.env.FACE_MATCH_THRESHOLD)
  : 0.75;

export function setFaceMatchThreshold(value) {
  const num = Number(value);
  if (Number.isFinite(num)) FACE_MATCH_THRESHOLD = num;
}

export function parseFaceEmbedding(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== FACE_EMBEDDING_DIMENSION) {
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
  return cosineSimilarityNormalized(a, b);
}

/** Compares vectors that have already been validated and normalized. */
export function cosineSimilarityNormalized(left, right) {
  if (!left || !right || left.length !== right.length) {
    return null;
  }
  return left.reduce((sum, item, index) => sum + item * right[index], 0);
}

export function faceEmployeeId(row) {
  return safeNumber(row?.user_id ?? row?.employee_id ?? row?.id, 0);
}
