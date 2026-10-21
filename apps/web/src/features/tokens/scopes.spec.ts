import { describe, expect, it } from 'vitest';
import { messagesFor } from '../../i18n';
import {
  GROUPS,
  defaultConsentScopes,
  groupedScopes,
  isSensitiveScope,
  scopeLabel,
} from './scopes';

const publicScopes = [
  'tasks:read',
  'tasks:write',
  'tasks:create',
  'tasks:update',
  'tasks:complete',
  'tasks:trash',
  'lists:read',
  'lists:write',
  'tags:read',
  'tags:write',
  'filters:read',
  'filters:write',
  'habits:read',
  'habits:write',
  'countdowns:read',
  'countdowns:write',
  'focus:read',
  'focus:write',
  'focus:start',
  'focus:stop',
  'notes:read',
  'notes:write',
  'calendar:read',
  'calendar:write',
  'reminders:write',
  'webhooks:manage',
  'automations:manage',
  'profile:read',
  'profile:write',
  'backup:read',
  'stats:read',
];

describe('TTD-AUD-41/42 shared permissions', () => {
  it('RF-2002: sensitive permissions require an explicit choice', () => {
    expect(
      defaultConsentScopes([
        'tasks:read',
        'webhooks:manage',
        'automations:manage',
        'profile:write',
      ]),
    ).toEqual(['tasks:read']);
    expect(['webhooks:manage', 'automations:manage', 'profile:write'].every(isSensitiveScope)).toBe(
      true,
    );
  });
  it.each(['es', 'en'])(
    'RF-2002: %s labels cover every external scope and manage stays distinct',
    (locale) => {
      const messages = messagesFor(locale);
      for (const scope of publicScopes) {
        expect(scopeLabel(scope, messages)).not.toContain(':');
        expect(scopeLabel(scope, messages).length).toBeGreaterThan(0);
      }
      expect(groupedScopes(['webhooks:manage'], messages)).toEqual([
        { resource: messages.tokenGroupWebhooks, access: messages.scopeManage },
      ]);
      expect(
        GROUPS.flatMap((group) => group.choices).some((choice) => choice.id === 'countdowns:write'),
      ).toBe(true);
    },
  );
});
