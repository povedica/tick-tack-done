import { ApiError } from '@reflexionia/sdk';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { runAction } from '../../components/run-action';
import { Button, SkeletonRows } from '../../components/ui';
import { failureMessage } from '../../failure';
import { useMessages } from '../../i18n';
import { dateTimeFormat } from '../../lib/dates/formatters';
import { TotpQr } from '../settings/TotpQr';

export function AccountPage() {
  const messages = useMessages();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const profile = me.data;
  const [name, setName] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [children, setChildren] = useState<'ask' | 'complete' | 'leave' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [againPassword, setAgainPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const displayName = name ?? profile?.display_name ?? '';
  const timeZone = zone ?? profile?.time_zone ?? '';
  const childPolicy = children ?? profile?.task_complete_children ?? 'ask';
  const [zoneQuery, setZoneQuery] = useState('');
  const zones = timeZones(timeZone);
  const matchingZones = [timeZone, ...zones.filter((item) => item !== timeZone)].filter(
    (item) =>
      item === timeZone ||
      `${item} ${timeZoneLabel(item)}`.toLowerCase().includes(zoneQuery.toLowerCase()),
  );
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsAccount}</h1>
          <p className="lede">{messages.accountHint}</p>
        </div>
      </header>
      {profile === undefined && me.isPending ? <SkeletonRows /> : null}
      {me.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
      {profile !== undefined ? (
        <>
          <section className="token-panel">
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                setStatus(null);
                void api
                  .updateMe({
                    display_name: displayName,
                    time_zone: timeZone,
                    task_complete_children: childPolicy,
                  })
                  .then(() => {
                    setStatus(messages.saved);
                  })
                  .catch(() => {
                    setStatus(messages.saveFailed);
                  });
              }}
            >
              <label className="token-label" htmlFor="account-name">
                {messages.displayName}
              </label>
              <input
                id="account-name"
                className="token-name"
                value={displayName}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <p className="token-label">{messages.email}</p>
              <p className="token-meta">{profile.email}</p>
              <label className="token-label" htmlFor="account-zone">
                {messages.timeZone}
              </label>
              <input
                type="search"
                className="token-name"
                value={zoneQuery}
                aria-label={messages.timeZoneSearch}
                placeholder={messages.timeZoneSearch}
                onChange={(event) => {
                  setZoneQuery(event.target.value);
                }}
              />
              {zones.length > 0 ? (
                <select
                  id="account-zone"
                  className="token-name"
                  value={timeZone}
                  onChange={(event) => {
                    setZone(event.target.value);
                  }}
                >
                  {matchingZones.map((item) => (
                    <option key={item} value={item}>
                      {timeZoneLabel(item)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="account-zone"
                  className="token-name"
                  value={timeZone}
                  onChange={(event) => {
                    setZone(event.target.value);
                  }}
                />
              )}
              <p className="token-meta">{messages.timeZoneHint}</p>
              <label className="token-label" htmlFor="account-children">
                {messages.childrenPolicy}
              </label>
              <select
                id="account-children"
                className="token-name"
                value={childPolicy}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === 'ask' || next === 'complete' || next === 'leave') {
                    setChildren(next);
                  }
                }}
              >
                <option value="ask">{messages.childrenAsk}</option>
                <option value="complete">{messages.completeChildren}</option>
                <option value="leave">{messages.leaveChildren}</option>
              </select>
              <Button type="submit" variant="primary" size="sm">
                {messages.saveChanges}
              </Button>
              {status !== null ? <p role="status">{status}</p> : null}
            </form>
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.password}</h2>
                <p>{messages.passwordShort}</p>
              </div>
            </div>
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (nextPassword.length < 10) {
                  setPasswordStatus(messages.passwordShort);
                  return;
                }
                if (nextPassword !== againPassword) {
                  setPasswordStatus(messages.passwordMismatch);
                  return;
                }
                setPasswordStatus(null);
                void api.changePassword(currentPassword, nextPassword).then(
                  () => {
                    setCurrentPassword('');
                    setNextPassword('');
                    setAgainPassword('');
                    setPasswordStatus(messages.passwordChanged);
                  },
                  (reason: unknown) => {
                    setPasswordStatus(failureMessage(reason, messages.settingsFailed));
                  },
                );
              }}
            >
              <label className="token-label" htmlFor="password-current">
                {messages.passwordCurrent}
              </label>
              <input
                id="password-current"
                className="token-name"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                }}
              />
              <label className="token-label" htmlFor="password-new">
                {messages.passwordNew}
              </label>
              <input
                id="password-new"
                className="token-name"
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => {
                  setNextPassword(event.target.value);
                }}
              />
              <label className="token-label" htmlFor="password-again">
                {messages.passwordAgain}
              </label>
              <input
                id="password-again"
                className="token-name"
                type="password"
                autoComplete="new-password"
                value={againPassword}
                onChange={(event) => {
                  setAgainPassword(event.target.value);
                }}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  currentPassword.length === 0 ||
                  nextPassword.length === 0 ||
                  againPassword.length === 0
                }
              >
                {messages.saveChanges}
              </Button>
              {passwordStatus !== null ? (
                <p role={passwordStatus === messages.passwordChanged ? 'status' : 'alert'}>
                  {passwordStatus}
                </p>
              ) : null}
            </form>
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.enableTwoFactor}</h2>
                <p>{messages.twoFactorHint}</p>
              </div>
            </div>
            {setup === null ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTotpError(null);
                  void api
                    .beginTotp()
                    .then((body) => {
                      const secret = textOf(body.secret);
                      const otpauth = textOf(body.otpauth);
                      if (secret.length === 0) {
                        setTotpError(messages.settingsFailed);
                        return;
                      }
                      setSetup({ secret, otpauth });
                    })
                    .catch(() => {
                      setTotpError(messages.settingsFailed);
                    });
                }}
              >
                {messages.enableTwoFactor}
              </Button>
            ) : (
              <div className="token-secret">
                <p>{messages.twoFactorReady}</p>
                {setup.otpauth.length > 0 ? (
                  <TotpQr value={setup.otpauth} label={messages.twoFactorQr} />
                ) : null}
                <code>{setup.secret}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.cancelTotp().finally(() => {
                        setSetup(null);
                        setTotpCode('');
                        setTotpError(null);
                      }),
                    );
                  }}
                >
                  {messages.cancel}
                </Button>
              </div>
            )}
            {setup !== null && codes === null ? (
              <form
                className="token-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (totpCode.trim().length !== 6) {
                    return;
                  }
                  setTotpError(null);
                  void api
                    .confirmTotp(totpCode.trim())
                    .then((body) => {
                      setCodes(stringsOf(body.recovery_codes));
                      setTotpCode('');
                    })
                    .catch((reason: unknown) => {
                      setTotpError(
                        reason instanceof ApiError && reason.code === 'invalid_totp'
                          ? messages.twoFactorInvalid
                          : messages.settingsFailed,
                      );
                    });
                }}
              >
                <label className="token-label" htmlFor="totp-code">
                  {messages.twoFactorCode}
                </label>
                <input
                  id="totp-code"
                  className="token-name"
                  value={totpCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(event) => {
                    setTotpCode(event.target.value);
                  }}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={totpCode.trim().length !== 6}
                >
                  {messages.saveChanges}
                </Button>
              </form>
            ) : null}
            {codes !== null ? (
              <div className="token-secret">
                <p>{messages.twoFactorCodes}</p>
                <pre className="token-snippet">{codes.join('\n')}</pre>
              </div>
            ) : null}
            {totpError !== null ? <p role="alert">{totpError}</p> : null}
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.accountDanger}</h2>
                <p>{messages.deleteAccountUnavailable}</p>
              </div>
            </div>
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (confirmEmail !== profile.email) {
                  return;
                }
                runAction(api.deleteAccount(profile.email));
              }}
            >
              <label className="token-label" htmlFor="account-delete">
                {messages.email}
              </label>
              <input
                id="account-delete"
                className="token-name"
                type="email"
                value={confirmEmail}
                autoComplete="off"
                onChange={(event) => {
                  setConfirmEmail(event.target.value);
                }}
              />
              <Button
                type="submit"
                size="sm"
                variant="danger"
                disabled={confirmEmail !== profile.email}
              >
                {messages.deleteAccount}
              </Button>
            </form>
          </section>
        </>
      ) : null}
    </section>
  );
}

function timeZones(current: string): readonly string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  if (current.length > 0 && !known.includes(current)) {
    return [current, ...known];
  }
  return known;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function timeZoneLabel(zone: string): string {
  try {
    const parts = dateTimeFormat('es-ES', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const city = zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone;
    return `${city} (${offset.replace('GMT', 'UTC')})`;
  } catch {
    return zone;
  }
}
