import axios from 'axios';

import { ONECHATTING_SEND_URL, ONECHATTING_SEND_TOKEN } from '../config/config.js';
import { formatIndianMobileForSend } from './mobile.js';

const templates = {
  otp: () => import('../whatsappTemplates/otpTemplate.js'),
  task_create: () => import('../whatsappTemplates/taskTemplate.js'),
  payment_received: () => import('../whatsappTemplates/paymentTemplate.js'),
  task_complete: () => import('../whatsappTemplates/taskCompleteTemplate.js'),
  subscription_alert: () => import('../whatsappTemplates/subscriptionAlertTemplate.js'),
  subscription_renewal: () => import('../whatsappTemplates/subscriptionRenewalTemplate.js'),
};

const loadTemplate = async (name) => {
  const importer = templates[name];

  if (!importer) {
    throw new Error(`Unknown WhatsApp template: ${name}`);
  }

  const module = await importer();
  return module.default ?? module;
};

const normalizeParams = (params) => {
  if (Array.isArray(params)) {
    return params.map((value) => String(value ?? '').trim()).filter(Boolean);
  }

  if (params && typeof params === 'object') {
    const name = String(
      params.name ?? params.first_name ?? params.customer_name ?? 'Customer'
    ).trim();
    const amount = String(
      params.amount ?? params.paid_amount ?? params.payment_amount ?? ''
    ).trim();
    const taskDetails = String(
      params.task_details ?? params.task ?? params.message ?? ''
    ).trim();
    const serviceName = String(
      params.service_name ?? params.service ?? params.serviceTitle ?? ''
    ).trim();
    const receiptNumber = String(
      params.receipt_no ?? params.receipt_number ?? params.utr ?? params.payment_id ?? ''
    ).trim();

    return [name, amount, serviceName, receiptNumber, taskDetails].filter(Boolean);
  }

  return [String(params ?? '').trim()].filter(Boolean);
};

const buildComponents = (template, values, headerMedia = {}) => {
  const components = [];
  const templateComponents = template?.template?.components ?? [];

  const header = templateComponents.find((c) => c.type === 'HEADER');

  if (header) {
    switch (header.format) {
      case 'IMAGE': {
        const imageLink =
          headerMedia.image ?? header.example?.header_handle?.[0];

        if (imageLink) {
          components.push({
            type: 'header',
            parameters: [
              {
                type: 'image',
                image: {
                  link: imageLink,
                },
              },
            ],
          });
        }
        break;
      }

      case 'VIDEO': {
        const videoLink =
          headerMedia.video ?? header.example?.header_handle?.[0];

        if (videoLink) {
          components.push({
            type: 'header',
            parameters: [
              {
                type: 'video',
                video: {
                  link: videoLink,
                },
              },
            ],
          });
        }
        break;
      }

      case 'DOCUMENT': {
        const documentLink =
          headerMedia.document ?? header.example?.header_handle?.[0];

        if (documentLink) {
          components.push({
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  link: documentLink,
                },
              },
            ],
          });
        }
        break;
      }

      case 'TEXT': {
        const text =
          headerMedia.text ?? header.example?.header_text?.[0];

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
        break;
      }
    }
  }

  const body = templateComponents.find((c) => c.type === 'BODY');

  if (body) {
    const count = (body.text?.match(/\{\{\d+\}\}/g) ?? []).length;

    components.push({
      type: 'body',
      parameters: values.slice(0, count || values.length).map((value) => ({
        type: 'text',
        text: String(value),
      })),
    });
  }

  return components;
};

export const formatWhatsAppMobile = formatIndianMobileForSend;

const postTemplateMessage = async (url, payload, token) =>
  axios.post(url, payload, {
    headers: {
      token,
      'Content-Type': 'application/json',
    },
  });

export const sendTemplateMessage = async ({
  templateName,
  mobile,
  params = [],
  headerMedia,
}) => {
  const token = String(ONECHATTING_SEND_TOKEN ?? '').trim();

  if (!token) {
    throw new Error('ONECHATTING_SEND_TOKEN is required');
  }

  const template = await loadTemplate(templateName);
  const normalizedMobile = formatIndianMobileForSend(mobile);

  const templateParams = normalizeParams(params);
  const payload = {
    number: normalizedMobile,
    template_id: template.template_id,
    component: buildComponents(template, templateParams, headerMedia),
  };

  try {
    const response = await postTemplateMessage(
      ONECHATTING_SEND_URL,
      payload,
      token
    );

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
    templateName: 'otp',
    mobile: mobile,
    params: [otp],
  });
};

export const sendTaskWhatsApp = async (mobile, taskDetails, serviceImage) => {
  return sendTemplateMessage({
    templateName: 'task_create',
    mobile,
    params: taskDetails,
    headerMedia: {
      image: serviceImage,
    },
  });
};

export const sendPaymentReceviedWhatsApp = async (
  mobile,
  paymentDetails,
  paymentImage
) => {
  return sendTemplateMessage({
    templateName: 'payment_received',
    mobile: mobile,
    params: paymentDetails,
    headerMedia: {
      image: paymentImage,
    },
  });
};

export const sendTaskCompleteWhatsApp = async (
  mobile,
  taskDetails,
  serviceImage
) => {
  return sendTemplateMessage({
    templateName: 'task_complete',
    mobile,
    params: taskDetails,
    headerMedia: {
      image: serviceImage,
    },
  });
};

// params: [companyName, packageName, startDate, expiryDate, daysRemaining]
export const sendSubscriptionAlertWhatsApp = async (mobile, params) => {
  return sendTemplateMessage({
    templateName: 'subscription_alert',
    mobile,
    params,
  });
};

// params: [companyName, packageName, startDate, expiredOnDate]
export const sendSubscriptionRenewalWhatsApp = async (mobile, params) => {
  return sendTemplateMessage({
    templateName: 'subscription_renewal',
    mobile,
    params,
  });
};

export default {
  sendTemplateMessage,
  sendOtpWhatsApp,
  sendTaskWhatsApp,
  sendPaymentReceviedWhatsApp,
  sendTaskCompleteWhatsApp,
  sendSubscriptionAlertWhatsApp,
  sendSubscriptionRenewalWhatsApp,
  formatWhatsAppMobile,
};
