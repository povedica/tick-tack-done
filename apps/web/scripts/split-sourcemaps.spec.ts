import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without declarations
import { sourcemapLeaks, splitSourcemaps } from './split-sourcemaps.mjs';

const script = fileURLToPath(new URL('./split-sourcemaps.mjs', import.meta.url));

function dist(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ttd-maps-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, 'dist', name)), { recursive: true });
    writeFileSync(path.join(root, 'dist', name), content);
  }
  return root;
}

describe('split-sourcemaps (#209)', () => {
  it('moves every map out of dist and leaves nothing to serve', () => {
    const root = dist({
      'sw.js': 'self.x=1;',
      'sw.js.map': '{}',
      'assets/index-a.js': 'console.log(1);',
      'assets/index-a.js.map': '{}',
    });
    const served = path.join(root, 'dist');
    const maps = path.join(root, 'maps');
    expect(splitSourcemaps(served, maps)).toBe(2);
    expect(existsSync(path.join(maps, 'assets/index-a.js.map'))).toBe(true);
    expect(existsSync(path.join(maps, 'sw.js.map'))).toBe(true);
    expect(sourcemapLeaks(served)).toEqual([]);
  });

  it('fails when a served file still references a map', () => {
    const root = dist({
      'assets/index-a.js': 'x();\n//# sourceMappingURL=index-a.js.map',
      'assets/style.css': 'a{}/*# sourceMappingURL=style.css.map */',
    });
    expect(sourcemapLeaks(path.join(root, 'dist')).sort()).toEqual([
      'assets/index-a.js',
      'assets/style.css',
    ]);
    expect(() =>
      execFileSync(process.execPath, [script, path.join(root, 'dist'), path.join(root, 'maps')], {
        stdio: 'pipe',
      }),
    ).toThrow(/Source maps would be served/);
  });

  it('the CLI passes on a clean build', () => {
    const root = dist({
      'index.html': '<script src="/assets/a.js"></script>',
      'assets/a.js': 'x();',
    });
    const output = execFileSync(process.execPath, [
      script,
      path.join(root, 'dist'),
      path.join(root, 'maps'),
    ]).toString();
    expect(output).toContain('0 source maps moved');
  });
});
