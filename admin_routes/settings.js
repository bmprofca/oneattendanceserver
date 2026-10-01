import express from "express";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { listSettings, updateSettings } from "../config/settingsStore.js";

const router = express.Router();

router.use(adminAuth());

router.get("/", async (req, res) => {
  try {
    const settings = await listSettings();
    return sendSuccess(res, 200, "Settings loaded", settings);
  } catch (error) {
    console.error("[ADMIN_SETTINGS_LIST]", error.message);
    return sendError(res, 500, "Unable to load settings");
  }
});

router.put("/", async (req, res) => {
  try {
    const result = await updateSettings(req.body?.settings);
    const message = result.restartRequired
      ? "Settings saved. Restart the server for database or port changes to take effect."
      : "Settings saved";
    return sendSuccess(res, 200, message, result);
  } catch (error) {
    const status = /Unknown setting|must be a number|No settings/.test(error.message) ? 400 : 500;
    if (status === 500) console.error("[ADMIN_SETTINGS_UPDATE]", error.message);
    return sendError(res, status, error.message || "Unable to save settings");
  }
});

export default router;
