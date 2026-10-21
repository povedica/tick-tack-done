import { runAction } from '../../components/run-action';
import { addCalendarDays } from '@reflexionia/domain';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Flame } from 'lucide-react';
import { api } from '../../api';
import { Popover } from '../../components/Popover';
import { statsApi } from './api';
import { rangeFor } from './range';
import { useStatisticsText } from './text';
import './control.css';

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  typeof value === 'object' && value !== null ? (value as Row) : {};
const num = (value: unknown) => (typeof value === 'number' ? value : 0);
export function useControlSummary() {
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const tz = account.data?.time_zone ?? 'Europe/Madrid';
  const params = { ...rangeFor('week', tz), tz };
  const query = useQuery({
    queryKey: ['stats', 'overview', params],
    queryFn: () => statsApi.overview(params),
    staleTime: 5 * 60_000,
    enabled: account.isSuccess,
  });
  const summary = row(query.data?.summary);
  return { ...query, achievement: row(summary.achievement), streak: num(summary.streak_current) };
}
export function ControlSummary({
  value,
  outOf = false,
}: {
  readonly value: unknown;
  readonly outOf?: boolean;
}) {
  const data = row(value);
  const { t, number, locale } = useStatisticsText();
  const score = typeof data.score === 'number' ? data.score : null;
  const components = row(data.components);
  const history = Array.isArray(data.history) ? data.history.map(row) : [];
  const lastDate = history.at(-1)?.date;
  const weekAgo = typeof lastDate === 'string' ? addCalendarDays(lastDate, -7) : null;
  const previous = history.find((item) => item.date === weekAgo)?.score;
  const delta = score !== null && typeof previous === 'number' ? score - previous : null;
  return (
    <div className="control-summary">
      <p className="control-value">
        <strong>{score === null ? '—' : number(score)}</strong>{' '}
        {outOf ? t('controlOutOf') : '/ 100'}{' '}
        <span>
          {score === null
            ? t('noControl')
            : t(score >= 75 ? 'controlGood' : score >= 50 ? 'controlFair' : 'controlBehind')}
        </span>
      </p>
      {score === null ? null : <progress max={100} value={score} aria-label={t('achievement')} />}
      {delta === null ? null : (
        <p>
          {delta > 0 ? '+' : ''}
          {number(delta)} {t('controlChange')}
        </p>
      )}
      <dl className="control-components">
        {(['tasks', 'habits', 'focus', 'usage'] as const).map((key) => {
          const component = row(components[key]);
          return (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>
                {component.configured === true
                  ? `${number(num(component.earned))} / ${number(num(component.max))}`
                  : t('notConfigured')}
              </dd>
            </div>
          );
        })}
      </dl>
      {typeof data.topDeduction === 'string' ? (
        <p>{locale.startsWith('en') ? englishDeduction(data.topDeduction) : data.topDeduction}</p>
      ) : null}
      <details>
        <summary>{t('formula')}</summary>
        <p>{t('controlFormula')}</p>
        <p>{t('controlBands')}</p>
        <p>{t('controlUndated')}</p>
        <p>{t('controlUsageHelp')}</p>
      </details>
    </div>
  );
}
export function ControlChip({ compact = false }: { readonly compact?: boolean }) {
  const query = useControlSummary();
  const { t, number, countDays } = useStatisticsText();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const score = typeof query.achievement.score === 'number' ? query.achievement.score : null;
  const label =
    score === null
      ? t('noControl')
      : t(score >= 75 ? 'controlGood' : score >= 50 ? 'controlFair' : 'controlBehind');
  const rect = trigger.current?.getBoundingClientRect();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="control-chip"
        data-state={
          score === null ? 'empty' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'behind'
        }
        aria-label={`${t('achievement')}: ${score === null ? '—' : `${number(score)}/100`}, ${countDays(query.streak)}, ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Flame size={16} aria-hidden="true" />
        {compact ? null : (
          <span>
            <b>{number(query.streak)}</b>
            {countDays(query.streak).slice(number(query.streak).length)} ·{' '}
          </span>
        )}
        <strong>{score === null ? '—' : `${number(score)}/100`}</strong>
        {compact ? null : <span>{label}</span>}
      </button>
      {open
        ? createPortal(
            <div
              className="control-popover-position"
              style={{
                top: Math.min(rect?.bottom ?? 60, window.innerHeight - 260) + 8,
                left: Math.max(12, Math.min(rect?.left ?? 12, window.innerWidth - 372)),
                maxHeight:
                  window.innerHeight -
                  (Math.min(rect?.bottom ?? 60, window.innerHeight - 260) + 8) -
                  12,
              }}
            >
              <Popover
                open
                label={t('achievement')}
                onClose={() => {
                  setOpen(false);
                }}
                className="popover control-popover"
              >
                <h2>{t('achievement')}</h2>
                <p>
                  <Flame size={16} aria-hidden="true" /> {t('streak')}: {countDays(query.streak)}
                </p>
                {query.isPending ? (
                  <p role="status">{t('loading')}</p>
                ) : query.isError ? (
                  <div role="alert">
                    <p>{t('error')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        runAction(query.refetch());
                      }}
                    >
                      {t('retry')}
                    </button>
                  </div>
                ) : query.achievement.enabled === false ? (
                  <p>{t('disabled')}</p>
                ) : (
                  <ControlSummary value={query.achievement} outOf />
                )}
                <Link
                  to="/statistics"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  {t('viewStatistics')}
                </Link>
              </Popover>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Translate the API's controlled reason vocabulary without recalculating the score.
function englishDeduction(text: string): string {
  return text
    .replace(
      /^(\d+) vencidas( de más de 30 días)?: -(\d+) en Tareas$/,
      (_, count: string, old: string | undefined, points: string) =>
        `${count} overdue tasks${old ? ' over 30 days old' : ''}: -${points} in Tasks`,
    )
    .replace(
      /^Tareas a tiempo: (.*) en los últimos 14 días$/,
      'On-time tasks: $1 in the last 14 days',
    )
    .replace(/^Hábitos: (.*) días cumplidos$/, 'Habits: $1 scheduled days completed')
    .replace(/^Foco: (.*) pomodoros esta semana$/, 'Focus: $1 pomodoros this week')
    .replace(/^Uso: (.*) días registrados$/, 'Use: $1 recorded days');
}
