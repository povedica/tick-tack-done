import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { observeQuery } from '../observability/request-timing.js';
import { stampTaskRow } from './local-day-columns.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = withPool(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unused');
    super({ datasources: { db: { url } } });
    const timed = this.$extends({
      query: {
        task: {
          async create({ args, query }) {
            args.data = stampTaskRow(args.data);
            return query(args);
          },
          async update({ args, query }) {
            args.data = stampTaskRow(args.data);
            return query(args);
          },
          async createMany({ args, query }) {
            args.data = Array.isArray(args.data)
              ? args.data.map(stampTaskRow)
              : stampTaskRow(args.data);
            return query(args);
          },
        },
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const started = performance.now();
            try {
              return await query(args);
            } finally {
              observeQuery(performance.now() - started, model, operation);
            }
          },
        },
        async $queryRaw({ args, query }) {
          return timeRaw(query, args, '$queryRaw');
        },
        async $queryRawUnsafe({ args, query }) {
          return timeRaw(query, args, '$queryRawUnsafe');
        },
        async $executeRaw({ args, query }) {
          return timeRaw(query, args, '$executeRaw');
        },
        async $executeRawUnsafe({ args, query }) {
          return timeRaw(query, args, '$executeRawUnsafe');
        },
      },
    });
    Object.defineProperty(timed, 'onModuleDestroy', {
      value: async (): Promise<void> => {
        await timed.$disconnect();
      },
    });
    return timed as unknown as PrismaService;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

async function timeRaw<T>(
  query: (args: T) => Promise<unknown>,
  args: T,
  operation: string,
): Promise<unknown> {
  const started = performance.now();
  try {
    return await query(args);
  } finally {
    observeQuery(performance.now() - started, 'raw', operation);
  }
}

function withPool(url: string): string {
  if (url.includes('connection_limit=')) {
    return url;
  }
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}connection_limit=10&pool_timeout=20`;
}
