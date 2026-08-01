import express from "express";
import adminAuthRoutes from "./auth.js";
import adminUsersRoutes from "./users.js";
import adminCompaniesRoutes from "./companies.js";
import adminSubscriptionsRoutes from "./subscriptions.js";

const router = express.Router();

router.use("/auth", adminAuthRoutes);
router.use("/users", adminUsersRoutes);
router.use("/companies", adminCompaniesRoutes);
router.use("/subscriptions", adminSubscriptionsRoutes);

export default router;
