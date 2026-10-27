import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@reflexionia/sdk';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { Button } from '../../components/ui';
import { telegramUiState, useWtCMessages, type TelegramUiState } from './i18n-wt-c';

export interface TelegramBotParts {
  readonly state: TelegramUiState;
  readonly busy: boolean;
  readonly username: string | null;
  readonly replacing: boolean;
  readonly toggleReplace: () => void;
  readonly retry: () => void;
  readonly remove: () => void;
  readonly localOnly: ReactNode;
  readonly form: ReactNode;
  readonly alerts: ReactNode;
}

export function TelegramBotSettings({
  status,
  onSaved,
  children,
}: {
  status: Record<string, unknown> | undefined;
  onSaved: () => void;
  children?: (parts: TelegramBotParts) => ReactNode;
}) {
  const messages = useMessages();
  const m = useWtCMessages();
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [replacing, setReplacing] = useState(false);
  const state = telegramUiState(status);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['telegram'] }),
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
    ]);
  const refresh = async () => {
    setToken('');
    setReplacing(false);
    onSaved();
    await invalidate();
  };
  const save = useMutation({
    mutationFn: (force: boolean) => api.configureTelegram(token.trim(), force),
    onSuccess: refresh,
    onError: invalidate,
  });
  const retry = useMutation({
    mutationFn: () => api.retryTelegramWebhook(),
    onSuccess: refresh,
    onError: refresh,
  });
  const remove = useMutation({ mutationFn: () => api.removeTelegramBot(), onSuccess: refresh });
  const code = save.error instanceof ApiError ? save.error.code : null;
  const message = code && code in m ? m[code as keyof typeof m] : messages.telegramBotSaveError;
  const botUsername = status?.bot_username ?? status?.username;
  const username = typeof botUsername === 'string' ? botUsername : null;
  const busy = save.isPending || retry.isPending || remove.isPending;
  const managementError = retry.error ?? remove.error;
  const managementCode = managementError instanceof ApiError ? managementError.code : null;
  const managementMessage =
    managementCode && managementCode in m
      ? m[managementCode as keyof typeof m]
      : m.telegram_configuration_failed;
  const localOnly =
    state === 'token_saved' ? <p role="status">{messages.telegramLocalOnly}</p> : null;
  const identity = username ? (
    <p>
      Bot:{' '}
      <a href={`https://t.me/${encodeURIComponent(username)}`} target="_blank" rel="noreferrer">
        @{username}
      </a>
    </p>
  ) : null;
  const form =
    state === 'none' || replacing ? (
      <form
        className="telegram-bot-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(false);
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
        <Button type="submit" size="sm" loading={save.isPending} disabled={!token.trim() || busy}>
          {state === 'none' ? m.connect : m.replace}
        </Button>
      </form>
    ) : null;
  const alerts = (
    <>
      {save.isError ? (
        <p role="alert">
          {code ? `${code}: ` : ''}
          {message}
        </p>
      ) : null}
      {code === 'telegram_webhook_in_use' ? (
        <Button
          size="sm"
          disabled={!token.trim() || busy}
          onClick={() => {
            save.mutate(true);
          }}
        >
          {m.force}
        </Button>
      ) : null}
      {retry.isError || remove.isError ? (
        <p role="alert">
          {managementCode ? `${managementCode}: ` : ''}
          {managementMessage}
        </p>
      ) : null}
      {save.isSuccess ? <p role="status">{messages.telegramBotSaved}</p> : null}
    </>
  );
  const parts: TelegramBotParts = {
    state,
    busy,
    username,
    replacing,
    toggleReplace: () => {
      setReplacing((value) => !value);
    },
    retry: () => {
      retry.mutate();
    },
    remove: () => {
      remove.mutate();
    },
    localOnly,
    form,
    alerts,
  };
  if (children) return children(parts);
  return (
    <div>
      <p>{messages.telegramOwnBotHint}</p>
      {identity}
      {localOnly}
      {form}
      {alerts}
    </div>
  );
}
