import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, createOpenApiDocument } from './configure-app';
import { loadRootEnv } from './load-env';
import { PrismaService } from './prisma/prisma.service';
import { assertRuntimeConfig } from './security/runtime-config';
import { sealStoredSecrets } from './security/seal-secrets';

loadRootEnv();

async function bootstrap(): Promise<void> {
  assertRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
  }
  await sealStoredSecrets(app.get(PrismaService));
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
