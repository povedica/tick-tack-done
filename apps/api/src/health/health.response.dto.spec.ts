import { afterEach, expect, it, vi } from 'vitest';
import { HealthResponseDto } from './health.response.dto.js';
import { API_VERSION, buildVersion } from '../build-info.js';
afterEach(() => vi.unstubAllEnvs());
it('TTD-AUD-104: public build metadata matches MCP initialize version', () => {
  vi.stubEnv('GIT_COMMIT', 'abcdef1234567');
  vi.stubEnv('BUILD_TIME', '2026-10-22T10:00:00Z');
  const health = new HealthResponseDto();
  expect(health).toMatchObject({
    status: 'ok',
    commit: 'abcdef1234567',
    version: API_VERSION,
    built_at: '2026-10-22T10:00:00Z',
    mcp_version: buildVersion(),
  });
  expect(Object.keys(health).sort()).toEqual([
    'built_at',
    'commit',
    'mcp_version',
    'status',
    'version',
  ]);
});
