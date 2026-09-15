import * as healthDoc from './paths/health.paths.js';
import * as authDoc from './paths/auth.paths.js';
import * as companyDoc from './paths/company.paths.js';
import * as companyInvitesDoc from './paths/company_invites.paths.js';
import * as usersDoc from './paths/users.paths.js';
import * as employeeDoc from './paths/employee.paths.js';
import * as permissionsDoc from './paths/permissions.paths.js';
import * as constantsDoc from './paths/constants.paths.js';
import * as attendanceDoc from './paths/attendance.paths.js';
import * as leaveDoc from './paths/leave.paths.js';
import * as holidayDoc from './paths/holiday.paths.js';
import * as payrollDoc from './paths/payroll.paths.js';
import * as salaryDoc from './paths/salary.paths.js';
import * as shiftDoc from './paths/shift.paths.js';
import * as uploadDoc from './paths/upload.paths.js';
import * as bankAccountsDoc from './paths/bank_accounts.paths.js';
import * as transactionsDoc from './paths/transactions.paths.js';
import * as financeDoc from './paths/finance.paths.js';
import * as subscriptionsDoc from './paths/subscriptions.paths.js';
import * as webhookDoc from './paths/webhook.paths.js';
import { SHARED_SCHEMAS } from '../utils/sharedSchemas.js';

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'OneAttendance API Reference',
    version: '1.0.0',
    description:
      'Interactive API documentation for OneAttendance Server. Sign up: POST /auth/signup/request-otp → POST /auth/signup/verify-otp. Login: POST /auth/login/request-otp → POST /auth/login/verify-otp. The session TOKEN is auto-saved to the Scalar environment after successful authentication.',
  },
  servers: [{ url: '/', description: 'OneAttendance Server API' }],
  'x-scalar-active-environment': 'development',
  'x-scalar-environments': {
    development: {
      description: 'Local Development Server',
      color: '#7ED321',
      variables: {
        baseUrl: {
          description: 'API base URL',
          default: 'http://localhost:5000',
        },
        TOKEN: {
          description: 'Bearer Session Token - auto-saved after login',
          default: '',
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'TOKEN',
        description: 'Pass bearer session token in Authorization header: `Bearer {{TOKEN}}`',
      },
    },
    schemas: {
      ...SHARED_SCHEMAS,
      ...healthDoc.schemas,
      ...authDoc.schemas,
      ...companyDoc.schemas,
      ...companyInvitesDoc.schemas,
      ...usersDoc.schemas,
      ...employeeDoc.schemas,
      ...permissionsDoc.schemas,
      ...constantsDoc.schemas,
      ...attendanceDoc.schemas,
      ...leaveDoc.schemas,
      ...holidayDoc.schemas,
      ...payrollDoc.schemas,
      ...salaryDoc.schemas,
      ...shiftDoc.schemas,
      ...uploadDoc.schemas,
      ...bankAccountsDoc.schemas,
      ...transactionsDoc.schemas,
      ...financeDoc.schemas,
      ...subscriptionsDoc.schemas,
      ...webhookDoc.schemas,
    },
  },
  tags: [
    { name: 'Health', description: 'System health & probe endpoints' },
    { name: 'Auth', description: 'Authentication, registration, OTP, and session management' },
    { name: 'Company', description: 'Company profile & settings management' },
    { name: 'Company Invites', description: 'Company join invitation requests' },
    { name: 'Users', description: 'User profile management' },
    { name: 'Employees', description: 'Employee records and directory management' },
    { name: 'Attendance', description: 'Clock-in, clock-out, and attendance logs' },
    { name: 'Leave', description: 'Leave application and approval workflows' },
    { name: 'Holidays', description: 'Company holiday calendar management' },
    { name: 'Payroll', description: 'Monthly payroll generation & processing' },
    { name: 'Salary', description: 'Salary structure & PDF payslip generation' },
    { name: 'Shifts', description: 'Work shift scheduling & grace period management' },
    { name: 'Upload', description: 'File and media asset upload service' },
    { name: 'Bank Accounts', description: 'Company bank account management' },
    { name: 'Transactions', description: 'Company transaction ledger & history' },
    { name: 'Finance', description: 'Financial overview statistics' },
    { name: 'Subscriptions', description: 'Subscription plans and billing' },
    { name: 'Permissions', description: 'Permission package definitions' },
    { name: 'Constants', description: 'System enum and constant values' },
    { name: 'Webhook', description: 'Payment gateway callback webhooks' },
  ],
  paths: {
    ...healthDoc.paths,
    ...authDoc.paths,
    ...companyDoc.paths,
    ...companyInvitesDoc.paths,
    ...usersDoc.paths,
    ...employeeDoc.paths,
    ...permissionsDoc.paths,
    ...constantsDoc.paths,
    ...attendanceDoc.paths,
    ...leaveDoc.paths,
    ...holidayDoc.paths,
    ...payrollDoc.paths,
    ...salaryDoc.paths,
    ...shiftDoc.paths,
    ...uploadDoc.paths,
    ...bankAccountsDoc.paths,
    ...transactionsDoc.paths,
    ...financeDoc.paths,
    ...subscriptionsDoc.paths,
    ...webhookDoc.paths,
  },
};

export default openApiSpec;
