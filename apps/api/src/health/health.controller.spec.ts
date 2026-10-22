import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../configure-app.js';
import { HealthModule } from './health.module.js';

type SuperTestApp = Parameters<typeof request>[0];

describe('HealthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns ok', async () => {
    const response = await request(app.getHttpServer() as SuperTestApp)
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toMatchObject({ status: 'ok', commit: 'unknown', version: '0.2.0', built_at:'unknown', mcp_version:'0.2.0+unknown' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('unknown routes use the public error shape', async () => {
    const response = await request(app.getHttpServer() as SuperTestApp)
      .get('/api/v1/missing')
      .expect(404);
    expect(response.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Cannot GET /api/v1/missing',
        details: null,
      },
    });
  });
});
