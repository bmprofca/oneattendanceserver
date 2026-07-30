export const schemas = {
  WebhookResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      received: { type: 'boolean', example: true },
      gateway: { type: 'string', example: 'razorpay' },
    },
    required: ['success', 'received', 'gateway'],
  },
};

export const paths = {
  '/webhook/subscription/{gateway}': {
    get: {
      tags: ['Webhook'],
      summary: 'Subscription payment callback listener by gateway',
      parameters: [{ name: 'gateway', in: 'path', required: true, schema: { type: 'string' }, example: 'razorpay' }],
      responses: {
        200: {
          description: 'Subscription gateway callback processed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookResponse' },
              example: { success: true, received: true, gateway: 'razorpay' },
            },
          },
        },
      },
    },
  },
};
