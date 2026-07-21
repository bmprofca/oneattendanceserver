import fs from "fs/promises";
import path from "path";
import { ROOT_QUEUE_DIR, QUEUE_PATHS, EMAIL_TEMPLATES } from "../config.js";
import { EMAIL_SENDERS } from "./email.processor.js";

const PRIORITY_ORDER = [
    "high",
    "medium",
    "low"
];


async function ensureQueueDirectories() {

    const allDirs = [];

    for (const type of Object.values(QUEUE_PATHS)) {

        for (const dir of Object.values(type)) {
            allDirs.push(dir);
        }
    }

    await Promise.all(
        allDirs.map((dir) =>
            fs.mkdir(dir, {
                recursive: true
            })
        )
    );
}

async function getNextJobFile() {

    for (const priority of PRIORITY_ORDER) {

        const pendingDir = QUEUE_PATHS.pending[priority];

        let files = [];

        try {

            files = await fs.readdir(pendingDir);

        } catch (err) {

            if (err.code === "ENOENT") {
                continue;
            }

            throw err;
        }

        if (!files.length) {
            continue;
        }

        files.sort();

        const file = files[0];

        return {
            priority,
            file,
            pendingPath: path.join(
                pendingDir,
                file
            ),
            processingPath: path.join(
                QUEUE_PATHS.processing[priority],
                file
            )
        };
    }

    return null;
}

async function moveFile(from, toDir) {

    await fs.mkdir(toDir, {
        recursive: true
    });

    const destination = path.join(
        toDir,
        path.basename(from)
    );

    await fs.rename(
        from,
        destination
    );

    return destination;
}

async function readJsonFile(filePath) {

    const raw = await fs.readFile(
        filePath,
        "utf8"
    );

    return JSON.parse(raw);
}

async function writeJsonFile(filePath, data) {

    await fs.writeFile(
        filePath,
        JSON.stringify(data),
        "utf8"
    );
}

async function moveToFailed({ priority, processingPath, job, error }) {

    const failedPath =
        path.join(
            QUEUE_PATHS.failed[priority],
            path.basename(processingPath)
        );

    const failedJob = {
        ...job,
        failed_at: Date.now(),
        error: error?.message || String(error)
    };

    await writeJsonFile(
        processingPath,
        failedJob
    );

    await moveFile(
        processingPath,
        QUEUE_PATHS.failed[priority]
    );

    return failedPath;
}

async function retryJob({ priority, processingPath, job, error }) {

    const retryJobData = {
        ...job,
        last_error:
            error?.message || String(error),
        last_attempt_at:
            Date.now()
    };

    await writeJsonFile(
        processingPath,
        retryJobData
    );

    return moveFile(
        processingPath,
        QUEUE_PATHS.pending[priority]
    );
}

export async function processNextEmailQueue() {

    await ensureQueueDirectories();

    const nextJob = await getNextJobFile();

    if (!nextJob) {

        return {
            success: true,
            message: "No pending emails"
        };
    }

    const {
        priority,
        pendingPath,
        processingPath,
        file
    } = nextJob;

    let job = null;

    try {
   

        await fs.rename(
            pendingPath,
            processingPath
        );


        job = await readJsonFile(
            processingPath
        );

        if (!job || typeof job !== "object") {

            throw new Error(
                "Invalid queue job format"
            );
        }

        const {
            type,
            payload
        } = job;
      

        if (!type || typeof type !== "string") {

            throw new Error(
                "Queue job missing type"
            );
        }
    

        const sender = EMAIL_SENDERS[type];

        if (typeof sender !== "function") {

            throw new Error(
                `No sender found for ${type}`
            );
        }

        await sender(payload);
  

        await fs.unlink(
            processingPath
        );

        return {
            success: true,
            priority,
            type,
            file
        };

    } catch (err) {

        console.error(
            "EMAIL QUEUE ERROR:",
            err.message
        );

        try {
      

            if (!job) {

                await moveFile(
                    processingPath,
                    QUEUE_PATHS.failed[priority]
                );

                return {
                    success: false,
                    moved_to_failed: true,
                    reason:
                        "Invalid queue job",
                    error: err.message
                };
            }


            job.attempts = Number(job.attempts || 0) + 1;


            if (job.attempts >= Number(job.max_attempts || 3)) {

                await moveToFailed({
                    priority,
                    processingPath,
                    job,
                    error: err
                });

                return {
                    success: false,
                    moved_to_failed: true,
                    attempts:
                        job.attempts,
                    error: err.message
                };
            }

            await retryJob({
                priority,
                processingPath,
                job,
                error: err
            });

            return {
                success: false,
                retrying: true,
                attempts:job.attempts,
                error: err.message
            };

        } catch (retryErr) {

            console.error(
                "QUEUE RECOVERY ERROR:",
                retryErr.message
            );

            return {
                success: false,
                fatal: true,
                error: retryErr.message
            };
        }
    }
}

export async function cleanupFailedEmails({ olderThanHours = 72 } = {}) {

    await ensureQueueDirectories();

    const deleted = [];

    const cutoff =
        Date.now() -
        (
            Number(olderThanHours) *
            60 *
            60 *
            1000
        );

    for (const priority of PRIORITY_ORDER) {

        const failedDir =
            QUEUE_PATHS.failed[priority];

        let files = [];

        try {

            files = await fs.readdir(
                failedDir
            );

        } catch (err) {

            if (err.code !== "ENOENT") {

                console.error(
                    "FAILED DIR ERROR:",
                    err.message
                );
            }

            continue;
        }

        for (const file of files) {

            const filePath =
                path.join(
                    failedDir,
                    file
                );

            try {

                const stats =
                    await fs.stat(filePath);

                const modifiedAt =
                    stats.mtimeMs;

                if (
                    modifiedAt > cutoff
                ) {
                    continue;
                }

                await fs.unlink(
                    filePath
                );

                deleted.push({
                    priority,
                    file
                });

            } catch (err) {

                console.error(
                    "FAILED CLEANUP ERROR:",
                    err.message
                );
            }
        }
    }

    return {
        success: true,
        deleted_count:
            deleted.length,
        deleted
    };
}