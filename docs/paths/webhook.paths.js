export const schemas = {
  WebhookResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      received: { type: 'boolean', example: true },
      gateway: { type: 'string', example: 'razorpay' },
    },
    required: ['success', 'received'],
  },
};

export const paths = {
  '/webhook/subscription/{gateway}': {
    post: {
      tags: ['Webhook'],
      summary: 'Verify and process a Razorpay subscription webhook',
      parameters: [
        { name: 'gateway', in: 'path', required: true, schema: { type: 'string', enum: ['razorpay'] }, example: 'razorpay' },
        { name: 'x-razorpay-signature', in: 'header', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Subscription gateway callback processed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookResponse' },
              example: { success: true, received: true },
            },
          },
        },
      },
    },
  },
};
