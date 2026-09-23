import express from "express";
import crypto from "crypto";
import db from "../config/db.js";
import { RAZORPAY_WEBHOOK_SECRET } from "../config/config.js";

const router = express.Router();

function hasValidSignature(req) {
    const signature = req.get("x-razorpay-signature");
    const rawBody = req.rawBody;

    if (!signature || !rawBody || !RAZORPAY_WEBHOOK_SECRET) return false;

    const expected = crypto
        .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    return receivedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

router.post("/subscription/razorpay", async (req, res) => {
    
    if (!hasValidSignature(req)) {
        return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = req.body?.event;
    const payment = req.body?.payload?.payment?.entity;
    const order = req.body?.payload?.order?.entity;
    const orderId = payment?.order_id || order?.id;

    if (!orderId || !["payment.captured", "order.paid", "payment.failed"].includes(event)) {
        return res.status(200).json({ success: true, received: true });
    }

    let conn;

    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `
            SELECT id, payment_status
            FROM company_subscriptions
            WHERE payment_order_id = ?
              AND is_deleted = 0
            LIMIT 1
            FOR UPDATE
            `,
            [orderId]
        );

        if (!rows.length) {
            await conn.rollback();
            return res.status(200).json({ success: true, received: true });
        }

        const nextStatus = event === "payment.failed" ? "2" : "1";

        const paymentVpa = payment?.vpa || payment?.upi?.vpa || null;
        const paymentUtr = payment?.acquirer_data?.rrn ||
            payment?.acquirer_data?.bank_transaction_id ||
            payment?.upi?.vpa_transaction_id ||
            null;

        await conn.query(
            `
            UPDATE company_subscriptions
            SET payment_status = CASE WHEN payment_status = '0' THEN ? ELSE payment_status END,
                payment_reference = COALESCE(?, payment_reference),
                payment_vpa = COALESCE(?, payment_vpa),
                payment_utr = COALESCE(?, payment_utr),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                nextStatus,
                payment?.id || null,
                paymentVpa,
                paymentUtr,
                rows[0].id
            ]
        );

        await conn.commit();
        return res.status(200).json({ success: true, received: true });
    } catch (error) {
        if (conn) await conn.rollback();
        console.error("[RAZORPAY_WEBHOOK_ERROR]", error);
        return res.status(500).json({ success: false, message: "Webhook processing failed." });
    } finally {
        if (conn) conn.release();
    }
});

router.get("/subscription/:gateway", (req, res) => {
    return res.status(405).json({ success: false, message: "Webhook endpoint requires POST." });
});


export default router;
