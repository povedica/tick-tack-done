import { DomainException } from '../http/domain.exception.js';
import { ATTACHMENT_MAX_BYTES } from '../drive/attachment-limits.js';
/** Decode at most 192 KiB at a time; no temporary file or loopback HTTP hop. */
export function attachmentUpload(base64: string): AsyncIterable<Uint8Array> {
  const size = (base64.length * 3) / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (size > ATTACHMENT_MAX_BYTES)
    throw new DomainException(413, 'payload_too_large', 'Attachments are limited to 25 MiB');
  if (base64.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(base64))
    throw new DomainException(400, 'validation_failed', 'base64 must be valid base64');
  return (async function* () {
    await Promise.resolve();
    for (let offset = 0; offset < base64.length; offset += 256 * 1024)
      yield Buffer.from(base64.slice(offset, offset + 256 * 1024), 'base64');
  })();
}
