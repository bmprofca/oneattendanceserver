import axios from "axios";
import { buildFileUrl } from "./fileService.js";
import { safeNumber } from "./sendResponse.js";
import { FACE_SERVICE_URL as configFaceServiceUrl } from "../config/config.js";

export const FACE_SERVICE_URL = (configFaceServiceUrl || "http://localhost:8000").replace(
  /\/$/,
  ""
);

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

export async function runFaceCheck(conn, { companyId, imageUrl, employeeId = 0 }) {
  const ref = safeNumber(employeeId, 0);

  if (ref > 0) {
    const [[employee]] = await conn.query(
      `SELECT face_enrolled, face_data
       FROM employees
       WHERE (user_id = ? OR id = ?)
         AND company_id = ?
         AND is_deleted = 0
       LIMIT 1`,
      [ref, ref, companyId]
    );

    if (!employee) {
      return {
        success: false,
        statusCode: 404,
        message: "Employee not found",
        responseData: null
      };
    }

    const enrolled = employee.face_enrolled === 1 && Boolean(employee.face_data);
    if (!enrolled) {
      return {
        success: false,
        statusCode: 400,
        message: "Face enrollment is not set for this employee",
        responseData: null
      };
    }
  }

  const payload = {
    company_id: companyId,
    image: imageUrl
  };
  if (ref > 0) {
    payload.employee_id = ref;
  }

  const { data } = await axios.post(`${FACE_SERVICE_URL}/check`, payload);

  console.log("[FACE_CHECK_RESPONSE]", {
    payload,
    response: data
  });

  const responseData = {
    employee_id: data?.employee_id ?? null,
    employee_name: data?.employee_name ?? null,
    company_id: data?.company_id ?? companyId,
    similarity: data?.similarity ?? null,
    threshold: data?.threshold ?? null,
    designation: null,
    email: null,
    mobile: null,
    image: null
  };

  const matchedUserId = safeNumber(data?.employee_id, 0);
  if (matchedUserId > 0) {
    const employeeDetails = await fetchMatchedEmployeeForFaceCheck(
      conn,
      companyId,
      matchedUserId
    );

    if (employeeDetails) {
      responseData.employee_id = employeeDetails.employee_id;
      responseData.employee_name =
        employeeDetails.employee_name ?? responseData.employee_name;
      responseData.designation = employeeDetails.designation;
      responseData.email = employeeDetails.email;
      responseData.mobile = employeeDetails.mobile;
      responseData.image = employeeDetails.image;
    }
  }

  if (data?.success) {
    return {
      success: true,
      statusCode: 200,
      message: data.message || "Face matched",
      responseData
    };
  }

  const status = String(data?.message || "")
    .toLowerCase()
    .includes("not found")
    ? 404
    : 400;

  return {
    success: false,
    statusCode: status,
    message: data?.message || "Face does not match",
    responseData
  };
}
