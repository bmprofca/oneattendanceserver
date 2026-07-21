import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import "./cron/index.js";
import path from "path";
import { generateDatabaseContext } from "./config/generateDatabaseContext.js";
import { verifySmtpConnection } from "./config/mail.config.js";
import { triggerEmailQueue } from "./email/services/emailQueueWorker.js";


const app = express();
const PORT = process.env.PORT || 7736;

app.use(cors({
  origin: true,
  credentials: true
}));


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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
    const context = await generateDatabaseContext();

    console.log(
      `📦 Database context saved (${context.table_count} tables) → database-context.json`
    );
  } catch (err) {
    console.error("⚠️ Database context generation failed:", err.message);
  }

  try {
    await verifySmtpConnection();
    console.log(`✅ SMTP ready (${process.env.SMTP_HOST})`);
  } catch (err) {
    console.error("❌ SMTP verification failed:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

triggerEmailQueue().catch(console.error);

startServer();