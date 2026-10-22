import { expect, it } from 'vitest';
import { acceptedMime, attachmentByteLimit, attachmentPrefix } from './attachment-limits.js';
it('TTD-AUD-99: invalid environment cannot disable the upload bound', () => {
  for (const value of ['NaN', 'Infinity', '0', '-1', '1.5', ''])
    expect(attachmentByteLimit(value)).toBe(100 * 1024 * 1024);
  expect(attachmentByteLimit('1234')).toBe(1234);
});
it('TTD-AUD-99: signature split across chunks is sniffed after collecting a bounded prefix and replayed unchanged', async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  async function* source() {
    await Promise.resolve();
    for (const byte of bytes) yield Buffer.from([byte]);
  }
  const { prefix, replay } = await attachmentPrefix(source());
  expect(acceptedMime(prefix)).toBe('image/png');
  const chunks = [];
  for await (const chunk of replay()) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(bytes);
});
it('TTD-AUD-99: refuses oversized individual chunks before buffering', async () => {
  async function* source() {
    await Promise.resolve();
    yield new Uint8Array(256 * 1024 + 1);
  }
  await expect(attachmentPrefix(source())).rejects.toThrow('chunk');
});
