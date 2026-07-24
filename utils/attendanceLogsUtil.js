export async function createAttendanceLog(conn, payload = {}) {
  if (!conn) {
    throw new Error("Database connection is required");
  }

  const {
    attendance_id,
    log_type,
    method,
    time,

    ip_address = null,
    latitude = null,
    longitude = null,

    extra_data = null,

    status = 1,

    created_by = null,
    updated_by = null,
  } = payload;

  if (!Number.isInteger(Number(attendance_id)) || Number(attendance_id) <= 0) {
    throw new Error("Valid attendance_id is required");
  }

  const allowedLogTypes = ["start", "end", "day_status"];

  const parsedLogType = String(log_type || "").trim().toLowerCase();

  if (!allowedLogTypes.includes(parsedLogType)) {
    throw new Error("Invalid log_type");
  }

  if (!method || !String(method).trim()) {
    throw new Error("Attendance method is required");
  }

  if (!time || !String(time).trim()) {
    throw new Error("Log time is required");
  }

  const [[attendance]] = await conn.query(
    `
    SELECT id
    FROM attendance
    WHERE id = ?
    LIMIT 1
    `,
    [Number(attendance_id)]
  );

  if (!attendance) {
    throw new Error("Attendance record not found");
  }

  await conn.query(
    `
    UPDATE attendance_logs
    SET
      status = 0,
      updated_by = ?,
      updated_at = CURRENT_TIMESTAMP()
    WHERE attendance_id = ?
      AND log_type = ?
      AND status = 1
    `,
    [
      updated_by ? Number(updated_by) : null,
      Number(attendance_id),
      parsedLogType,
    ]
  );

  let parsedLatitude = null;
  let parsedLongitude = null;

  if (latitude !== null && latitude !== undefined && latitude !== "") {
    parsedLatitude = Number(latitude);

    if (Number.isNaN(parsedLatitude)) {
      throw new Error("Invalid latitude");
    }
  }

  if (longitude !== null && longitude !== undefined && longitude !== "") {
    parsedLongitude = Number(longitude);

    if (Number.isNaN(parsedLongitude)) {
      throw new Error("Invalid longitude");
    }
  }

  let parsedExtraData = null;

  if (extra_data !== null && extra_data !== undefined) {
    try {
      parsedExtraData = JSON.stringify(extra_data);
    } catch {
      throw new Error("Invalid extra_data JSON");
    }
  }

  const [result] = await conn.query(
    `
    INSERT INTO attendance_logs (
      attendance_id,
      log_type,
      method,
      time,
      ip_address,
      latitude,
      longitude,
      extra_data,
      status,
      created_by,
      updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      Number(attendance_id),
      parsedLogType,
      String(method).trim(),
      String(time).trim(),
      ip_address ? String(ip_address).trim() : null,
      parsedLatitude,
      parsedLongitude,
      parsedExtraData,
      status ? 1 : 0,
      created_by ? Number(created_by) : null,
      updated_by ? Number(updated_by) : null,
    ]
  );

  const [[attendanceLog]] = await conn.query(
    `
    SELECT
      id,
      attendance_id,
      log_type,
      method,
      time,
      ip_address,
      latitude,
      longitude,
      extra_data,
      status,
      created_by,
      created_at,
      updated_by,
      updated_at
    FROM attendance_logs
    WHERE id = ?
    LIMIT 1
    `,
    [result.insertId]
  );

  return {
    success: true,
    message: "Attendance log created successfully",
    data: attendanceLog,
  };
}

export async function bulkCreateAttendanceLogs(conn, logs = []) {
  if (!conn) {
    throw new Error("Database connection is required");
  }

  if (!Array.isArray(logs)) {
    throw new Error("logs must be an array");
  }

  if (!logs.length) {
    return {
      success: true,
      message: "No logs to create",
      data: []
    };
  }

  const allowedLogTypes = [
    "start",
    "end",
    "day_status"
  ];

  const attendanceIds = [];
  const insertValues = [];
  const deactivateGroups = new Map();

  for (const log of logs) {

    const attendance_id = Number(log.attendance_id);

    if (!Number.isInteger(attendance_id) || attendance_id <= 0) {
      throw new Error(`Invalid attendance_id: ${log.attendance_id}`);
    }

    const parsedLogType = String(log.log_type || "")
      .trim()
      .toLowerCase();

    if (!allowedLogTypes.includes(parsedLogType)) {
      throw new Error(`Invalid log_type: ${log.log_type}`);
    }

    if (!log.method || !String(log.method).trim()) {
      throw new Error("Attendance method is required");
    }

    if (!log.time || !String(log.time).trim()) {
      throw new Error("Log time is required"
      );
    }

    let latitude = null;
    let longitude = null;

    if (log.latitude !== null && log.latitude !== undefined && log.latitude !== "") {
      latitude = Number(log.latitude);

      if (Number.isNaN(latitude)) {
        throw new Error(`Invalid latitude for attendance ${attendance_id}`);
      }
    }

    if (log.longitude !== null && log.longitude !== undefined && log.longitude !== "") {
      longitude = Number(log.longitude);

      if (Number.isNaN(longitude)) {
        throw new Error(`Invalid longitude for attendance ${attendance_id}`);
      }
    }

    let parsedExtraData = null;

    if (log.extra_data !== null && log.extra_data !== undefined) {
      try {
        parsedExtraData = JSON.stringify(
          log.extra_data
        );
      } catch {
        throw new Error(
          `Invalid extra_data for attendance ${attendance_id}`
        );
      }
    }

    attendanceIds.push(
      attendance_id
    );

    const groupKey = `${attendance_id}_${parsedLogType}`;

    deactivateGroups.set(
      groupKey,
      {
        attendance_id,
        log_type: parsedLogType,
        updated_by: log.updated_by ? Number(log.updated_by) : null
      }
    );

    insertValues.push([
      attendance_id,
      parsedLogType,
      String(log.method).trim(),
      String(log.time).trim(),

      log.ip_address ? String(log.ip_address).trim() : null,

      latitude,
      longitude,

      parsedExtraData,

      log.status ? 1 : 0,

      log.created_by ? Number(log.created_by) : null,

      log.updated_by ? Number(log.updated_by) : null
    ]);
  }
  const uniqueAttendanceIds = [...new Set(attendanceIds)];

  const attendancePlaceholders = uniqueAttendanceIds.map(() => "?").join(",");

  const [attendanceRows] = await conn.query(
    `
      SELECT id
      FROM attendance
      WHERE id IN (${attendancePlaceholders})
    `,
    uniqueAttendanceIds
  );

  const attendanceSet = new Set(attendanceRows.map(row => Number(row.id)));

  for (const attendanceId of uniqueAttendanceIds) {
    if (!attendanceSet.has(attendanceId)) {
      throw new Error(
        `Attendance record not found: ${attendanceId}`
      );
    }
  }
  const deactivateConditions = [];
  const deactivateParams = [];

  for (const item of deactivateGroups.values()) {

    deactivateConditions.push(
      `(attendance_id = ? AND log_type = ?)`
    );

    deactivateParams.push(
      item.attendance_id,
      item.log_type
    );
  }

  if (deactivateConditions.length) {
    await conn.query(
      `
      UPDATE attendance_logs
      SET
        status = 0,
        updated_at = CURRENT_TIMESTAMP()
      WHERE
        status = 1
        AND (
          ${deactivateConditions.join(" OR ")}
        )
      `,
      deactivateParams
    );
  }

  await conn.query(
    `
    INSERT INTO attendance_logs (
      attendance_id,
      log_type,
      method,
      time,
      ip_address,
      latitude,
      longitude,
      extra_data,
      status,
      created_by,
      updated_by
    )
    VALUES ?
    `,
    [insertValues]
  );

  return {
    success: true,
    message: "Attendance logs created successfully",
    count: insertValues.length
  };
}