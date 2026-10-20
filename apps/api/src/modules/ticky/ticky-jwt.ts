import { createPrivateKey, createSign, randomUUID } from 'node:crypto';

export type TickyAudience = 'ticky-runs' | 'ticky-events' | 'ticky-context';

const TTL_SECONDS = 5 * 60;

export function signTickyJwt(input: {
  readonly audience: TickyAudience;
  readonly subject: string;
  readonly authorityVersion: number;
}): string {
  const pem = process.env.TICKY_JWT_PRIVATE_KEY_PEM ?? '';
  const kid = process.env.TICKY_JWT_KID ?? '';
  if (pem.length === 0 || kid.length === 0) {
    throw new Error('ticky_jwt_unconfigured');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const payload = {
    iss: process.env.TICKY_JWT_ISS ?? 'tick-tack-done',
    aud: input.audience,
    sub: input.subject,
    iat: now,
    exp: now + TTL_SECONDS,
    jti: randomUUID(),
    authority_version: input.authorityVersion,
  };
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(createPrivateKey(pem)).toString('base64url');
  return `${signingInput}.${signature}`;
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
