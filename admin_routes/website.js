import express from "express";
import adminAuth from "../middleware/adminAuthMiddleware.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { getWebsiteContent, updateWebsiteContact, updateWebsitePage } from "../config/websiteStore.js";

const router = express.Router();

router.use(adminAuth());

router.get("/", async (req, res) => {
  try {
    return sendSuccess(res, 200, "Website content loaded", await getWebsiteContent());
  } catch (error) {
    console.error("[ADMIN_WEBSITE_GET]", error.message);
    return sendError(res, 500, "Unable to load website content");
  }
});

router.put("/contact", async (req, res) => {
  try {
    const content = await updateWebsiteContact(req.body || {});
    return sendSuccess(res, 200, "Contact details saved", content);
  } catch (error) {
    const status = /required|valid email/.test(error.message) ? 400 : 500;
    if (status === 500) console.error("[ADMIN_WEBSITE_CONTACT]", error.message);
    return sendError(res, status, error.message || "Unable to save contact details");
  }
});

router.put("/pages/:slug", async (req, res) => {
  try {
    const content = await updateWebsitePage(req.params.slug, req.body || {});
    return sendSuccess(res, 200, "Page saved", content);
  } catch (error) {
    const status = /required|Unknown page|at most|heading and body/.test(error.message) ? 400 : 500;
    if (status === 500) console.error("[ADMIN_WEBSITE_PAGE]", error.message);
    return sendError(res, status, error.message || "Unable to save page");
  }
});

export default router;
