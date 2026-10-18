import { describe, expect, it } from 'vitest';
import {
  signWebhookBody,
  webhookRetryDelayMs,
  webhookStillOpen,
  WEBHOOK_MAX_ATTEMPTS,
} from './sign';

describe('webhooks', () => {
  it('RF-11010: signs the body with HMAC-SHA256', async () => {
    const header = await signWebhookBody('secret', '{"ok":true}');
    expect(header.startsWith('sha256=')).toBe(true);
    expect(header).toHaveLength('sha256='.length + 64);
  });

  it('RF-11010: retries ten times inside 24 hours and then stops', () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(WEBHOOK_MAX_ATTEMPTS)).toBeNull();
    expect(webhookRetryDelayMs(0)).toBeNull();
    expect(webhookStillOpen('2026-10-18T00:00:00.000Z', '2026-10-18T12:00:00.000Z', 2)).toBe(true);
    expect(webhookStillOpen('2026-10-18T00:00:00.000Z', '2026-10-19T00:00:00.000Z', 2)).toBe(false);
    expect(webhookStillOpen('nope', '2026-10-18T00:00:00.000Z', 1)).toBe(false);
  });
});
