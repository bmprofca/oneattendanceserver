import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ONECHATTING_TEMPLATE_TOKEN, TEMPLATE_LIST_URL, } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_MAP = {
  login_otp: path.join(__dirname, 'otpTemplate.js'),
  oa_subscription_expired_notice: path.join(__dirname, 'subscriptionRenewalTemplate.js'),
  oa_subscription_expire_alert: path.join(__dirname, 'subscriptionAlertTemplate.js'),
};

const REQUIRED_TEMPLATES = new Set(Object.keys(OUTPUT_MAP));

const getTemplateName = (template) =>
  String(template?.template_name ?? template?.name ?? '').trim();

const getTemplates = (response) => {
  if (Array.isArray(response.data?.data)) {
    return response.data.data;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  return [];
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
      token,
    },
  });

  const templates = getTemplates(response);

  const selectedTemplates = templates.filter((template) =>
    REQUIRED_TEMPLATES.has(getTemplateName(template))
  );

  await Promise.all(
    selectedTemplates.map(async (template) => {
      const outputPath = OUTPUT_MAP[getTemplateName(template)];

      if (!outputPath) {
        return;
      }

      await fs.writeFile(
        outputPath,
        buildTemplateSource(template),
        'utf8'
      );
    })
  );

  return selectedTemplates;
};

export default fetchAndSaveTemplates;