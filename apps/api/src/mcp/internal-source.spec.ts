import { describe, expect, it } from 'vitest';
import { mcpSourceHeaders, trustedMcpSource } from './internal-source.js';
describe('TTD-AUD-116 internal MCP proof', () => {
  it('trusts only a signed local bearer request with matching method and path', () => {
    const headers = mcpSourceHeaders('POST', '/api/v1/tasks', 'Bearer synthetic');
    const input = {
      remoteAddress: '127.0.0.1',
      method: 'POST',
      path: '/api/v1/tasks',
      authorization: 'Bearer synthetic',
      source: headers['X-TTD-Source'],
      timestamp: headers['X-TTD-Internal-Time'],
      proof: headers['X-TTD-Internal-Proof'],
    };
    expect(trustedMcpSource(input)).toBe(true);
    expect(trustedMcpSource({ ...input, remoteAddress: '203.0.113.1' })).toBe(false);
    expect(trustedMcpSource({ ...input, proof: undefined })).toBe(false);
    expect(trustedMcpSource({ ...input, path: '/api/v1/projects' })).toBe(false);
    expect(trustedMcpSource({ ...input, authorization: 'Bearer other' })).toBe(false);
  });
});
