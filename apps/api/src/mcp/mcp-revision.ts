import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { MCP_TOOLS } from './mcp.catalog.js';
export function catalogHash(tools: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(tools)).digest('hex');
}
interface RevisionStore {
  getset(key: string, value: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number, condition: 'NX'): Promise<string | null>;
}
export class CatalogChange {
  private changed = false;
  private hash = '';
  constructor(private readonly store: RevisionStore) {}
  async initialize(hash: string): Promise<void> {
    this.hash = hash;
    const previous = await this.store.getset('ttd:mcp:catalog:hash', hash);
    this.changed = previous !== null && previous !== hash;
  }
  async consume(client: string): Promise<boolean> {
    if (!this.changed) return false;
    const clientHash = createHash('sha256').update(client).digest('hex');
    return (
      (await this.store.set(
        `ttd:mcp:catalog:seen:${this.hash}:${clientHash}`,
        '1',
        'EX',
        30 * 86400,
        'NX',
      )) === 'OK'
    );
  }
}
@Injectable()
export class McpRevision implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private change: CatalogChange | null = null;
  async onModuleInit(): Promise<void> {
    if (!process.env.REDIS_URL || process.env.VITEST === 'true') return;
    this.redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    this.redis.on('error', () => undefined);
    this.change = new CatalogChange(this.redis);
    try {
      await this.change.initialize(catalogHash(MCP_TOOLS));
    } catch {
      new Logger(McpRevision.name).warn('Catalog revision storage unavailable');
    }
  }
  async consume(client: string): Promise<boolean> {
    try {
      return (await this.change?.consume(client)) ?? false;
    } catch {
      return false;
    }
  }
  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
