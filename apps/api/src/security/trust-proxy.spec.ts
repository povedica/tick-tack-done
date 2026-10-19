import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

describe('trust proxy', () => {
  it('S-02: one hop uses the client address from X-Forwarded-For', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/', (req, res) => {
      res.send(req.ip ?? '');
    });
    const response = await request(app).get('/').set('X-Forwarded-For', '203.0.113.5');
    expect(response.text).toBe('203.0.113.5');
  });
});
