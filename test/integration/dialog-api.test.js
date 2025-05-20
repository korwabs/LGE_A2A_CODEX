const request = require('supertest');
const express = require('express');
const { apiRouter } = require('@/api/routes/dialog');

// Mock dependencies
jest.mock('@/services/a2a-router', () => {
  return {
    a2aRouter: {
      sendMessage: jest.fn().mockResolvedValue({ response: 'Dialog response' })
    }
  };
});

describe('Dialog API Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/dialog', apiRouter);
  });

  test('POST /api/dialog/message - should process user message', async () => {
    const response = await request(app)
      .post('/api/dialog/message')
      .send({
        userId: 'user123',
        message: 'I want to buy a TV',
        sessionId: 'session123'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('response');
    expect(response.body.response).toBe('Dialog response');
  });

  test('POST /api/dialog/message - should handle missing userId', async () => {
    const response = await request(app)
      .post('/api/dialog/message')
      .send({
        message: 'I want to buy a TV',
        sessionId: 'session123'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/dialog/message - should handle missing message', async () => {
    const response = await request(app)
      .post('/api/dialog/message')
      .send({
        userId: 'user123',
        sessionId: 'session123'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/dialog/message - should handle error in processing', async () => {
    // Mock a2aRouter to throw an error
    require('@/services/a2a-router').a2aRouter.sendMessage.mockRejectedValueOnce(
      new Error('Processing error')
    );

    const response = await request(app)
      .post('/api/dialog/message')
      .send({
        userId: 'user123',
        message: 'I want to buy a TV',
        sessionId: 'session123'
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
  });
});
