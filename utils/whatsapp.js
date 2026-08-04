import axios from 'axios';
import { ONECHATTING_SEND_TOKEN, ONECHATTING_SEND_URL, } from '../config/config.js';
import { normalizeIndianMobile } from './mobile.js';

const TEMPLATES = Object.freeze({
  login_otp: () => import('../whatsappTemplates/otpTemplate.js'),
  oa_subscription_expire_alert: () => import('../whatsappTemplates/subscriptionAlertTemplate.js'),
  oa_subscription_expired_notice: () => import('../whatsappTemplates/subscriptionRenewalTemplate.js'),
});

const loadTemplate = async (templateName) => {
  const importer = TEMPLATES[templateName];
  if (!importer) {
    throw new Error(`Unknown WhatsApp template: ${templateName}`);
  }
  const module = await importer();
  return module.default ?? module;
};


const normalizeParams = (params) => {
  if (Array.isArray(params)) {
    return params.map((value) => String(value ?? '').trim());
  }

  if (params && typeof params === 'object') {
    const name = String(
      params.companyName ?? params.company_name ?? params.name ?? params.first_name ?? params.customer_name ?? 'Customer'
    ).trim();
    const pkg = String(
      params.packageName ?? params.package_name ?? params.service_name ?? params.service ?? ''
    ).trim();
    const days = String(
      params.daysRemaining ?? params.days_remaining ?? ''
    ).trim();
    const date = String(
      params.expiryDate ?? params.expiredOnDate ?? params.expired_on ?? params.expires_at ?? ''
    ).trim();

    return [name, pkg, days, date].filter(Boolean);
  }

  return [String(params ?? '').trim()].filter(Boolean);
};

const buildComponents = (template, values = [], headerMedia = {}, otp = null) => {
  const components = [];
  const templateComponents = template?.template?.components ?? [];

  const header = templateComponents.find((c) => c.type === 'HEADER');
  if (header) {
    const format = header.format?.toLowerCase();
    if (['image', 'video', 'document'].includes(format)) {
      const link = headerMedia[format] ?? header.example?.header_handle?.[0];
      if (link) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: format,
              [format]: { link },
            },
          ],
        });
      }
    } else if (format === 'text') {
      const text = headerMedia.text ?? header.example?.header_text?.[0];
      if (text) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: 'text',
              text,
            },
          ],
        });
      }
    }
  }


  const body = templateComponents.find((c) => c.type === 'BODY');
  if (body) {
    const placeholderMatches = body.text?.match(/\{\{\d+\}\}/g) ?? [];
    const variableCount = placeholderMatches.length;

    if (variableCount > 0) {
      components.push({
        type: 'body',
        parameters: values.slice(0, variableCount).map((value) => ({
          type: 'text',
          text: String(value ?? ''),
        })),
      });
    } else if (otp) {
      components.push({
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: String(otp),
          },
        ],
      });
    } else if (values.length > 0) {
      components.push({
        type: 'body',
        parameters: values.map((value) => ({
          type: 'text',
          text: String(value ?? ''),
        })),
      });
    }
  }

  const buttonsComp = templateComponents.find((c) => c.type === 'BUTTONS');
  if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
    buttonsComp.buttons.forEach((button, index) => {
      if (button.type === 'OTP' && otp) {
        components.push({
          type: 'button',
          sub_type: button.otp_type === 'COPY_CODE' ? 'url' : 'otp',
          index: String(index),
          parameters: [
            {
              type: 'text',
              text: String(otp),
            },
          ],
        });
      }
    });
  }

  return components;
};

const postTemplateMessage = (payload, token) =>
  axios.post(ONECHATTING_SEND_URL, payload, {
    headers: {
      token,
      'Content-Type': 'application/json',
    },
  });

export const formatWhatsAppMobile = normalizeIndianMobile;


export const sendTemplateMessage = async ({
  templateName,
  mobile,
  params = [],
  headerMedia,
  otp,
}) => {
  const token = String(ONECHATTING_SEND_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('ONECHATTING_SEND_TOKEN is required');
  }

  const template = await loadTemplate(templateName);
  const normalizedMobile = normalizeIndianMobile(mobile);

  const templateParams = normalizeParams(params);
  const builtComponents = buildComponents(template, templateParams, headerMedia, otp);
  const payload = {
    number: normalizedMobile,
    template_id: template.template_id,
    components: builtComponents,
    component: builtComponents,
  };

  try {
    console.dir(payload, { depth: null });
    const response = await postTemplateMessage(payload, token);
    return response.data;
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.status);
    if (error.response?.data) {
      console.dir(error.response.data, { depth: null });
    }
    throw error;
  }
};


export const sendOtpWhatsApp = async (mobile, otp) => {
  return sendTemplateMessage({
    templateName: 'login_otp',
    mobile,
    params: [],
    otp,
  });
};


export const sendSubscriptionAlertWhatsApp = async (mobile, params) => {
  return sendTemplateMessage({
    templateName: 'oa_subscription_expire_alert',
    mobile,
    params,
  });
};


export const sendSubscriptionRenewalWhatsApp = async (mobile, params) => {
  return sendTemplateMessage({
    templateName: 'oa_subscription_expired_notice',
    mobile,
    params,
  });
};

export default {
  sendTemplateMessage,
  sendOtpWhatsApp,
  sendSubscriptionAlertWhatsApp,
  sendSubscriptionRenewalWhatsApp,
  formatWhatsAppMobile,
};
