// #209: source maps go to Sentry, never to the served image.
// Usage: node split-sourcemaps.mjs <dist> <maps-out>
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVED = /\.(?:js|mjs|css|html)$/;
const REFERENCE = /[#@]\s*sourceMappingURL=/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** Moves every `*.map` under `dist` to the same relative path under `out`. */
export function splitSourcemaps(dist, out) {
  mkdirSync(out, { recursive: true });
  let moved = 0;
  for (const file of files(dist)) {
    if (!file.endsWith('.map')) continue;
    const target = path.join(out, path.relative(dist, file));
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(file, target);
    moved += 1;
  }
  return moved;
}

/** Served files that are maps or point to one. Must be empty before the image is assembled. */
export function sourcemapLeaks(dist) {
  return files(dist).flatMap((file) => {
    const relative = path.relative(dist, file);
    if (file.endsWith('.map')) return [relative];
    if (SERVED.test(file) && REFERENCE.test(readFileSync(file, 'utf8'))) return [relative];
    return [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dist, out] = process.argv.slice(2);
  if (dist === undefined || out === undefined) {
    console.error('Usage: split-sourcemaps.mjs <dist> <maps-out>');
    process.exit(64);
  }
  const moved = splitSourcemaps(dist, out);
  const leaks = sourcemapLeaks(dist);
  if (leaks.length > 0) {
    console.error(`Source maps would be served: ${leaks.join(', ')}`);
    process.exit(1);
  }
  console.log(`${String(moved)} source maps moved out of ${dist}`);
}
