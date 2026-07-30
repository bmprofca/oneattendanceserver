export const schemas = {
  HealthResponse: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'healthy' },
    },
  },
  RootHealthResponse: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'OneAttendance API' },
      status: { type: 'string', example: 'ok' },
    },
  },
};

export const paths = {
  '/': {
    get: {
      tags: ['Health'],
      summary: 'Root API status check',
      description: 'Returns API name and status indicator.',
      responses: {
        200: {
          description: 'API operational status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RootHealthResponse' },
              example: {
                message: 'OneAttendance API',
                status: 'ok',
              },
            },
          },
        },
      },
    },
  },
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      description: 'System health check probe.',
      responses: {
        200: {
          description: 'System healthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthResponse' },
              example: {
                status: 'healthy',
              },
            },
          },
        },
      },
    },
  },
};
