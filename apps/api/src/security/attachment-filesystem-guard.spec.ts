import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Empty allowlist: captures must stream to Drive, even for temporary files.
const forbidden = /\b(?:writeFile(?:Sync)?|createWriteStream|diskStorage|memoryStorage|tmpdir)\b/;
const roots = ['modules/tasks', 'modules/integrations', 'drive', 'mcp'];

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(file);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [file] : [];
    }),
  );
  return groups.flat();
}

describe('TTD-AUD-99 filesystem regression guard', () => {
  it.each([
    'fs.writeFile(',
    'writeFileSync(',
    'createWriteStream(',
    'diskStorage(',
    'os.tmpdir(',
    'memoryStorage(',
  ])('rejects %s with no exceptions', (source) => {
    expect(forbidden.test(source)).toBe(true);
  });

  it('capture, integrations, Drive and MCP contain no filesystem writers or memory upload stores', async () => {
    const violations: string[] = [];
    for (const root of roots) {
      for (const file of await sources(path.join(process.cwd(), 'src', root))) {
        const source = await readFile(file, 'utf8');
        if (forbidden.test(source)) violations.push(path.relative(process.cwd(), file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('new backup script never mounts or archives a local attachment volume', async () => {
    const script = await readFile(path.join(process.cwd(), '../../scripts/backup.sh'), 'utf8');
    expect(script).not.toMatch(/attachments\.tar|_attachments:|tar\s+czf/);
  });
});
