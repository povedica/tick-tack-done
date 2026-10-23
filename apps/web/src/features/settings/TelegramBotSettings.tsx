import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { Button } from '../../components/ui';

export function TelegramBotSettings({
  status,
  onSaved,
}: {
  status: Record<string, unknown> | undefined;
  onSaved: () => void;
}) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const value = token.trim();
      setToken('');
      return api.configureTelegram(value);
    },
    onSuccess: async () => {
      setToken('');
      onSaved();
      await queryClient.invalidateQueries({ queryKey: ['telegram'] });
    },
  });
  const botUsername = status?.bot_username ?? status?.username;
  const username = typeof botUsername === 'string' ? botUsername : null;
  return (
    <div>
      <p>{messages.telegramOwnBotHint}</p>
      {username !== null ? (
        <p>
          Bot:{' '}
          <a href={`https://t.me/${encodeURIComponent(username)}`} target="_blank" rel="noreferrer">
            @{username}
          </a>
        </p>
      ) : null}
      {status?.webhook_state === 'local_only' ? (
        <p role="status">{messages.telegramLocalOnly}</p>
      ) : null}
      {status?.webhook_state === 'registered' ? (
        <p role="status">{messages.telegramWebhookRegistered}</p>
      ) : null}
      <form
        className="telegram-bot-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="token-label" htmlFor="telegram-bot-token">
          {messages.telegramBotToken}
        </label>
        <input
          id="telegram-bot-token"
          className="token-name"
          type="password"
          value={token}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          onChange={(event) => {
            setToken(event.target.value);
            save.reset();
          }}
          required
        />
        <Button
          type="submit"
          size="sm"
          loading={save.isPending}
          disabled={token.trim().length === 0 || save.isPending}
        >
          {messages.telegramBotSave}
        </Button>
      </form>
      {save.isError ? <p role="alert">{messages.telegramBotSaveError}</p> : null}
      {save.isSuccess ? <p role="status">{messages.telegramBotSaved}</p> : null}
    </div>
  );
}
