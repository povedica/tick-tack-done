import { beforeEach, expect, it, vi } from 'vitest';
import { useLocale } from '../i18n/locale';
import { messagesFor } from '../i18n';
import { useActionToast } from './action-toast';
import { runAction, installActionErrorFallback } from './run-action';

beforeEach(() => {
  useLocale.setState({ choice: 'es' });
  useActionToast.getState().clear();
});

it('TTD-AUD-28 RF-201: failed actions show a localized error and restore optimistic state', async () => {
  let state = 'optimistic';
  const success = vi.fn();
  runAction(Promise.reject(new Error('HTTP 500 private detail')), {
    success,
    rollback: () => {
      state = 'original';
    },
  });
  await vi.waitFor(() => {
    expect(useActionToast.getState().text).toBe(messagesFor('es').actionFailed);
  });
  expect(state).toBe('original');
  expect(success).not.toHaveBeenCalled();
  expect(useActionToast.getState().tone).toBe('error');
  expect(useActionToast.getState().text).not.toContain('private');
});

it('TTD-AUD-28: success callbacks run only after success and do not create an error toast', async () => {
  const success = vi.fn();
  runAction(Promise.resolve(42), { success });
  await vi.waitFor(() => {
    expect(success).toHaveBeenCalledWith(42);
  });
  expect(useActionToast.getState().text).toBeNull();
});

it('TTD-AUD-28: errors in a success callback also receive feedback in the chosen language', async () => {
  useLocale.setState({ choice: 'en' });
  runAction(Promise.resolve(), {
    success: () => {
      throw new Error('UI callback failed');
    },
  });
  await vi.waitFor(() => {
    expect(useActionToast.getState().text).toBe(messagesFor('en').actionFailed);
  });
});

it('TTD-AUD-28: unhandled rejection fallback is visible and its listener can be removed', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const remove = installActionErrorFallback();
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: new Error('500') });
    target.dispatchEvent(event);
    expect(useActionToast.getState().tone).toBe('error');
    remove();
    useActionToast.getState().clear();
    target.dispatchEvent(event);
    expect(useActionToast.getState().text).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
