// SPEC §5.4. Sums gzip of the static import graph for the app entry and /calendar/:view.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = path.resolve(process.argv[2] ?? 'apps/web/dist');
const manifestPath = path.join(dist, '.vite/manifest.json');
const JS_LIMIT = 250 * 1024;
const CSS_LIMIT = 35 * 1024;

if (!existsSync(manifestPath)) {
  console.error(`Missing Vite manifest at ${manifestPath}. Build with build.manifest enabled.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry === true);
if (entry === undefined) {
  console.error('The manifest has no entry chunk.');
  process.exit(1);
}

const calendar = findCalendar(manifest, entry);
if (calendar === undefined) {
  console.error('The manifest has no deferred chunk for /calendar/:view.');
  process.exit(1);
}

const files = new Set();
const js = new Set();
const css = new Set();
walk(entry, files, js, css, entry.file);
walk(calendar, files, js, css, calendar.file);

let jsBytes = 0;
let cssBytes = 0;
for (const file of js) jsBytes += gzipSize(file);
for (const file of css) cssBytes += gzipSize(file);

const jsLabel = format(jsBytes);
const cssLabel = format(cssBytes);
console.log(`entry ${entry.file}`);
console.log(`calendar ${calendar.file}`);
console.log(`JS ${jsLabel} gzip (limit ${format(JS_LIMIT)})`);
console.log(`CSS ${cssLabel} gzip (limit ${format(CSS_LIMIT)})`);
for (const file of [...js, ...css].sort()) {
  console.log(`  ${format(gzipSize(file)).padStart(10)}  ${file}`);
}

if (jsBytes > JS_LIMIT || cssBytes > CSS_LIMIT) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}

function findCalendar(items, entryChunk) {
  const dynamic = new Set(entryChunk.dynamicImports ?? []);
  const matches = Object.entries(items).filter(([key, item]) => {
    const id = `${key} ${item.src ?? ''} ${item.name ?? ''} ${item.file ?? ''}`;
    return /Places\.tsx|CalendarPage/.test(id);
  });
  return (
    matches.find(([key]) => dynamic.has(key))?.[1] ??
    matches.find(([, item]) => item.isDynamicEntry === true)?.[1] ??
    matches[0]?.[1]
  );
}

function walk(item, seen, js, css, rootFile) {
  if (item === undefined || item === null || seen.has(item.file)) return;
  const deferred = typeof item.file === 'string' && item.file.includes('/deferred-');
  if (deferred && item.file !== rootFile) return;
  seen.add(item.file);
  if (typeof item.file === 'string' && item.file.endsWith('.js')) js.add(item.file);
  for (const file of item.css ?? []) css.add(file);
  const dynamic = new Set(item.dynamicImports ?? []);
  for (const ref of item.imports ?? []) {
    if (dynamic.has(ref)) continue;
    walk(resolveImport(ref), seen, js, css, rootFile);
  }
}

function resolveImport(ref) {
  if (manifest[ref] !== undefined) return manifest[ref];
  return Object.values(manifest).find((item) => item.file === ref);
}

function gzipSize(file) {
  const absolute = resolveAsset(file);
  if (absolute === null) {
    console.log(`skip ${file} (not emitted)`);
    return 0;
  }
  return gzipSync(readFileSync(absolute), { level: 9 }).length;
}

function resolveAsset(file) {
  const absolute = path.join(dist, file);
  if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  const slash = file.lastIndexOf('/');
  const prefixed = `${file.slice(0, slash + 1)}deferred-${file.slice(slash + 1)}`;
  const fallback = path.join(dist, prefixed);
  if (existsSync(fallback) && statSync(fallback).isFile()) return fallback;
  const base = file.slice(slash + 1).replace(/\.[^.]+$/, '');
  const stem = base.replace(/-[A-Za-z0-9_-]+$/, '');
  const dir = path.join(dist, file.slice(0, Math.max(slash, 0)));
  if (stem.length > 0 && existsSync(dir)) {
    const matches = readdirSync(dir).filter((name) => {
      const plain = name.replace(/\.[^.]+$/, '');
      const stemOf = plain.replace(/-[A-Za-z0-9_-]+$/, '');
      return (
        plain === `deferred-${base}` ||
        plain === base ||
        stemOf === stem ||
        stemOf === `deferred-${stem}`
      );
    });
    if (matches.length === 1) return path.join(dir, matches[0]);
  }
  return null;
}

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
