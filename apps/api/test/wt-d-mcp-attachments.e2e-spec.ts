import type * as NodeFs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof NodeFs>()),
  writeFile: vi.fn(),
  createWriteStream: vi.fn(),
}));
import { writeFile, createWriteStream } from 'node:fs';
import { harness, prisma } from './wt-d-harness.js';
import { fakeDrive } from './helpers/fake-drive.js';
import { sealField } from '../src/security/field-cipher.js';
describe('TTD-AUD-111 MCP streaming attachments', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let drive: Awaited<ReturnType<typeof fakeDrive>>;
  let task: { id: string };
  beforeAll(async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic');
    h = await harness();
    drive = await fakeDrive();
    await prisma.user.update({
      where: { id: h.user.id },
      data: {
        googleRefreshToken: sealField('synthetic-refresh'),
        googleGrantedScopes: ['https://www.googleapis.com/auth/drive.file'],
        googleDriveEnabled: true,
        googleStatus: 'connected',
      },
    });
    task = await h.create();
  });
  afterAll(async () => {
    await drive.close();
    await h.close();
    vi.unstubAllEnvs();
  });
  it('lists the upload tool and uploads txt without filesystem writes', async () => {
    const catalog = await h.api
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(200);
    expect(
      catalog.body.result.tools.some(
        (tool: { name: string }) => tool.name === 'upload_task_attachment',
      ),
    ).toBe(true);
    vi.mocked(writeFile).mockClear();
    vi.mocked(createWriteStream).mockClear();
    const response = await h.call('upload_task_attachment', {
      task_id: task.id,
      filename: 'note.txt',
      base64: Buffer.from('hello').toString('base64'),
      content_type: 'text/plain',
    });
    expect(response.isError).toBe(false);
    expect(response.value).toMatchObject({ source: 'mcp', drive_state: 'ok' });
    expect(writeFile).not.toHaveBeenCalled();
    expect(createWriteStream).not.toHaveBeenCalled();
  });
  it('rejects HTML and oversized uploads with precise status', async () => {
    for (const [filename, base64, status] of [
      ['bad.html', Buffer.from('<html>bad</html>').toString('base64'), 415],
      ['big.txt', Buffer.alloc(25 * 1024 * 1024 + 1, 97).toString('base64'), 413],
    ] as const) {
      const result = await h.call('upload_task_attachment', { task_id: task.id, filename, base64 });
      expect(result.isError).toBe(true);
      expect(result.data.status).toBe(status);
    }
  });
  it('distinguishes inaccessible files from Drive trash', async () => {
    const inaccessible = await h.call('link_drive_file', {
      task_id: task.id,
      drive_file_id: 'not-authorized',
    });
    expect(inaccessible.data.status).toBe(404);
    expect(inaccessible.value).toContain('drive_file_not_accessible');
    drive.files.set('trashed', {
      id: 'trashed',
      name: 'old.txt',
      mimeType: 'text/plain',
      parents: [],
      size: '1',
      webViewLink: '',
      appProperties: {},
      trashed: true,
    });
    const trashed = await h.call('link_drive_file', { task_id: task.id, drive_file_id: 'trashed' });
    expect(trashed.value).toContain('drive_file_not_found');
  });
  it('uploads 24 MiB with artificial Drive latency beyond the previous 30-second loopback limit', async () => {
    const fetchDrive = globalThis.fetch;
    let delayed = false;
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (init?.method === 'PUT' && !delayed) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 31000));
      }
      return fetchDrive(input, init);
    });
    try {
      const response = await h.call('upload_task_attachment', {
        task_id: task.id,
        filename: 'large.txt',
        base64: Buffer.alloc(24 * 1024 * 1024, 97).toString('base64'),
      });
      expect(delayed).toBe(true);
      expect(response.isError).toBe(false);
      expect(response.value.byte_size).toBe(24 * 1024 * 1024);
    } finally {
      vi.stubGlobal('fetch', fetchDrive);
    }
  }, 90000);
});
