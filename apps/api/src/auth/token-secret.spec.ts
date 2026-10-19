import { describe, expect, it } from 'vitest';
import { hashPersonalAccessToken, newPersonalAccessToken, parseBearer } from './token-secret.js';

describe('personal access token secret', () => {
  it('RF-2002: the stored hash is not the token', () => {
    const issued = newPersonalAccessToken();
    expect(issued.token.startsWith('rfx_pat_')).toBe(true);
    expect(issued.hash).toBe(hashPersonalAccessToken(issued.token));
    expect(issued.hash).not.toBe(issued.token);
    expect(issued.prefix).toBe(issued.token.slice(0, 16));
    expect(issued.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('RF-2002: a bearer header does not fall through when it is malformed', () => {
    expect(parseBearer(undefined)).toEqual({ kind: 'absent' });
    expect(parseBearer('   ')).toEqual({ kind: 'absent' });
    expect(parseBearer('Basic abc')).toEqual({ kind: 'invalid' });
    expect(parseBearer('Bearer short')).toEqual({ kind: 'invalid' });
    expect(parseBearer('Bearer rfx_pat_abcdefghijklmnopqrstuvwxyz')).toEqual({
      kind: 'token',
      token: 'rfx_pat_abcdefghijklmnopqrstuvwxyz',
    });
  });
});
