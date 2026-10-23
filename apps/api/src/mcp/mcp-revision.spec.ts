import { describe, expect, it } from 'vitest';
import { catalogHash, CatalogChange } from './mcp-revision.js';
import { MCP_TOOLS } from './mcp.catalog.js';

describe('TTD-AUD-85.3 catalog revision', () => {
  it('changes when a tool is added and stays stable for the same catalog', () => {
    expect(catalogHash(MCP_TOOLS)).toBe(catalogHash(MCP_TOOLS));
    expect(catalogHash([...MCP_TOOLS, { name: 'new_tool' }])).not.toBe(catalogHash(MCP_TOOLS));
  });
  it('notifies a client once after a persisted deployment hash changes', async () => {
    const values = new Map<string, string>([['ttd:mcp:catalog:hash', 'old']]);
    const store = {
      getset: (key: string, value: string) => {
        const old = values.get(key) ?? null;
        values.set(key, value);
        return Promise.resolve(old);
      },
      set: (key: string, value: string) => {
        if (values.has(key)) return Promise.resolve(null);
        values.set(key, value);
        return Promise.resolve('OK');
      },
    };
    const change = new CatalogChange(store);
    await change.initialize('new');
    expect(await change.consume('client')).toBe(true);
    expect(await change.consume('client')).toBe(false);
    const restarted = new CatalogChange(store);
    await restarted.initialize('new');
    expect(await restarted.consume('other')).toBe(false);
  });
});
