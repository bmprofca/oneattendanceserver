export const schemas = {
  UploadFromUrlPayload: {
    type: 'object',
    required: ['picture'],
    properties: {
      picture: { type: 'string', example: 'https://example.com/sample_image.png' },
    },
  },
  UploadResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      file_name: { type: 'string', example: '1700000000000-a1b2c3d4e5f67890.jpg' },
      file_url: { type: 'string', example: '/uploads/profile_pictures/2026/1700000000000-a1b2c3d4e5f67890.jpg' },
      mime_type: { type: 'string', example: 'image/jpeg' },
      size_bytes: { type: 'integer', example: 102400 },
      size_kb: { type: 'number', example: 100 },
      hash: { type: 'string', example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890' },
      is_image: { type: 'boolean', example: true },
      optimized: { type: 'boolean', example: true },
      width: { type: 'integer', nullable: true, example: 800 },
      height: { type: 'integer', nullable: true, example: 600 },
    },
  },
};

export const paths = {
  '/upload/upload-from-url': {
    post: {
      tags: ['Upload'],
      summary: 'Upload media asset from remote image/file URL',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UploadFromUrlPayload' },
            examples: {
              uploadRequest: { summary: 'Upload picture URL', value: { picture: 'https://example.com/photo.jpg' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Uploaded successfully from URL',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UploadResponse' },
              example: {
                success: true,
                file_name: '1700000000000-a1b2c3d4e5f67890.jpg',
                file_url: '/uploads/profile_pictures/2026/1700000000000-a1b2c3d4e5f67890.jpg',
                mime_type: 'image/jpeg',
                size_bytes: 102400,
                size_kb: 100,
                hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890',
                is_image: true,
                optimized: true,
                width: 800,
                height: 600,
              },
            },
          },
        },
        400: {
          description: 'Bad request - Picture URL missing',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              example: { success: false, message: 'Picture URL is required' },
            },
          },
        },
        500: {
          description: 'Internal server error or image download failure',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InternalServerErrorResponse' },
            },
          },
        },
      },
    },
  },
};
