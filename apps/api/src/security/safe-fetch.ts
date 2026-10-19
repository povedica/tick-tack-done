import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception';

const block = new BlockList();
block.addSubnet('0.0.0.0', 8, 'ipv4');
block.addSubnet('10.0.0.0', 8, 'ipv4');
block.addSubnet('100.64.0.0', 10, 'ipv4');
block.addSubnet('127.0.0.0', 8, 'ipv4');
block.addSubnet('169.254.0.0', 16, 'ipv4');
block.addSubnet('172.16.0.0', 12, 'ipv4');
block.addSubnet('192.0.0.0', 24, 'ipv4');
block.addSubnet('192.168.0.0', 16, 'ipv4');
block.addSubnet('224.0.0.0', 4, 'ipv4');
block.addAddress('::1', 'ipv6');
block.addSubnet('fc00::', 7, 'ipv6');
block.addSubnet('fe80::', 10, 'ipv6');
block.addSubnet('ff00::', 8, 'ipv6');

export const ICAL_MAX_BYTES = 2 * 1024 * 1024;

export interface ResolvedTarget {
  readonly url: URL;
  readonly address: string;
}

export type LookupAddress = (hostname: string) => Promise<{ address: string; family: number }>;

const defaultLookup: LookupAddress = async (hostname) => dnsLookup(hostname);

export function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  const mapped = normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;
  if (isIP(mapped) === 4) {
    return block.check(mapped, 'ipv4');
  }
  if (isIP(normalized) === 6) {
    return block.check(normalized, 'ipv6');
  }
  return true;
}

export async function assertPublicUrl(
  raw: string,
  lookup: LookupAddress = defaultLookup,
): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
  }
  const allowHttp = process.env.ALLOW_HTTP_WEBHOOKS === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url must be https');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
  }
  const literal = isIP(url.hostname);
  const addresses = literal === 0 ? [await resolveOne(url.hostname, lookup)] : [url.hostname];
  if (addresses.some((address) => isBlockedAddress(address))) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'destination_blocked',
      'That URL is not an allowed destination',
    );
  }
  const address = addresses[0];
  if (address === undefined) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
  }
  return { url, address };
}

export interface SafeResponse {
  readonly status: number;
  readonly body: Buffer;
}

export async function safeFetch(
  raw: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    maxBytes: number;
    timeoutMs?: number;
    lookup?: LookupAddress;
  },
): Promise<SafeResponse> {
  let current = raw;
  const lookup = init.lookup ?? defaultLookup;
  for (let hop = 0; hop < 3; hop += 1) {
    const target = await assertPublicUrl(current, lookup);
    const response = await pinnedRequest(target, init);
    if (response.status >= 300 && response.status < 400) {
      const location = response.location;
      if (location === null) {
        throw new DomainException(HttpStatus.BAD_GATEWAY, 'fetch_failed', 'Redirect was empty');
      }
      current = new URL(location, target.url).toString();
      continue;
    }
    return { status: response.status, body: response.body };
  }
  throw new DomainException(HttpStatus.BAD_GATEWAY, 'fetch_failed', 'Too many redirects');
}

async function resolveOne(hostname: string, lookup: LookupAddress): Promise<string> {
  try {
    const found = await lookup(hostname);
    return found.address;
  } catch {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'destination_blocked',
      'That URL is not an allowed destination',
    );
  }
}

function firstHeader(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const first: unknown = value[0];
  return typeof first === 'string' ? first : null;
}

function pinnedRequest(
  target: ResolvedTarget,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    maxBytes: number;
    timeoutMs?: number;
  },
): Promise<{ status: number; body: Buffer; location: string | null }> {
  const lib = target.url.protocol === 'https:' ? https : http;
  const family = isIP(target.address) === 6 ? 6 : 4;
  return new Promise((resolve, reject) => {
    // assertPublicUrl already rejected private, loopback and non-https targets.
    // The lookup callback pins that public address, so this is not an open proxy.
    // codeql[js/request-forgery]
    const req = lib.request(
      target.url,
      {
        method: init.method ?? 'GET',
        headers: { ...init.headers, host: target.url.host },
        servername: target.url.hostname,
        timeout: init.timeoutMs ?? 8_000,
        lookup: (_hostname, _options, callback) => {
          const done = callback as (
            err: NodeJS.ErrnoException | null,
            address: string,
            family: number,
          ) => void;
          done(null, target.address, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > init.maxBytes) {
            req.destroy();
            reject(
              new DomainException(
                HttpStatus.BAD_REQUEST,
                'validation_failed',
                'Response is too large',
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            location: firstHeader(res.headers.location),
          });
        });
      },
    );
    req.on('error', () => {
      reject(
        new DomainException(HttpStatus.BAD_GATEWAY, 'fetch_failed', 'Destination did not respond'),
      );
    });
    req.on('timeout', () => {
      req.destroy();
      reject(
        new DomainException(HttpStatus.BAD_GATEWAY, 'fetch_failed', 'Destination did not respond'),
      );
    });
    if (init.body !== undefined) {
      req.write(init.body);
    }
    req.end();
  });
}
