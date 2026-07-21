import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { OpeningBalance } from "../utils/Balance.js";
const router = express.Router();


router.get("/employee-ledger-report", auth(), async (req, res) => {
    try {
        const { user_id, from_date, to_date } = req.query;

        const opening_balance = await OpeningBalance({ party_id: user_id, party_type: 'employee', date: from_date });


        const [rows] = await db.query(`SELECT * FROM transactions WHERE party2_id = ? AND party2_type = ? AND transaction_date BETWEEN ? AND ?`, [user_id, 'employee', from_date, to_date]);

        return res.status(200).json({
            success: true,
            data: {
                opening_balance,
                records: [],
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

export default router;