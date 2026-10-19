import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = withPool(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unused');
    super({ datasources: { db: { url } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function withPool(url: string): string {
  if (url.includes('connection_limit=')) {
    return url;
  }
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}connection_limit=10&pool_timeout=20`;
}
