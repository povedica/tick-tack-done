import { afterEach, expect, it, vi } from 'vitest';
import { signUpload, readUpload } from './upload-token.js';
afterEach(() => vi.useRealTimers());
it('TTD-AUD-99 upload tickets are bound to owner, task, metadata and an hour', () => {
  const now = Date.now();
  const payload = {
    ownerId: 'owner',
    taskId: 'task',
    folderId: 'folder',
    nonce: 'nonce',
    name: 'x.txt',
    mimeType: 'text/plain',
    size: 4,
    exp: now + 3600000,
  };
  const token = signUpload(payload);
  expect(readUpload(token, 'owner', 'task')).toEqual(payload);
  expect(() => readUpload(token, 'other', 'task')).toThrow();
  expect(() => readUpload(token, 'owner', 'other')).toThrow();
  expect(() => readUpload(token.replace(/^./, '!'), 'owner', 'task')).toThrow();
  vi.useFakeTimers();
  vi.setSystemTime(now + 3600001);
  expect(() => readUpload(token, 'owner', 'task')).toThrow();
});
