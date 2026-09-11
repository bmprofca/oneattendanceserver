import { buildFileUrl } from "./fileService.js";
import { safeNumber } from "./sendResponse.js";
import {
  cosineSimilarity,
  FACE_MATCH_THRESHOLD,
  parseFaceEmbedding,
} from "./faceEmbedding.js";

export async function fetchMatchedEmployeeForFaceCheck(conn, companyId, faceUserId) {
  const userId = safeNumber(faceUserId, 0);
  if (!userId) {
    return null;
  }

  const [[row]] = await conn.query(
    `
    SELECT
      e.user_id AS employee_id,
      e.designation,
      u.name,
      u.email,
      u.phone,
      u.profile_picture
    FROM employees e
    INNER JOIN users u
      ON u.id = e.user_id
     AND u.is_deleted = 0
    WHERE e.user_id = ?
      AND e.company_id = ?
      AND e.is_deleted = 0
    LIMIT 1
    `,
    [userId, companyId]
  );

  if (!row) {
    return null;
  }

  return {
    employee_id: row.employee_id,
    employee_name: row.name || null,
    designation: row.designation || null,
    email: row.email || null,
    mobile: row.phone || null,
    image: buildFileUrl(row.profile_picture)
  };
}

export async function runFaceCheck(conn, { companyId, embedding, employeeId = 0 }) {
  const ref = safeNumber(employeeId, 0);
  const candidate = parseFaceEmbedding(embedding);
  if (!candidate) return { success: false, statusCode: 400, message: "Valid face embedding required", responseData: null };
  const params = [companyId];
  let where = "e.company_id = ? AND e.is_deleted = 0 AND e.face_enrolled = 1 AND e.face_data IS NOT NULL";
  if (ref > 0) {
    where += " AND (e.user_id = ? OR e.id = ?)";
    params.push(ref, ref);
  }
  const [rows] = await conn.query(
    `SELECT e.id, e.user_id, e.face_data, u.name, u.email, u.phone, u.profile_picture, e.designation
       FROM employees e INNER JOIN users u ON u.id = e.user_id AND u.is_deleted = 0
      WHERE ${where}`,
    params
  );
  let best = null;
  for (const row of rows) {
    const similarity = cosineSimilarity(candidate, row.face_data);
    if (similarity !== null && (!best || similarity > best.similarity)) best = { row, similarity };
  }
  if (!best || best.similarity < FACE_MATCH_THRESHOLD) {
    return { success: false, statusCode: 404, message: "Face does not match", responseData: { similarity: best?.similarity ?? null, threshold: FACE_MATCH_THRESHOLD } };
  }
  return {
    success: true,
    statusCode: 200,
    message: "Face matched",
    responseData: {
      employee_id: best.row.user_id,
      employee_name: best.row.name || null,
      company_id: companyId,
      similarity: best.similarity,
      threshold: FACE_MATCH_THRESHOLD,
      designation: best.row.designation || null,
      email: best.row.email || null,
      mobile: best.row.phone || null,
      image: buildFileUrl(best.row.profile_picture),
    },
  };
}
