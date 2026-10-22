import { expect, it } from 'vitest';
import { buildDiagnostics } from './diagnostics';
it('TTD-AUD-104: diagnostic has only versions, browser and time zone, never account secrets', () => {
  const result = buildDiagnostics({
    web: { commit: 'abcdef123456', builtAt: '2026-10-22T10:00:00Z' },
    api: {
      commit: '1234567',
      version: '0.2.0',
      built_at: '2026-10-22T10:00:00Z',
      mcp_version: '0.2.0+1234567',
      email: 'private@example.test',
      token: 'Bearer secret',
    },
    userAgent: 'Mozilla/5.0 Chrome/131.0.1 private@example.test Bearer secret',
    timeZone: 'Europe/Madrid',
  });
  expect(result).toContain('abcdef1');
  expect(result).toContain('Chrome 131.0.1');
  expect(result).toContain('Europe/Madrid');
  expect(result).not.toMatch(/@|Bearer|private|secret/i);
  const unsafe = buildDiagnostics({
    web: { commit: 'Bearer secret', builtAt: 'private@example.test' },
    api: { commit: 'private@example.test', version: 'Bearer secret', mcp_version: 'token' },
    userAgent: 'Bearer secret',
    timeZone: 'private@example.test',
  });
  expect(unsafe).not.toMatch(/@|Bearer|private|secret/i);
});
