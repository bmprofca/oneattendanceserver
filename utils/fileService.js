import fs from "fs/promises";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import sharp from "sharp";


const BASE_URL = "https://api-attendance.onesaas.in";

const BASE_UPLOAD_DIR = path.join(
  process.cwd(),
  "uploads"
);

const MAX_SIZE_MB = 25;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",

  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "text/plain",
  "text/csv",
 
  "application/zip",
  "application/x-zip-compressed",
];

const MIME_EXT_MAP = {

  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",

  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",

  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xlsx",

  "text/plain": "txt",
  "text/csv": "csv",

  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};


async function ensureDir(dir) {
  await fs.mkdir(dir, {
    recursive: true,
  });
}

function generateHash(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

function getYearPath(folder = "common") {

  const year = new Date().getFullYear();

  const fullPath = path.join(
    BASE_UPLOAD_DIR,
    folder,
    String(year)
  );

  return {
    fullPath,
    year,
    folder,
  };
}


function validateFileSignature(
  buffer,
  mime
) {

  if (buffer.length < 4) {
    return false;
  }

  if (mime === "image/jpeg") {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8
    );
  }

  if (mime === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50
    );
  }

  if (mime === "image/webp") {
    return (
      buffer.toString("ascii", 8, 12) ===
      "WEBP"
    );
  }

  if (mime === "application/pdf") {
    return (
      buffer.toString("ascii", 0, 4) ===
      "%PDF"
    );
  }

  if (
    mime === "text/plain" ||
    mime === "text/csv"
  ) {
    return true;
  }

  if (
    mime.includes("word") ||
    mime.includes("sheet") ||
    mime.includes("excel")
  ) {
    return true;
  }

  if (mime.includes("zip")) {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b
    );
  }

  return true;
}

export const saveMediaFromUrl =
  async ({
    url,
    folder = "common",
    optimizeImage = true,
  }) => {

    try {

      if (!url) {
        throw new Error("URL required");
      }
  

      let headResponse;

      try {

        headResponse =
          await axios.head(url, {
            timeout: 5000,
            maxRedirects: 5,
          });

      } catch {

        headResponse =
          await axios.get(url, {
            timeout: 5000,
          });
      }

      if (
        headResponse.status !== 200
      ) {
        throw new Error(
          "Unable to access file"
        );
      }

      const mimeType =
        headResponse.headers[
          "content-type"
        ]?.split(";")[0];

      if (!mimeType) {
        throw new Error(
          "Unknown file type"
        );
      }

      if (
        !ALLOWED_MIME_TYPES.includes(
          mimeType
        )
      ) {
        throw new Error(
          "Unsupported file type"
        );
      }

      const fileResponse =
        await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 20000,
          maxRedirects: 5,
        });

      let buffer = Buffer.from(
        fileResponse.data
      );
 

      const sizeBytes = buffer.length;

      if (
        sizeBytes >
        MAX_SIZE_MB * 1024 * 1024
      ) {
        throw new Error(
          `File exceeds ${MAX_SIZE_MB}MB`
        );
      }

      const validSignature =
        validateFileSignature(
          buffer,
          mimeType
        );

      if (!validSignature) {
        throw new Error(
          "File signature mismatch"
        );
      }

      const hash =
        generateHash(buffer);

      const shortHash =
        hash.substring(0, 16);

      const {
        fullPath,
        year,
        folder: finalFolder,
      } = getYearPath(folder);

      await ensureDir(fullPath);
  

      let width = null;
      let height = null;
      let optimized = false;

      const isImage =
        mimeType.startsWith("image/");

      let ext =
        MIME_EXT_MAP[mimeType] ||
        "bin";

      if (
        isImage &&
        optimizeImage
      ) {

        const image =
          sharp(buffer);

        const metadata =
          await image.metadata();

        width = metadata.width;
        height = metadata.height;

        buffer =
          await image
            .rotate()
            .jpeg({
              quality: 85,
              mozjpeg: true,
            })
            .toBuffer();

        ext = "jpg";

        optimized = true;
      }


      const fileName =
        sanitizeFileName(
          `${Date.now()}-${shortHash}.${ext}`
        );

      const filePath = path.join(
        fullPath,
        fileName
      );
   

      await fs.writeFile(
        filePath,
        buffer
      );

      const fileUrl =
        `/uploads/${finalFolder}/${year}/${fileName}`;

      console.log(fileUrl);

      return {
        success: true,

        file_name: fileName,
        file_url: fileUrl,

        mime_type: mimeType,

        size_bytes: buffer.length,

        size_kb: Number(
          (
            buffer.length / 1024
          ).toFixed(2)
        ),

        hash,

        is_image: isImage,

        optimized,

        width,
        height,
      };

    } catch (error) {

      return {
        success: false,
        message:
          error.message ||
          "File processing failed",
      };
    }
  };

 
export function buildFileUrl(path) {

  if (!path) {
    return null;
  }

  return `${BASE_URL}${path.startsWith("/") ? "" : "/"
    }${path}`;
}