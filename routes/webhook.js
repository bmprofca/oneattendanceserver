import express from "express";

const router = express.Router();

/**
 * Payment / subscription gateway webhooks.
 * POST /subscription/:gateway
 *
 * gateway — e.g. razorpay, stripe, cashfree (implement per provider later)
 */
router.get("/subscription/:gateway", async (req, res) => {
    const { gateway } = req.params;

    // TODO: verify webhook signature per gateway
    // TODO: parse and persist event payload
    // TODO: update subscription / payment state

    return res.status(200).json({
        success: true,
        received: true,
        gateway
    });
});

export default router;
