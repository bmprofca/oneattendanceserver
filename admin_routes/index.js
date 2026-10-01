import express from "express";
import adminAuthRoutes from "./auth.js";
import adminUsersRoutes from "./users.js";
import adminCompaniesRoutes from "./companies.js";
import adminSubscriptionsRoutes from "./subscriptions.js";
import adminPackagesRoutes from "./packages.js";
import adminCustomPackagesRoutes from "./custom_packages.js";
import adminDashboardRoutes from "./dashboard.js";
import adminSettingsRoutes from "./settings.js";
import adminWebsiteRoutes from "./website.js";

const router = express.Router();

router.use("/auth", adminAuthRoutes);
router.use("/users", adminUsersRoutes);
router.use("/companies", adminCompaniesRoutes);
router.use("/subscriptions", adminSubscriptionsRoutes);
router.use("/packages", adminPackagesRoutes);
router.use("/custom-packages", adminCustomPackagesRoutes);
router.use("/dashboard", adminDashboardRoutes);
router.use("/settings", adminSettingsRoutes);
router.use("/website", adminWebsiteRoutes);

export default router;
