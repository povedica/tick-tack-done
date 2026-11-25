import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = dirname(HERE);
const REPO_ROOT = dirname(dirname(EXTENSION_ROOT));
const ZIP_PREFIX = 'ttd-raycast';

const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'eslint.config.js',
  '.prettierrc',
  '.gitignore',
  '.prettierignore',
  'README.md',
];

const REQUIRED = [
  `${ZIP_PREFIX}/package.json`,
  `${ZIP_PREFIX}/package-lock.json`,
  `${ZIP_PREFIX}/tsconfig.json`,
  `${ZIP_PREFIX}/README.md`,
  `${ZIP_PREFIX}/src/quick-add.tsx`,
  `${ZIP_PREFIX}/src/create-task.ts`,
  `${ZIP_PREFIX}/assets/icon.png`,
];

export function pack() {
  const files = listSourceFiles(EXTENSION_ROOT);
  const entries = files.map((file) => {
    const bytes = readFileSync(join(EXTENSION_ROOT, file));
    if (file === 'assets/icon.png') {
      assertPng512(bytes);
    }
    return { name: `${ZIP_PREFIX}/${file.split(sep).join('/')}`, bytes };
  });
  const zip = buildZip(entries);
  const names = listZipNames(zip);
  assertSafeArchive(names, entries);
  const zipPath =
    process.env.TTD_RAYCAST_ZIP ?? join(REPO_ROOT, 'apps/web/public/downloads/ttd-raycast.zip');
  const readmePath =
    process.env.TTD_RAYCAST_README ??
    join(REPO_ROOT, 'apps/web/public/downloads/ttd-raycast-README.html');
  mkdirSync(dirname(zipPath), { recursive: true });
  mkdirSync(dirname(readmePath), { recursive: true });
  writeFileSync(zipPath, zip);
  writeFileSync(readmePath, readmeHtml(readFileSync(join(EXTENSION_ROOT, 'README.md'), 'utf8')));
  return { zipPath, readmePath, names };
}

export function listZipNames(buffer) {
  const view = Buffer.from(buffer);
  let eocd = -1;
  const start = Math.max(0, view.length - 22 - 65535);
  for (let index = view.length - 22; index >= start; index -= 1) {
    if (view.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('El zip no tiene directorio central');
  }
  const count = view.readUInt16LE(eocd + 10);
  let offset = view.readUInt32LE(eocd + 16);
  const names = [];
  for (let entry = 0; entry < count; entry += 1) {
    if (view.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Directorio central inválido');
    }
    const nameLength = view.readUInt16LE(offset + 28);
    const extra = view.readUInt16LE(offset + 30);
    const comment = view.readUInt16LE(offset + 32);
    names.push(view.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extra + comment;
  }
  return names;
}

function listSourceFiles(root) {
  const files = ROOT_FILES.filter((file) =>
    statSync(join(root, file), { throwIfNoEntry: false })?.isFile(),
  );
  const src = join(root, 'src');
  for (const name of walk(src)) {
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
    if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) continue;
    files.push(relative(root, name));
  }
  files.push('assets/icon.png');
  return files;
}

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

function assertPng512(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(16) !== 512 || bytes.readUInt32BE(20) !== 512) {
    throw new Error('assets/icon.png tiene que ser un PNG de 512×512');
  }
}

function assertSafeArchive(names, entries) {
  for (const required of REQUIRED) {
    if (!names.includes(required)) {
      throw new Error(`Falta ${required} en el zip`);
    }
  }
  for (const name of names) {
    const lower = name.toLowerCase();
    if (
      lower.includes('node_modules') ||
      lower.includes('.env') ||
      lower.endsWith('.pem') ||
      lower.endsWith('.key')
    ) {
      throw new Error(`El zip no puede incluir ${name}`);
    }
  }
  for (const entry of entries) {
    if (!/\.(md|json|js|mjs|ts|tsx|css|html|txt)$/.test(entry.name)) continue;
    const text = entry.bytes.toString('utf8');
    if (
      text.includes('rfx_pat_') ||
      text.includes('BEGIN OPENSSH PRIVATE KEY') ||
      text.includes('BEGIN RSA PRIVATE KEY')
    ) {
      throw new Error(`El zip contiene un secreto en ${entry.name}`);
    }
  }
}

function readmeHtml(markdown) {
  const body = escapeHtml(markdown);
  return `<!DOCTYPE html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nueva tarea TTD</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 1.25rem auto; max-width: 40rem; padding: 0 1rem; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
<body>
<pre>${body}</pre>
</body>
</html>
`;
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const time = dosStamp(new Date(Date.UTC(2026, 10, 16, 0, 0, 0)));
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.bytes);
    const checksum = crc32(entry.bytes) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(time.time, 10);
    header.writeUInt16LE(time.date, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(time.time, 12);
    directory.writeUInt16LE(time.date, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const directoryOffset = offset;
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directorySize, 12);
  eocd.writeUInt32LE(directoryOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, eocd]);
}

function dosStamp(date) {
  const time =
    (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const day =
    ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, date: day };
}

function invokedDirectly() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const result = pack();
  process.stdout.write(`${result.zipPath}\n${result.names.length} files\n`);
}
