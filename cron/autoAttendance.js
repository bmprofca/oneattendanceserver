import db from "../config/db.js";
import { bulkCreateAttendanceLogs } from "../utils/attendanceLogsUtil.js";
import { getCurrentDate, getCurrentTime, getDayName, normalizeWeekends } from "../utils/time.js";
import config from "../cron/config.js";


const yieldToEventLoop = () => new Promise((r) => setImmediate(r));

export async function generateAutoAttendance() {
  let conn;

  try {
    conn = await db.getConnection();

    const today = getCurrentDate();
    const weekday = getDayName(today);

    console.log(`[AUTO_ATTENDANCE] Started for ${today} (weekday: ${weekday})`);

    const [holidayRows] = await conn.query(
      `SELECT company_id, name
       FROM   holidays
       WHERE  date       = ?
         AND  is_optional = 0
         AND  is_deleted  = 0
         AND  is_active   = 1`,
      [today],
    );

    const holidayMap = new Map();

    for (const h of holidayRows) {
      const cid = Number(h.company_id);
      if (!holidayMap.has(cid)) holidayMap.set(cid, h.name);
    }

    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let lastId = 0;

    while (true) {
      const [employees] = await conn.query(
        `SELECT e.id, e.company_id, e.weekends
         FROM   employees e
         INNER JOIN companies c
           ON  c.id        = e.company_id
           AND c.is_active  = 1
           AND c.is_deleted = 0
         WHERE e.is_deleted = 0
           AND e.is_active  = 1
           AND e.id         > ?
         ORDER BY e.id
         LIMIT ?`,
        [lastId, config.batchSize],
      );

      if (!employees.length) break;

      const result = await _processEmployeeBatch(
        conn, employees, today, weekday, holidayMap,
      );

      processedCount += result.processed;
      skippedCount += result.skipped;
      failedCount += result.failed;

      lastId = Number(employees[employees.length - 1].id);

      await yieldToEventLoop();
    }

    console.log(`[AUTO_ATTENDANCE] Completed for ${today}`, {
      processed: processedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    return { success: true, processed: processedCount, skipped: skippedCount, failed: failedCount };

  } catch (error) {
    console.error("[AUTO_ATTENDANCE_ERROR]", error);
    throw error;
  } finally {
    conn?.release();
  }
}

async function _processEmployeeBatch(conn, employees, today, weekday, holidayMap) {
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const employeeIds = employees.map((e) => Number(e.id));

  const [leaveRows] = await conn.query(
    `SELECT el.employee_id, lc.code, lc.is_paid
     FROM   employee_leaves el
     INNER JOIN leave_configs lc
       ON  lc.id        = el.leave_config_id
       AND lc.is_deleted = 0
       AND lc.is_active  = 1
     WHERE el.employee_id IN (?)
       AND el.status     = 'approved'
       AND el.is_deleted = 0
       AND el.is_active  = 1
       AND ? BETWEEN el.start_date AND el.end_date`,
    [employeeIds, today],
  );

  const leaveMap = new Map();
  for (const row of leaveRows) {
    const eid = Number(row.employee_id);
    if (!leaveMap.has(eid)) leaveMap.set(eid, { code: row.code, is_paid: Number(row.is_paid) });
  }

  const [existingRows] = await conn.query(
    `SELECT id, employee_id
     FROM   attendance
     WHERE  attendance_date = ?
       AND  employee_id     IN (?)`,
    [today, employeeIds],
  );

  const existingMap = new Map();
  for (const row of existingRows) {
    existingMap.set(Number(row.employee_id), Number(row.id));
  }

  const insertRows = [];

  const updateRows = [];

  for (const emp of employees) {
    try {
      const employeeId = Number(emp.id);
      const companyId = Number(emp.company_id);

      const leave = leaveMap.get(employeeId);

      let dayStatus, value1, value2, remark;

      if (leave) {

        dayStatus = "leave";
        value1 = leave.is_paid === 1 ? "paid" : "unpaid";
        value2 = leave.code;
        remark = "Auto generated from approved leave";

      } else {

        const weekends = normalizeWeekends(emp.weekends);

        if (weekends.includes(weekday)) {
          dayStatus = "leave";
          value1 = "paid";
          value2 = "weekend";
          remark = "Auto generated weekend";

        } else {

          const holidayName = holidayMap.get(companyId);

          if (holidayName) {
            dayStatus = "leave";
            value1 = "paid";
            value2 = "holiday";
            remark = `Auto generated holiday: ${holidayName}`;
          }

        }
      }

      if (!dayStatus) {
        skippedCount++;
        continue;
      }

      const existingId = existingMap.get(employeeId);

      if (existingId) {
        updateRows.push({ id: existingId, dayStatus, value1, value2, remark });
      } else {
        insertRows.push([
          employeeId, companyId, today,
          "attendance",
          null, null,
          0, 0,
          0,
          dayStatus,
          value1, value2, null,
          remark,
        ]);
      }
    } catch (err) {
      failedCount++;
      console.error(`[AUTO_ATTENDANCE_PREPARE_ERROR] Employee ${emp.id}`, err);
    }
  }

  if (!insertRows.length && !updateRows.length) {
    return { processed: processedCount, skipped: skippedCount + employees.length, failed: failedCount };
  }

  if (insertRows.length) {
    await conn.query(
      `INSERT INTO attendance (
      employee_id,
      company_id,
      attendance_date,
      type,
      start_time,
      end_time,
      is_deductible,
      is_overtime,
      is_verified,
      day_status,
      value1,
      value2,
      value3,
      remark
    ) VALUES ?`,
      [insertRows]
    );
  }

  if (updateRows.length) {
    const buildCase = (field) =>
      "CASE id " +
      updateRows.map((r) => `WHEN ${r.id} THEN ${conn.escape(r[field])}`).join(" ") +
      " END";

    const idList = updateRows.map((r) => r.id).join(",");

    await conn.query(
      `UPDATE attendance
       SET
         type          = 'attendance',
         start_time    = null,
         end_time      = null,
         is_deductible = 0,
         is_overtime   = 0,
         is_verified   = 0,
         day_status    = ${buildCase("dayStatus")},
         value1        = ${buildCase("value1")},
         value2        = ${buildCase("value2")},
         value3        = NULL,
         remark        = ${buildCase("remark")},
         created_at    = NOW()
       WHERE id IN (${idList})`,
    );
  }

  const finalMap = new Map();

  const reverseExisting = new Map();
  for (const [eid, aid] of existingMap) reverseExisting.set(aid, eid);

  for (const r of updateRows) {
    const eid = reverseExisting.get(r.id);
    if (eid !== undefined) finalMap.set(eid, r.id);
  }

  if (insertRows.length) {
    const insertedEmpIds = insertRows.map((r) => r[0]);

    const [newRows] = await conn.query(
      `SELECT id, employee_id
       FROM   attendance
       WHERE  attendance_date = ?
         AND  employee_id     IN (?)`,
      [today, insertedEmpIds],
    );

    for (const row of newRows) {
      finalMap.set(Number(row.employee_id), Number(row.id));
    }
  }

  const allAttendanceIds = [...finalMap.values()];

  if (allAttendanceIds.length) {
    await conn.query(
      `UPDATE attendance_logs
       SET    status = 0, updated_at = NOW()
       WHERE  attendance_id IN (?)`,
      [allAttendanceIds],
    );
  }

  const metaMap = new Map();

  for (const r of updateRows) {
    metaMap.set(r.id, { dayStatus: r.dayStatus, value1: r.value1, value2: r.value2 });
  }
  for (const row of insertRows) {
    const aid = finalMap.get(row[0]);
    if (aid !== undefined) {
      metaMap.set(aid, { dayStatus: row[9], value1: row[10], value2: row[11] });
    }
  }

  const logsToCreate = [];

  const nowTime = getCurrentTime();

  for (const [attendanceId, meta] of metaMap) {

    const extra_data = {
      day_status: meta.dayStatus,
    };

    if (meta.dayStatus === "half_day") {
      extra_data.half_day_type = meta.value1;
    }

    if (meta.dayStatus === "leave") {
      extra_data.leave_type = meta.value1;

      if (meta.value2) {
        extra_data.leave_type_value = meta.value2;
      }
    }

    logsToCreate.push({
      attendance_id: attendanceId,
      log_type: "day_status",
      method: "manual",
      time: nowTime,
      status: 1,
      extra_data: JSON.stringify(extra_data),
    });

    processedCount++;
  }

  if (logsToCreate.length) {
    await bulkCreateAttendanceLogs(conn, logsToCreate);
  }

  return { processed: processedCount, skipped: skippedCount, failed: failedCount };
}