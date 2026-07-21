import db from "../config/db.js";
import config from "./config.js";

export async function cleanup() {
  let conn;

  try {
    conn = await db.getConnection();

    console.log("🧹 Cleanup started at", new Date().toISOString());

    let totalOtpDeleted = 0;
    let totalSessionDeleted = 0;

    while (true) {
      const [result] = await conn.query(`
        DELETE FROM otps
        WHERE created_at < NOW() - INTERVAL ? HOUR
        LIMIT ?
      `, [config.otpExpiryHours, config.batchSize]);

      totalOtpDeleted += result.affectedRows;

      if (result.affectedRows < config.batchSize) break;
    }

    while (true) {
      const [result] = await conn.query(`
        DELETE FROM sessions
        WHERE created_at < NOW() - INTERVAL ? DAY
        LIMIT ?
      `, [config.sessionExpiryDays, config.batchSize]);

      totalSessionDeleted += result.affectedRows;

      if (result.affectedRows < config.batchSize) break;
    }

    console.log(`✅ Total OTPs deleted: ${totalOtpDeleted}`);
    console.log(`✅ Total Sessions deleted: ${totalSessionDeleted}`);
    console.log("🧹 Cleanup finished\n");

  } catch (err) {
    console.error("❌ CLEANUP ERROR:", err);
    throw err; 
  } finally {
    if (conn) conn.release();
  }
}