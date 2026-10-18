/**
 * Upload one backup directory to Google Drive (RF-1704 / RF-2005).
 * The refresh token comes from the user row. GOOGLE_REFRESH_TOKEN is only a fallback.
 * Never print the token.
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const dest = process.argv[2] ?? '';
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';
const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';

if (
  dest.length === 0 ||
  folderId.length === 0 ||
  clientId.length === 0 ||
  clientSecret.length === 0
) {
  console.error('[backup] faltan la carpeta, el cliente de Google o el directorio');
  process.exit(1);
}

const refresh = refreshToken();
if (refresh.length === 0) {
  console.error('[backup] no hay refresh token de Google; el archivo se queda en la máquina');
  process.exit(1);
}

const access = await accessToken(refresh);
const names = await readdir(dest);
let uploaded = 0;
for (const name of names) {
  const bytes = await readFile(join(dest, name));
  await upload(access, folderId, name, bytes);
  uploaded += 1;
  console.log(`[backup] subido ${name}`);
}
await trim(access, folderId);
console.log(`[backup] Google Drive OK (${String(uploaded)} archivos)`);

function refreshToken() {
  const fromDb = readDatabase();
  if (fromDb.length > 0) {
    return fromDb;
  }
  return (process.env.GOOGLE_REFRESH_TOKEN ?? '').trim();
}

function readDatabase() {
  try {
    const stdout = execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        process.env.POSTGRES_USER ?? 'reflexionia',
        '-d',
        process.env.POSTGRES_DB ?? 'reflexionia',
        '-tA',
        '-c',
        'SELECT google_refresh_token FROM users WHERE google_refresh_token IS NOT NULL AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return stdout.trim();
  } catch {
    return '';
  }
}

async function accessToken(refresh) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json();
  if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    console.error('[backup] Google no ha entregado un access token');
    process.exit(1);
  }
  return body.access_token;
}

async function upload(access, parent, name, bytes) {
  const boundary = `ticktack${Date.now().toString(16)}`;
  const meta = JSON.stringify({ name: basename(name), parents: [parent] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`;
  const mid = `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body: Buffer.concat([Buffer.from(head), Buffer.from(mid), bytes, Buffer.from(tail)]),
    },
  );
  if (!response.ok) {
    console.error(`[backup] Drive ha rechazado ${basename(name)}`);
    process.exit(1);
  }
}

async function trim(access, parent) {
  const days = Number(process.env.BACKUP_RETENTION_DAYS ?? '30');
  const cutoff = Date.now() - (Number.isFinite(days) ? days : 30) * 24 * 60 * 60 * 1000;
  const query = `'${parent.replaceAll("'", '')}' in parents and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name,createdTime)');
  const response = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
  if (!response.ok) {
    console.error('[backup] no se ha podido listar la carpeta para la retención');
    return;
  }
  const body = await response.json();
  const files = Array.isArray(body.files) ? body.files : [];
  for (const file of files) {
    const created = Date.parse(file.createdTime ?? '');
    if (!Number.isFinite(created) || created >= cutoff || typeof file.id !== 'string') {
      continue;
    }
    const removed = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access}` },
    });
    if (removed.ok || removed.status === 204) {
      console.log(`[backup] retención: borrado ${file.name ?? file.id}`);
    }
  }
}
