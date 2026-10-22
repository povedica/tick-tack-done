import { randomUUID } from 'node:crypto';
import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { oauthEdgeMiddleware } from './auth/oauth-edge.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { isPublicOperation } from './security/public-operations.js';
import { trustProxyHops } from './security/runtime-config.js';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

export function configureApp(app: INestApplication): void {
  (app as NestExpressApplication).set('trust proxy', trustProxyHops());
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'feeds/(.*)', method: RequestMethod.GET },
      { path: 'open/(.*)', method: RequestMethod.ALL },
      { path: '.well-known/oauth-protected-resource', method: RequestMethod.GET },
      { path: '.well-known/oauth-authorization-server', method: RequestMethod.GET },
      { path: 'browser-oauth/authorize', method: RequestMethod.GET },
    ],
  });
  app.use(oauthEdgeMiddleware);
  // MCP multipart tools carry one base64 attachment (API limit: 25 MB).
  app.use('/api/v1/mcp', json({ limit: '35mb' }));
  // Explicit default: Nest detects jsonParser by name even when mounted on a path.
  app.use(json({ limit: '100kb' }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { 'style-src': ["'self'"] },
      },
    }),
  );
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = (req.originalUrl.length > 0 ? req.originalUrl : req.url).split('?')[0] ?? '';
    if (path.startsWith('/api/') || path.startsWith('/mcp') || path.startsWith('/feeds/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    const incoming = req.header('x-request-id');
    const requestId = incoming !== undefined && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Reflexionia Tasks API')
    .setDescription('Public API for Reflexionia Tasks.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PAT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  for (const [path, item] of Object.entries(document.paths)) {
    if (item === undefined) {
      continue;
    }
    for (const method of METHODS) {
      const operation = item[method];
      if (operation === undefined) {
        continue;
      }
      operation.security = isPublicOperation(method, path) ? [] : [{ bearer: [] }];
    }
  }
  return document;
}
