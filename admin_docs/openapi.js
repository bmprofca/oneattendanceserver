import * as adminAuthDoc from './admin_auth.paths.js';
import * as adminUsersDoc from './admin_users.paths.js';
import * as adminCompaniesDoc from './admin_companies.paths.js';
import * as adminSubscriptionsDoc from './admin_subscriptions.paths.js';
import * as adminPackagesDoc from './admin_packages.paths.js';
import * as adminCustomPackagesDoc from './admin_custom_packages.paths.js';
import * as adminDashboardDoc from './admin_dashboard.paths.js';
import { SHARED_SCHEMAS } from '../utils/sharedSchemas.js';

const adminOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'OneAttendance Admin API Reference',
    version: '1.0.0',
    description:
      'Admin panel API documentation for OneAttendance Server. Login: POST /admin/auth/send-otp → POST /admin/auth/verify-otp. Only users with `is_system_admin = 1` can access these endpoints.',
  },
  servers: [{ url: '/', description: 'OneAttendance Admin Server API' }],
  'x-scalar-active-environment': 'development',
  'x-scalar-environments': {
    development: {
      description: 'Local Development Server',
      color: '#E74C3C',
      variables: {
        baseUrl: {
          description: 'API base URL',
          default: 'http://localhost:5000',
        },
        TOKEN: {
          description: 'Bearer Session Token - set after admin login',
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
      ...adminAuthDoc.schemas,
      ...adminUsersDoc.schemas,
      ...adminCompaniesDoc.schemas,
      ...adminSubscriptionsDoc.schemas,
      ...adminPackagesDoc.schemas,
      ...adminCustomPackagesDoc.schemas,
      ...adminDashboardDoc.schemas,
    },
  },
  tags: [
    { name: 'Admin Auth', description: 'Admin authentication via phone OTP' },
    { name: 'Admin Users', description: 'User management (list, create, update, delete)' },
    { name: 'Admin Companies', description: 'Company management (list, create, update, delete)' },
    { name: 'Admin Subscriptions', description: 'Admin subscription monitoring and status updates' },
    { name: 'Admin Packages', description: 'Subscription packages management (list, create, update, delete)' },
    { name: 'Admin Custom Packages', description: 'Custom subscription packages management for specific clients' },
    { name: 'Admin Dashboard', description: 'Admin dashboard statistics and KPIs' },
  ],
  paths: {
    ...adminAuthDoc.paths,
    ...adminUsersDoc.paths,
    ...adminCompaniesDoc.paths,
    ...adminSubscriptionsDoc.paths,
    ...adminPackagesDoc.paths,
    ...adminCustomPackagesDoc.paths,
    ...adminDashboardDoc.paths,
  },
};

export default adminOpenApiSpec;
