import fs from "fs/promises";
import path from "path";
import { ROOT_QUEUE_DIR, QUEUE_PATHS, EMAIL_TEMPLATES, EMAIL_PRIORITIES } from "../config.js";
import { triggerEmailQueue } from "../../email/services/emailQueueWorker.js";

export const VALID_EMAIL_TYPES = Object.freeze(Object.keys(EMAIL_PRIORITIES));

export async function queueEmail({ type, payload = {}, maxAttempts = 3 }) {

    console.log("QUEUE CALLED:", type);

    if (!type || typeof type !== "string") {
        throw new Error("Valid email type required");
    }

    if (!VALID_EMAIL_TYPES.includes(type)) {
        throw new Error(`Unsupported email type: ${type}`);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Payload must be object");
    }

    if (!Number.isInteger(Number(maxAttempts)) || Number(maxAttempts) <= 0) {
        throw new Error("Invalid maxAttempts");
    }

    const priority = EMAIL_PRIORITIES[type];

    const queueDir = QUEUE_PATHS.pending[priority];

    if (!queueDir) {
        throw new Error(`Queue path missing for ${type}`);
    }

    await fs.mkdir(queueDir, { recursive: true });

    const timestamp = Date.now();

    const nano = process.hrtime.bigint().toString().slice(-6);

    const fileName = `${timestamp}-${nano}.json`;

    const filePath = path.join(queueDir, fileName);

    const job = { type, payload, attempts: 0, max_attempts: Number(maxAttempts), created_at: timestamp };

    try {
        await fs.writeFile(filePath, JSON.stringify(job), "utf8");
    } catch (err) {
        throw new Error(`Queue write failed: ${err.message}`);
    }

    triggerEmailQueue().catch(console.error);

    return {
        success: true,
        priority,
        file: fileName
    };
}