import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@reflexionia/sdk';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { runAction } from '../../components/run-action';
const REMINDER_VALUES = ['-PT0M', '-PT5M', '-PT15M', '-PT30M', '-PT1H', '-P1D'] as const;

export function LegacyNotificationSettings() {
  const messages = useMessages();
  const locale = useAppLocale();
  const timeLang = locale.toLowerCase().startsWith('en') ? 'en-GB' : 'es-ES';
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const saved = me.data?.daily_reminder_time ?? '';
  const savedDefault = reminderValue(me.data, 'default_reminder_trigger');
  const [showAllLists, setShowAllLists] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [defaultDraft, setDefaultDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [push, setPush] = useState<NotificationPermission | 'missing'>(pushPermission);
  const [listOverrides, setListOverrides] = useState<Readonly<Record<string, string>>>({});
  const value = draft ?? saved;
  const defaultReminder = defaultDraft ?? savedDefault;
  const reminderLabels: Record<(typeof REMINDER_VALUES)[number], string> = {
    '-PT0M': messages.reminderAtTime,
    '-PT5M': messages.reminder5,
    '-PT15M': messages.reminder15,
    '-PT30M': messages.reminder30,
    '-PT1H': messages.reminderHour,
    '-P1D': messages.reminderDay,
  };
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsNotifications}</h1>
          <p className="lede">{messages.notificationsLede}</p>
        </div>
      </header>
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (me.data === undefined || value === saved) {
              return;
            }
            setStatus(null);
            void api
              .updateMe({ daily_reminder_time: value.length === 0 ? null : value })
              .then(() => {
                setDraft(null);
                setStatus(messages.saved);
              })
              .catch(() => {
                setStatus(messages.saveFailed);
              });
          }}
        >
          <label className="token-label" htmlFor="daily-reminder">
            {messages.dailyReminder}
          </label>
          <input
            id="daily-reminder"
            className="token-name is-time"
            type="time"
            lang={timeLang}
            step={60}
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus(null);
            }}
          />
          <p className="token-meta">{messages.quietLocal}</p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={me.data === undefined || value === saved}
          >
            {messages.reminderSaveDaily}
          </Button>
          {status !== null ? <p role="status">{status}</p> : null}
        </form>
      </section>
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (me.data === undefined || defaultReminder === savedDefault) {
              return;
            }
            setStatus(null);
            void api
              .updateMe({
                default_reminder_trigger: defaultReminder.length === 0 ? null : defaultReminder,
              })
              .then(() => {
                setDefaultDraft(null);
                setStatus(messages.saved);
                runAction(queryClient.invalidateQueries({ queryKey: ['me'] }));
              })
              .catch(() => {
                setStatus(messages.saveFailed);
              });
          }}
        >
          <label className="token-label" htmlFor="default-reminder">
            {messages.defaultReminder}
          </label>
          <select
            id="default-reminder"
            className="token-name is-short"
            value={defaultReminder}
            onChange={(event) => {
              setDefaultDraft(event.target.value);
              setStatus(null);
            }}
          >
            <option value="">{messages.reminderNone}</option>
            {REMINDER_VALUES.map((item) => (
              <option key={item} value={item}>
                {reminderLabels[item]}
              </option>
            ))}
          </select>
          <p className="token-meta">{messages.defaultReminderHint}</p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={me.data === undefined || defaultReminder === savedDefault}
          >
            {messages.reminderSaveDefault}
          </Button>
        </form>
      </section>
      <section className="token-panel is-list" aria-label={messages.listReminders}>
        <div className="token-panel-head">
          <div>
            <h2>{messages.listReminders}</h2>
            <p>{messages.listRemindersHint}</p>
          </div>
        </div>
        <Button
          type="button"
          aria-pressed={showAllLists}
          onClick={() => {
            setShowAllLists(!showAllLists);
          }}
        >
          {showAllLists ? messages.reminderHideLists : messages.reminderShowLists}
        </Button>
        {(projects.data?.items ?? [])
          .filter(
            (list) =>
              showAllLists || (listOverrides[list.id] ?? listReminderValue(list)).length > 0,
          )
          .map((list) => {
            const current = listOverrides[list.id] ?? listReminderValue(list);
            return (
              <label className="token-row" key={list.id}>
                <span>{list.name}</span>
                <select
                  className="token-name is-short"
                  aria-label={list.name}
                  value={current}
                  onChange={(event) => {
                    const next = event.target.value;
                    setListOverrides((previous) => ({ ...previous, [list.id]: next }));
                    runAction(
                      api
                        .updateProject(list.id, {
                          default_reminder_trigger: next.length === 0 ? null : next,
                        })
                        .then(() => {
                          runAction(queryClient.invalidateQueries({ queryKey: ['projects'] }));
                        }),
                    );
                  }}
                >
                  <option value="">{messages.reminderInherit}</option>
                  <option value="off">{messages.reminderNone}</option>
                  {REMINDER_VALUES.map((item) => (
                    <option key={item} value={item}>
                      {reminderLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.pushTitle}</h2>
            <p>{pushText(messages, push)}</p>
          </div>
        </div>
        {push === 'default' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (typeof Notification === 'undefined') {
                setPush('missing');
                return;
              }
              runAction(
                Notification.requestPermission().then((next) => {
                  setPush(next);
                }),
              );
            }}
          >
            {messages.pushEnable}
          </Button>
        ) : null}
      </section>
    </section>
  );
}

function reminderValue(me: unknown, key: string): string {
  if (typeof me !== 'object' || me === null) {
    return '';
  }
  const value = (me as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function listReminderValue(list: Project): string {
  const value = (list as Project & { default_reminder_trigger?: string | null })
    .default_reminder_trigger;
  return typeof value === 'string' ? value : '';
}

function pushPermission(): NotificationPermission | 'missing' {
  if (typeof Notification === 'undefined') {
    return 'missing';
  }
  return Notification.permission;
}

function pushText(messages: Messages, permission: NotificationPermission | 'missing'): string {
  if (permission === 'granted') {
    return messages.pushGranted;
  }
  if (permission === 'denied') {
    return messages.pushDenied;
  }
  if (permission === 'default') {
    return messages.pushDefault;
  }
  return messages.pushMissing;
}
