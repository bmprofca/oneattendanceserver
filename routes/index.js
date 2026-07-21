import express from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import companyRoutes from "./company.js";
import companyInviteRoutes from "./company_invites.js";
import usersRoutes from "./users.js";
import employeeRoutes from "./employee.js";
import permissionsRoutes from "./permissions.js";
import constantsRoutes from "./constants.js";
import attendanceRoutes from "./attendance.js";
import leaveRoutes from "./leave.js";
import holidayRoutes from "./holiday.js";
import payrollRoutes from "./payroll.js";
import salaryRoutes from "./salary.js";
import shiftRoutes from "./shift.js";
import uploadRoutes from "./uploadRoutes.js";
import bankAccountRoutes from "./bank_accounts.js";
import transactionsRoutes from "./transactions.js";
import financeRoutes from "./finance.js";
import subscriptionRoutes from "./subscriptions.js";
import webhookRoutes from "./webhook.js";


const router = express.Router();


router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/company', companyRoutes);
router.use('/company/invites', companyInviteRoutes);
router.use('/users', usersRoutes);
router.use('/employees', employeeRoutes);
router.use('/permissions/', permissionsRoutes);
router.use('/constants/', constantsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leave', leaveRoutes);
router.use('/holiday', holidayRoutes);
router.use('/payroll', payrollRoutes);
router.use('/salary', salaryRoutes);
router.use('/shifts', shiftRoutes);
router.use('/upload', uploadRoutes);
router.use('/bank-accounts', bankAccountRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/finance', financeRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/webhook', webhookRoutes);


export default router;