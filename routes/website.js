import express from "express";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import { getWebsiteContent } from "../config/websiteStore.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const content = await getWebsiteContent();
    return sendSuccess(res, 200, "Website content loaded", content);
  } catch (error) {
    console.error("Website content error:", error.message);
    return sendError(res, 500, "Unable to load website content");
  }
});

export default router;
