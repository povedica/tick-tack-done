import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unused';
    super({ datasources: { db: { url } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
