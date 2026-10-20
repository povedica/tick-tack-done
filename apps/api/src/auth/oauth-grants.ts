import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { isApiScope, OAUTH_DEFAULT_SCOPES } from './scopes.js';
import { mcpResourceUrl } from './public-origin.js';

export function splitScopes(raw: string): string[] {
  const scopes = raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  return [...new Set(scopes)];
}

/** Empty or omitted scope means the MCP default set. Unknown scopes are rejected. */
export function resolveRequestedScopes(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [...OAUTH_DEFAULT_SCOPES];
  }
  const scopes = splitScopes(raw);
  if (scopes.length === 0 || scopes.some((scope) => !isApiScope(scope))) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'scope must list known scopes',
    );
  }
  return scopes;
}

/**
 * Granted scopes are the ones the owner approved, and never a superset of the request.
 * When `requestedRaw` is omitted, the approved list is the whole grant (existing clients).
 */
export function grantApprovedScopes(
  requestedRaw: string | undefined,
  approvedRaw: string,
): string[] {
  const approved = splitScopes(approvedRaw);
  if (approved.length === 0 || approved.some((scope) => !isApiScope(scope))) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'scope must list known scopes',
    );
  }
  if (requestedRaw === undefined) {
    return approved;
  }
  const ceiling = new Set(resolveRequestedScopes(requestedRaw));
  if (approved.some((scope) => !ceiling.has(scope))) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'scope exceeds the authorization request',
    );
  }
  return approved;
}

/** RFC 8707. Absent resource is allowed. A present resource must be this MCP server. */
export function assertOauthResource(resource: string | undefined): string | null {
  if (resource === undefined || resource.length === 0) {
    return null;
  }
  if (resource !== mcpResourceUrl()) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'invalid_target',
      'resource does not match this server',
    );
  }
  return resource;
}
