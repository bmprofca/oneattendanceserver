import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { apiReference } from '@scalar/express-api-reference';
import routes from './routes/index.js';
import "./cron/index.js";
import path from "path";
import { PORT, SMTP_HOST } from "./config/config.js";
import { generateDatabaseContext } from "./config/generateDatabaseContext.js";
import { verifySmtpConnection } from "./config/mail.config.js";
import { triggerEmailQueue } from "./email/services/emailQueueWorker.js";
import openApiSpec from './docs/openapi.js';
import { scalarApiReferenceConfig } from './docs/scalar.js';
import adminRoutes from './admin_routes/index.js';
import adminOpenApiSpec from './admin_docs/openapi.js';
import { adminScalarApiReferenceConfig } from './admin_docs/scalar.js';
import fetchAndSaveTemplates from './whatsappTemplates/getTemplates.js';
import mediaRoutes from './routes/media.js';
import { initB2Storage } from './utils/b2Storage.js';
import { ensureSettingsLoaded } from './config/settingsStore.js';

const app = express();

const allowedOrigins = new Set([
  "https://oneattendance.in",
  "https://www.oneattendance.in",
  "https://app.oneattendance.in",
  "https://admin.oneattendance.in",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json({
  limit: "10mb",
  verify: (req, res, buffer) => {
    if (req.originalUrl.startsWith('/webhook/')) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.use(
  '/docs',
  apiReference({
    content: openApiSpec,
    ...scalarApiReferenceConfig,
  })
);

app.get('/admin/openapi.json', (req, res) => {
  res.json(adminOpenApiSpec);
});

app.use(
  '/admin/docs',
  apiReference({
    content: adminOpenApiSpec,
    ...adminScalarApiReferenceConfig,
  })
);

app.use('/api/media', mediaRoutes);
app.use('/media', mediaRoutes);
app.use('/admin', adminRoutes);
app.use('/', routes);

app.set("trust proxy", true);

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "30d",
    immutable: true
  })
);

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON body" });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
  try {
    await ensureSettingsLoaded();
    console.log('✅ Settings loaded');
  } catch (error) {
    console.error('⚠️ Settings load failed, using environment values:', error.message);
  }

  try {
    const context = await generateDatabaseContext();

    console.log(
      `📦 Database context saved (${context.table_count} tables) → database-context.json`
    );
  } catch (err) {
    console.error("⚠️ Database context generation failed:", err.message);
  }

  try {
    await initB2Storage();
    console.log('✅ Backblaze B2 storage initialized');
  } catch (error) {
    console.warn('⚠️ Backblaze B2 storage init skipped:', error.message);
  }

  try {
    await verifySmtpConnection();
    console.log(`✅ SMTP ready (${SMTP_HOST})`);
  } catch (err) {
    console.error("❌ SMTP verification failed:", err.message);
  }

  try {
    await fetchAndSaveTemplates();
  } catch (error) {
    console.warn('WhatsApp template sync skipped:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API docs available at http://localhost:${PORT}/docs`);
    console.log(`Admin API docs available at http://localhost:${PORT}/admin/docs`);
  });
};

triggerEmailQueue().catch(console.error);

startServer();