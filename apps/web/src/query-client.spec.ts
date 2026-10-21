import { beforeEach, expect, it } from 'vitest';
import { useActionToast } from './components/action-toast';
import { useLocale } from './i18n/locale';
import { messagesFor } from './i18n';
import { createAppQueryClient } from './query-client';

beforeEach(() => {
  useLocale.setState({ choice: 'es' });
  useActionToast.getState().clear();
});

it('TTD-AUD-28 RF-201: mutation errors are visible without a local onError handler', async () => {
  const client = createAppQueryClient();
  try {
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new Error('HTTP 500')),
    });
    await expect(mutation.execute(undefined)).rejects.toThrow('HTTP 500');
    expect(useActionToast.getState().text).toBe(messagesFor('es').actionFailed);
  } finally {
    client.clear();
  }
});

it('TTD-AUD-28: global feedback preserves local optimistic rollback handlers', async () => {
  const client = createAppQueryClient();
  let value = 'before';
  try {
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new Error('HTTP 500')),
      onMutate: () => {
        value = 'optimistic';
        return 'before';
      },
      onError: (_error, _input, previous) => {
        value = previous ?? '';
      },
    });
    await expect(mutation.execute(undefined)).rejects.toThrow('HTTP 500');
    expect(value).toBe('before');
    expect(useActionToast.getState().tone).toBe('error');
  } finally {
    client.clear();
  }
});
