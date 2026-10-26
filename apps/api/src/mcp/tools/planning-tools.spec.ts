import { describe, expect, it, vi } from 'vitest';
import { callPlanningTool } from './planning-tools.js';
import { requestPublicApi } from '../mcp-api.js';
import type { AuthUser } from '../../auth/auth-user.js';
vi.mock('../mcp-api.js', () => ({
  requestPublicApi: vi.fn(() => Promise.resolve({ data: { ok: true } })),
}));
const user: AuthUser = {
  id: 'user',
  email: 'test@example.test',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask',
  scopes: ['tasks:read', 'tasks:write'],
  tokenId: 'token',
  sessionId: null,
  listIds: null,
};
describe('F-AC-29 planning tools', () => {
  it('routes the same decision contract through public API guards and defaults to preview', async () => {
    await callPlanningTool(
      'record_plan_decision',
      { session_id: 's', task_id: 't', action: 'today', time: '09:30', duration: 30 },
      user,
      'Bearer synthetic',
    );
    expect(requestPublicApi).toHaveBeenLastCalledWith(
      {
        method: 'PUT',
        path: '/api/v1/planning/sessions/s/decisions/t',
        body: { action: 'today', time: '09:30', duration: 30 },
      },
      'Bearer synthetic',
    );
    await callPlanningTool('apply_day_plan', { session_id: 's' }, user, 'Bearer synthetic');
    expect(requestPublicApi).toHaveBeenLastCalledWith(
      { method: 'GET', path: '/api/v1/planning/sessions/s' },
      'Bearer synthetic',
    );
    await callPlanningTool('revert_day_plan', { operation_id: 'o' }, user, 'Bearer synthetic');
    expect(requestPublicApi).toHaveBeenLastCalledWith(
      { method: 'POST', path: '/api/v1/planning/operations/o/revert' },
      'Bearer synthetic',
    );
  });
});
