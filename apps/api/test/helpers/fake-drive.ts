import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
export interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size: string;
  webViewLink: string;
  appProperties: Record<string, string>;
  trashed?: boolean;
  thumbnailLink?: string;
}
export async function fakeDrive() {
  const files = new Map<string, FakeFile>();
  const sessions = new Map<string, FakeFile>();
  const requests: { method: string; path: string; bytes: number }[] = [];
  let refreshRevoked = false;
  let quota = false;
  let failTrash = false;
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const method = req.method ?? 'GET';
      const body = async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
        return Buffer.concat(chunks);
      };
      const json = (value: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === '/token') {
        requests.push({ method, path: '/token', bytes: 0 });
        json(
          refreshRevoked
            ? { error: 'invalid_grant' }
            : { access_token: 'synthetic-access', expires_in: 3600 },
          refreshRevoked ? 400 : 200,
        );
        return;
      }
      if (quota) {
        json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403);
        return;
      }
      if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
        const bytes = await body();
        requests.push({ method, path: url.pathname, bytes: bytes.length });
        const metadata = JSON.parse(bytes.toString()) as Partial<FakeFile>;
        const id = randomUUID();
        const file = {
          id,
          name: metadata.name ?? '',
          mimeType: String(req.headers['x-upload-content-type'] ?? 'application/octet-stream'),
          parents: metadata.parents ?? [],
          size: '0',
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
          appProperties: metadata.appProperties ?? {},
          thumbnailLink: 'https://lh3.googleusercontent.com/synthetic-thumbnail',
        };
        sessions.set(id, file);
        res.writeHead(200, {
          Location: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${id}`,
        });
        res.end();
        return;
      }
      if (url.pathname === '/upload/drive/v3/files' && method === 'PUT') {
        const id = url.searchParams.get('upload_id') ?? '';
        const file = sessions.get(id);
        if (!file) {
          json({}, 404);
          return;
        }
        let bytes = 0;
        for await (const chunk of req) bytes += (chunk as Buffer).length;
        requests.push({ method, path: url.pathname, bytes });
        const range = req.headers['content-range'] ?? '';
        if (!range) {
          file.size = String(bytes);
          files.set(id, file);
          json(file);
          return;
        }
        const match = /bytes (\d+)-(\d+)\/(\*|\d+)/.exec(range);
        if (!match) {
          json({}, 400);
          return;
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (end - start + 1 !== bytes) {
          json({}, 400);
          return;
        }
        file.size = String(end + 1);
        if (match[3] === '*') {
          res.writeHead(308, { Range: `bytes=0-${end}` });
          res.end();
          return;
        }
        files.set(id, file);
        json(file);
        return;
      }
      if (url.pathname === '/drive/v3/files' && method === 'POST') {
        const bytes = await body();
        const metadata = JSON.parse(bytes.toString()) as Partial<FakeFile>;
        const id = randomUUID();
        const file = {
          id,
          name: metadata.name ?? '',
          mimeType: metadata.mimeType ?? '',
          parents: metadata.parents ?? [],
          size: '0',
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
          appProperties: metadata.appProperties ?? {},
        };
        files.set(id, file);
        json(file);
        return;
      }
      if (url.pathname === '/drive/v3/files') {
        const query = url.searchParams.get('q') ?? '';
        const marker = /value='([^']+)'/.exec(query)?.[1];
        json({
          files: [...files.values()].filter(
            (file) =>
              !file.trashed && (!marker || Object.values(file.appProperties).includes(marker)),
          ),
        });
        return;
      }
      const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const file = files.get(id);
      if (!file) {
        json({}, 404);
        return;
      }
      if (method === 'PATCH') {
        if (failTrash) {
          json({}, 503);
          return;
        }
        Object.assign(file, JSON.parse((await body()).toString()));
      }
      requests.push({ method, path: url.pathname, bytes: 0 });
      json(file);
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
    );
    return realFetch(
      ['www.googleapis.com', 'oauth2.googleapis.com'].includes(url.hostname)
        ? origin + url.pathname + url.search
        : input,
      init,
    );
  });
  return {
    files,
    sessions,
    requests,
    setRevoked: (value: boolean) => {
      refreshRevoked = value;
    },
    setQuota: (value: boolean) => {
      quota = value;
    },
    setFailTrash: (value: boolean) => {
      failTrash = value;
    },
    close: async () => {
      vi.unstubAllGlobals();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    },
  };
}
