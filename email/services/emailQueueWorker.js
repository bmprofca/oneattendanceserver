import { processNextEmailQueue } from "../../email/services/email.processQueue.js";

let isProcessing = false;

export async function triggerEmailQueue() {
    if (isProcessing) {
        return;
    }

    isProcessing = true;

    try {
        while (true) {
            console.log("[EMAIL QUEUE WORKER] Checking for pending emails...");
            const result = await processNextEmailQueue();

            if (result?.message === "No pending emails") {
                break;
            }
        }
    } catch (err) {
        console.error("EMAIL QUEUE WORKER ERROR:", err);
    } finally {
        isProcessing = false;
    }
}