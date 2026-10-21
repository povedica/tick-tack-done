import { describe, expect, it } from 'vitest';
import { DomainException } from '../http/domain.exception.js';
import { grantApprovedScopes, resolveRequestedScopes } from './oauth-grants.js';
import { OAUTH_DEFAULT_SCOPES } from './scopes.js';

describe('oauth grants', () => {
  it('uses the MCP default set when scope is omitted and never grants account admin', () => {
    expect(resolveRequestedScopes(undefined)).toEqual([...OAUTH_DEFAULT_SCOPES]);
    expect(resolveRequestedScopes('')).not.toContain('account:admin');
    expect(resolveRequestedScopes('')).not.toContain('profile:write');
    expect(resolveRequestedScopes('')).not.toContain('backup:read');
    expect(() => resolveRequestedScopes('account:admin')).toThrow(DomainException);
    expect(() => resolveRequestedScopes('not-a-scope')).toThrow(DomainException);
  });

  it('keeps granted scopes inside the approved subset of the request', () => {
    expect(grantApprovedScopes('tasks:read tasks:write', 'tasks:read')).toEqual(['tasks:read']);
    expect(grantApprovedScopes(undefined, 'tasks:read')).toEqual(['tasks:read']);
    expect(() => grantApprovedScopes('', 'backup:read')).toThrow(DomainException);
    expect(() => grantApprovedScopes('tasks:read', 'tasks:read tasks:write')).toThrow(
      DomainException,
    );
    expect(() => grantApprovedScopes(undefined, '')).toThrow(DomainException);
  });
});

it('TTD-AUD-42 RF-2002: defaults exclude sensitive permissions and external OAuth rejects internal ones', () => {
  const defaults = resolveRequestedScopes(undefined);
  for (const scope of ['webhooks:manage', 'automations:manage', 'profile:write']) {
    expect(defaults).not.toContain(scope);
    expect(grantApprovedScopes(scope, scope)).toEqual([scope]);
  }
  for (const scope of [
    'ticky:proposals:read',
    'ticky:routines:write',
    'notifications:self:write',
  ]) {
    expect(() => resolveRequestedScopes(scope)).toThrow(DomainException);
    expect(() => grantApprovedScopes(undefined, scope)).toThrow(DomainException);
  }
});
