import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../configure-app';
import { HealthModule } from './health.module';

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
    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok', commit: 'unknown' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('unknown routes use the public error shape', async () => {
    const response = await request(app.getHttpServer() as App)
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
