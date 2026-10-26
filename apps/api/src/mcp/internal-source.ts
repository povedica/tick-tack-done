import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const secret = randomBytes(32);
const signature = (method: string, path: string, authorization: string, timestamp: string) =>
  createHmac('sha256', secret)
    .update([method, path, authorization, timestamp].join('\n'))
    .digest('hex');
/** Ephemeral process-local proof: reverse-proxy loopback alone is not trusted. */
export function mcpSourceHeaders(method: string, path: string, authorization: string) {
  const timestamp = String(Date.now());
  return {
    'X-TTD-Source': 'mcp',
    'X-TTD-Internal-Time': timestamp,
    'X-TTD-Internal-Proof': signature(method, path, authorization, timestamp),
  };
}
export function trustedMcpSource(input: {
  remoteAddress?: string | undefined;
  method: string;
  path: string;
  authorization: string;
  source?: string | undefined;
  timestamp?: string | undefined;
  proof?: string | undefined;
}): boolean {
  if (
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(input.remoteAddress ?? '') ||
    input.source !== 'mcp' ||
    !input.timestamp ||
    !input.proof ||
    !/^[a-f0-9]{64}$/.test(input.proof)
  )
    return false;
  const at = Number(input.timestamp);
  if (!Number.isSafeInteger(at) || Math.abs(Date.now() - at) > 30000) return false;
  return timingSafeEqual(
    Buffer.from(input.proof, 'hex'),
    Buffer.from(signature(input.method, input.path, input.authorization, input.timestamp), 'hex'),
  );
}
