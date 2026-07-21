import express from "express";
import { saveMediaFromUrl } from "../utils/fileService.js";

const router = express.Router();

router.post("/upload-from-url", async (req, res) => {
  try {
    const { picture } = req.body;
    if (!picture) {
      return res.status(400).json({
        success: false,
        message: "Picture URL is required"
      });
    }

    const result = await saveMediaFromUrl({
      url: picture,
      folder: "profile_pictures"
    });

    return res.json(result);

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

export default router;