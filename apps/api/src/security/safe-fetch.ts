import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';

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
block.addAddress('::', 'ipv6');
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
  let normalized = address.toLowerCase();
  if (isIP(normalized) === 6) normalized = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (hexMapped) {
    const high = parseInt(hexMapped[1] ?? '', 16);
    const low = parseInt(hexMapped[2] ?? '', 16);
    return block.check([high >> 8, high & 255, low >> 8, low & 255].join('.'), 'ipv4');
  }
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
  httpAllowed = false,
): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
  }
  const allowHttp = httpAllowed || process.env.ALLOW_HTTP_WEBHOOKS === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url must be https');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(hostname);
  const addresses = literal === 0 ? [await resolveOne(hostname, lookup)] : [hostname];
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

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  maxBytes: number;
  timeoutMs?: number;
  lookup?: LookupAddress;
  allowHttp?: boolean;
  maxRedirects?: number;
  contentType?: string;
}

export async function safeFetch(raw: string, init: SafeFetchOptions): Promise<SafeResponse> {
  let current = raw;
  const lookup = init.lookup ?? defaultLookup;
  const deadline = Date.now() + (init.timeoutMs ?? 8_000);
  for (let hop = 0; hop <= (init.maxRedirects ?? 2); hop += 1) {
    const remaining = () => Math.max(1, deadline - Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const target = await Promise.race([
      assertPublicUrl(current, lookup, init.allowHttp),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error('Fetch deadline exceeded')); }, remaining());
      }),
    ]).finally(() => { clearTimeout(timer); });
    const response = await pinnedRequest(target, { ...init, timeoutMs: remaining() });
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
  init: SafeFetchOptions,
): Promise<{ status: number; body: Buffer; location: string | null }> {
  const lib = target.url.protocol === 'https:' ? https : http;
  const family = isIP(target.address) === 6 ? 6 : 4;
  return new Promise((resolve, reject) => {
    const pathAndQuery = `${target.url.pathname}${target.url.search}`;
    // Connect to the address assertPublicUrl already accepted. The original host
    // is only the Host header and the TLS name, not the socket destination.
    const req = lib.request(
      // codeql[js/request-forgery]
      {
        host: target.address,
        family,
        ...(target.url.port.length > 0 ? { port: Number(target.url.port) } : {}),
        path: pathAndQuery.length > 0 ? pathAndQuery : '/',
        method: init.method ?? 'GET',
        headers: { ...init.headers, host: target.url.host },
        servername: target.url.hostname,
        timeout: init.timeoutMs ?? 8_000,
      },
      (res) => {
        if (
          init.contentType &&
          (res.statusCode ?? 0) < 300 &&
          firstHeader(res.headers['content-type'])?.split(';')[0]?.trim().toLowerCase() !==
            init.contentType
        ) {
          res.destroy();
          req.destroy();
          reject(new Error('Unsupported response type'));
          return;
        }
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
        res.on('error', reject);
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            location: firstHeader(res.headers.location),
          });
        });
      },
    );
    const deadlineTimer = setTimeout(
      () => req.destroy(new Error('Fetch deadline exceeded')),
      init.timeoutMs ?? 8_000,
    );
    req.on('close', () => { clearTimeout(deadlineTimer); });
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
