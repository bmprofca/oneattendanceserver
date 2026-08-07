import express from "express";
import getClientMeta from "../utils/ipHelper.js";

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const client = getClientMeta(req);

    return res.status(200).json({
      success: true,
      message: "Client information fetched successfully",
      data: client
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch client information"
    });
  }
});

export default router;