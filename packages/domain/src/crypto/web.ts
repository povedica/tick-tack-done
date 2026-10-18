/** Web Crypto without a DOM lib. Node and the browser both expose this. */

interface HmacKey {
  readonly type: 'secret';
}

interface SubtleDigest {
  importKey(
    format: 'raw',
    key: ArrayBuffer,
    algorithm: { name: 'HMAC'; hash: 'SHA-1' | 'SHA-256' },
    extractable: false,
    usages: readonly ['sign'],
  ): Promise<HmacKey>;
  sign(algorithm: 'HMAC', key: HmacKey, data: Uint8Array): Promise<ArrayBuffer>;
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

export function utf8(text: string): Uint8Array {
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

export function subtle(): SubtleDigest {
  const value = (globalThis as unknown as { crypto?: { subtle?: SubtleDigest } }).crypto?.subtle;
  if (value === undefined) {
    throw new Error('webcrypto_missing');
  }
  return value;
}
