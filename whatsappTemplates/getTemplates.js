import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { ONECHATTING_TEMPLATE_TOKEN } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_LIST_URL =
  'https://server.onechatting.com/developer/template/template-list';

const OUTPUT_MAP = {
  otp: path.join(__dirname, 'otpTemplate.js'),
  task_create: path.join(__dirname, 'taskTemplate.js'),
  payment_received: path.join(__dirname, 'paymentTemplate.js'),
  task_complete: path.join(__dirname, 'taskCompleteTemplate.js'),
};

const buildTemplateSource = (template) =>
  `export default ${JSON.stringify(template, null, 2)};\n`;

export const fetchAndSaveTemplates = async () => {
  const token = String(ONECHATTING_TEMPLATE_TOKEN ?? '').trim();

  if (!token) {
    throw new Error('ONECHATTING_TEMPLATE_TOKEN is required');
  }

  const response = await axios.get(TEMPLATE_LIST_URL, {
    headers: {
      token: token,
    },
  });

  const templates = Array.isArray(response.data?.data)
    ? response.data.data
    : Array.isArray(response.data)
      ? response.data
      : [];

  const selectedTemplates = templates.filter((template) =>
    ['otp', 'task_create', 'payment_received', 'task_complete'].includes(
      String(template?.template_name ?? template?.name ?? '').trim()
    )
  );

  for (const template of selectedTemplates) {
    const templateName = String(
      template?.template_name ?? template?.name ?? ''
    ).trim();
    const outputPath = OUTPUT_MAP[templateName];

    if (!outputPath) continue;

    await fs.writeFile(outputPath, buildTemplateSource(template), 'utf8');
  }

  return selectedTemplates;
};

export default fetchAndSaveTemplates;
