import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

describe('unknown unhandled rejection', () => {
  it('CA-07: is reported, flushed and still ends the process with code 1 (strict)', async () => {
    const bodies: string[] = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        bodies.push(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(200).end('{}');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const apiRoot = path.resolve(import.meta.dirname, '../../..');
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        'test/fixtures/sentry-unhandled-child.ts',
        `http://public@127.0.0.1:${String(port)}/1`,
      ],
      { cwd: apiRoot, env: { PATH: process.env.PATH ?? '' }, stdio: 'ignore' },
    );
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));

    expect(code).toBe(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('"level":"fatal"');
    expect(bodies[0]).toContain('unknown rejection');
  }, 20_000);
});
