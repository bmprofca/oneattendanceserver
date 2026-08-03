import cron from "node-cron";
import config from "./config.js";
import { cleanup } from "./otpCleanup.cron.js";
import { cleanupFailedEmails } from "../email/services/email.processQueue.js";
import { generateAutoAttendance } from "./autoAttendance.js";
import { runSubscriptionAlerts } from "./subscriptionAlerts.cron.js";


let otpCleanupRunning = false;
let failedCleanupRunning = false;
let autoAttendanceRunning = false;
let subscriptionAlertRunning = false;


cleanup();
cron.schedule(`*/${config.runIntervalMinutes} * * * *`, async () => {

  if (otpCleanupRunning) {
    console.log("⚠️ OTP cleanup skipped (already running)");
    return;
  }

  otpCleanupRunning = true;

  try {
    console.log("⏰ OTP cleanup cron triggered");
    await cleanup();

  } catch (err) {
    console.error("❌ OTP CLEANUP ERROR:", err);

  } finally {
    otpCleanupRunning = false;
  }
});

cron.schedule("0 1 * * *", async () => {

  if (failedCleanupRunning) {
    console.log("⚠️ Failed cleanup skipped (already running)");
    return;
  }

  failedCleanupRunning = true;

  try {
    console.log("🧹 Failed email cleanup started");

    await cleanupFailedEmails({
      olderThanHours: config.cleanupFailedEmails
    });

    console.log("✅ Failed email cleanup completed");

  } catch (err) {
    console.error("❌ FAILED CLEANUP ERROR:", err);

  } finally {
    failedCleanupRunning = false;
  }
});

cron.schedule("0 0 * * *", async () => {

  if (autoAttendanceRunning) {
    console.log("⚠️ Auto attendance skipped (already running)");
    return;
  }

  autoAttendanceRunning = true;

  try {
    console.log("🕛 Auto attendance started");

    await generateAutoAttendance();

    console.log("✅ Auto attendance completed");

  } catch (err) {
    console.error("❌ AUTO ATTENDANCE ERROR:", err);

  } finally {
    autoAttendanceRunning = false;
  }
});

// ─── Subscription WhatsApp Alerts — daily at 9:00 AM ────────────────────────
cron.schedule("0 9 * * *", async () => {

  if (subscriptionAlertRunning) {
    console.log("⚠️ Subscription alert skipped (already running)");
    return;
  }

  subscriptionAlertRunning = true;

  try {
    console.log("📲 Subscription alert cron started");

    await runSubscriptionAlerts();

    console.log("✅ Subscription alert cron completed");

  } catch (err) {
    console.error("❌ SUBSCRIPTION ALERT CRON ERROR:", err);

  } finally {
    subscriptionAlertRunning = false;
  }
});