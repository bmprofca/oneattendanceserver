import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { sendError, sendSuccess, buildMeta } from "../utils/sendResponse.js";
import { buildFileUrl } from "../utils/fileService.js";

const router = express.Router();

const EMPLOYEE_AUTH = auth([], { employee_only: true });
const ADMIN_AUTH = auth([PERMISSIONS.EMPLOYEES]);
const LIVE_WINDOW_MINUTES = 2;

function readLocation(body = {}) {
	const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
	if (!hasValue(body.latitude) || !hasValue(body.longitude)) return null;

	const latitude = Number(body.latitude);
	const longitude = Number(body.longitude);
	const accuracy = body.accuracy == null ? null : Number(body.accuracy);

	if (
		!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
		!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
		(accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000))
	) {
		return null;
	}

	return { latitude, longitude, accuracy };
}

function toSession(row) {
	if (!row) return null;
	return {
		id: row.id,
		status: row.status,
		started_at: row.started_at,
		ended_at: row.ended_at,
		latitude: row.last_latitude,
		longitude: row.last_longitude,
		accuracy: row.last_accuracy,
		last_updated_at: row.last_updated_at,
	};
}

async function lockEmployee(conn, employeeId) {
	const [[employee]] = await conn.query(
		`SELECT id FROM employees WHERE id = ? AND is_active = 1 AND is_deleted = 0 FOR UPDATE`,
		[employeeId],
	);
	return employee;
}

async function savePoint(conn, sessionId, employeeId, location) {
	await conn.query(
		`INSERT INTO employee_location_points
			(session_id, employee_id, latitude, longitude, accuracy, recorded_at)
		 VALUES (?, ?, ?, ?, ?, NOW())`,
		[sessionId, employeeId, location.latitude, location.longitude, location.accuracy],
	);
	await conn.query(
		`UPDATE employee_location_sessions
		 SET last_latitude = ?, last_longitude = ?, last_accuracy = ?, last_updated_at = NOW()
		 WHERE id = ? AND employee_id = ? AND status = 'active'`,
		[location.latitude, location.longitude, location.accuracy, sessionId, employeeId],
	);
}

router.post("/employee/location/start", EMPLOYEE_AUTH, async (req, res) => {
	const location = readLocation(req.body);
	if (!location) return sendError(res, 400, "Valid latitude, longitude, and optional accuracy are required");

	const employeeId = req.employee?.id;
	let conn;
	try {
		conn = await db.getConnection();
		await conn.beginTransaction();
		if (!(await lockEmployee(conn, employeeId))) {
			await conn.rollback();
			return sendError(res, 403, "Active employee record not found");
		}

		const [[activeSession]] = await conn.query(
			`SELECT id, status, started_at, ended_at, last_latitude, last_longitude,
							last_accuracy, last_updated_at
			 FROM employee_location_sessions
			 WHERE employee_id = ? AND status = 'active'
			 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
			[employeeId],
		);

		let sessionId = activeSession?.id;
		if (!activeSession) {
			const [result] = await conn.query(
				`INSERT INTO employee_location_sessions
					(employee_id, started_at, status, last_latitude, last_longitude, last_accuracy, last_updated_at)
				 VALUES (?, NOW(), 'active', ?, ?, ?, NOW())`,
				[employeeId, location.latitude, location.longitude, location.accuracy],
			);
			sessionId = result.insertId;
		}
		await savePoint(conn, sessionId, employeeId, location);
		const [[session]] = await conn.query(
			`SELECT id, status, started_at, ended_at, last_latitude, last_longitude,
							last_accuracy, last_updated_at
			 FROM employee_location_sessions WHERE id = ? LIMIT 1`,
			[sessionId],
		);
		await conn.commit();
		return sendSuccess(res, activeSession ? 200 : 201, activeSession ? "Location session already active" : "Location session started", toSession(session));
	} catch (error) {
		if (conn) await conn.rollback().catch(() => {});
		console.error("LOCATION START ERROR:", error);
		return sendError(res, 500, "Could not start location session");
	} finally {
		conn?.release();
	}
});

router.post("/employee/location/update", EMPLOYEE_AUTH, async (req, res) => {
	const location = readLocation(req.body);
	if (!location) return sendError(res, 400, "Valid latitude, longitude, and optional accuracy are required");

	const employeeId = req.employee?.id;
	let conn;
	try {
		conn = await db.getConnection();
		await conn.beginTransaction();
		if (!(await lockEmployee(conn, employeeId))) {
			await conn.rollback();
			return sendError(res, 403, "Active employee record not found");
		}

		const [[session]] = await conn.query(
			`SELECT id FROM employee_location_sessions
			 WHERE employee_id = ? AND status = 'active'
			 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
			[employeeId],
		);
		if (!session) {
			await conn.rollback();
			return sendError(res, 409, "No active location session");
		}
		await savePoint(conn, session.id, employeeId, location);
		await conn.commit();
		return sendSuccess(res, 200, "Location updated", { session_id: session.id, ...location });
	} catch (error) {
		if (conn) await conn.rollback().catch(() => {});
		console.error("LOCATION UPDATE ERROR:", error);
		return sendError(res, 500, "Could not update location");
	} finally {
		conn?.release();
	}
});

router.post("/employee/location/stop", EMPLOYEE_AUTH, async (req, res) => {
	const employeeId = req.employee?.id;
	let conn;
	try {
		conn = await db.getConnection();
		await conn.beginTransaction();
		if (!(await lockEmployee(conn, employeeId))) {
			await conn.rollback();
			return sendError(res, 403, "Active employee record not found");
		}

		const [[session]] = await conn.query(
			`SELECT id FROM employee_location_sessions
			 WHERE employee_id = ? AND status = 'active'
			 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
			[employeeId],
		);
		if (!session) {
			await conn.commit();
			return sendSuccess(res, 200, "No active location session", { active: false });
		}

		await conn.query(
			`UPDATE employee_location_sessions
			 SET status = 'inactive', ended_at = NOW()
			 WHERE id = ? AND employee_id = ? AND status = 'active'`,
			[session.id, employeeId],
		);
		await conn.commit();
		return sendSuccess(res, 200, "Location session stopped", { active: false, session_id: session.id });
	} catch (error) {
		if (conn) await conn.rollback().catch(() => {});
		console.error("LOCATION STOP ERROR:", error);
		return sendError(res, 500, "Could not stop location session");
	} finally {
		conn?.release();
	}
});

router.get("/employee/location/status", EMPLOYEE_AUTH, async (req, res) => {
	try {
		const [[session]] = await db.query(
			`SELECT id, status, started_at, ended_at, last_latitude, last_longitude,
							last_accuracy, last_updated_at
			 FROM employee_location_sessions
			 WHERE employee_id = ? AND status = 'active'
			 ORDER BY id DESC LIMIT 1`,
			[req.employee?.id],
		);
		return sendSuccess(res, 200, "Location session status", {
			active: Boolean(session),
			session: toSession(session),
		});
	} catch (error) {
		console.error("LOCATION STATUS ERROR:", error);
		return sendError(res, 500, "Could not read location session status");
	}
});

router.get("/admin/locations/live", ADMIN_AUTH, async (req, res) => {
	const employeeId = req.query.employeeId == null ? null : Number(req.query.employeeId);
	if (employeeId !== null && (!Number.isInteger(employeeId) || employeeId <= 0)) {
		return sendError(res, 400, "Valid employeeId is required");
	}
	try {
		const params = [req.company.id, LIVE_WINDOW_MINUTES];
		let employeeFilter = "";
		if (employeeId !== null) {
			employeeFilter = " AND e.id = ?";
			params.push(employeeId);
		}
		const [rows] = await db.query(
			`SELECT e.id AS employee_id, e.employee_code, e.designation,
							u.name, u.profile_picture, s.id AS session_id, s.started_at,
							s.last_latitude AS latitude, s.last_longitude AS longitude,
							s.last_accuracy AS accuracy, s.last_updated_at
			 FROM employee_location_sessions s
			 INNER JOIN employees e ON e.id = s.employee_id
			 INNER JOIN users u ON u.id = e.user_id
			 WHERE e.company_id = ? AND e.is_active = 1 AND e.is_deleted = 0
				 AND u.is_active = 1 AND u.is_deleted = 0
				 AND s.status = 'active'
				 AND s.last_updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)${employeeFilter}
			 ORDER BY s.last_updated_at DESC`,
			params,
		);
		return sendSuccess(res, 200, "Live employee locations", rows.map((row) => ({
			...row,
			profile_picture: buildFileUrl(row.profile_picture),
			is_live: true,
		})));
	} catch (error) {
		console.error("LIVE LOCATIONS ERROR:", error);
		return sendError(res, 500, "Could not load live locations");
	}
});

router.get("/admin/locations/:employeeId/history", ADMIN_AUTH, async (req, res) => {
	const employeeId = Number(req.params.employeeId);
	const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
	const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
	if (!Number.isInteger(employeeId) || employeeId <= 0) {
		return sendError(res, 400, "Valid employeeId is required");
	}
	for (const dateValue of [req.query.from, req.query.to]) {
		if (dateValue != null && (typeof dateValue !== "string" || Number.isNaN(Date.parse(dateValue)))) {
			return sendError(res, 400, "from and to must be valid date/time values");
		}
	}
	if (req.query.from && req.query.to && Date.parse(req.query.from) > Date.parse(req.query.to)) {
		return sendError(res, 400, "from must be earlier than or equal to to");
	}

	try {
		const [[employee]] = await db.query(
			`SELECT e.id, e.employee_code, e.designation, u.name, u.profile_picture
			 FROM employees e INNER JOIN users u ON u.id = e.user_id
			 WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0 LIMIT 1`,
			[employeeId, req.company.id],
		);
		if (!employee) return sendError(res, 404, "Employee not found in this company");

		const filters = ["p.employee_id = ?", "s.employee_id = ?"];
		const params = [employeeId, employeeId];
		if (req.query.from) {
			filters.push("p.recorded_at >= ?");
			params.push(req.query.from);
		}
		if (req.query.to) {
			filters.push("p.recorded_at <= ?");
			params.push(req.query.to);
		}
		const where = filters.join(" AND ");
		const [[countRow]] = await db.query(
			`SELECT COUNT(*) AS total FROM employee_location_points p
			 INNER JOIN employee_location_sessions s ON s.id = p.session_id
			 WHERE ${where}`,
			params,
		);
		const offset = (page - 1) * limit;
		const [points] = await db.query(
			`SELECT p.id, p.session_id, p.latitude, p.longitude, p.accuracy, p.recorded_at
			 FROM employee_location_points p
			 INNER JOIN employee_location_sessions s ON s.id = p.session_id
			 WHERE ${where}
			 ORDER BY p.recorded_at DESC, p.id DESC LIMIT ? OFFSET ?`,
			[...params, limit, offset],
		);
		return sendSuccess(res, 200, "Employee location history", {
			employee: { ...employee, profile_picture: buildFileUrl(employee.profile_picture) },
			points: points.reverse(),
		}, buildMeta(page, limit, Number(countRow.total), points.length));
	} catch (error) {
		console.error("LOCATION HISTORY ERROR:", error);
		return sendError(res, 500, "Could not load location history");
	}
});

export default router;
