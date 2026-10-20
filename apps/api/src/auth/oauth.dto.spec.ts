import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { OauthConsentDto } from './oauth.dto.js';
import { API_SCOPES } from './scopes.js';

describe('OauthConsentDto', () => {
  it('accepts every advertised API scope in one consent grant', async () => {
    const scope = API_SCOPES.join(' ');
    expect(scope.length).toBeGreaterThan(500);
    const dto = plainToInstance(OauthConsentDto, {
      client_id: '00000000-0000-0000-0000-000000000001',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      scope,
      requested_scope: scope,
      state: 'state-long-enough',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
      allow: true,
      resource: 'https://todo.reflexionia.com/api/v1/mcp',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
