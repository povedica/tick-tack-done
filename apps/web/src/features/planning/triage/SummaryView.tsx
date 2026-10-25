import { useState } from 'react';
import { pluralMessage } from '../../../i18n/plural';
import { loadPhrase } from './projectPlan';
import type { LoadDay } from '../api';
import { Button, Kbd } from '../../../components/ui';
import { actionDate } from '@reflexionia/domain';
import type { PlanSession } from '../api';
import { useWtFMessages } from '../i18n-wt-f';
import { useAppLocale } from '../../../i18n/locale';
export function SummaryView({
  session,
  onBack,
  onConfirm,
  busy,
  load,
}: {
  readonly session: PlanSession;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
  readonly load?: LoadDay;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const [expanded, setExpanded] = useState(false);
  const count = session.decisions.filter((d) => d.action !== 'skip').length;
  const today = session.decisions
    .filter((d) => actionDate(d, session.local_date) === session.local_date || d.action === 'done')
    .sort(
      (a, b) =>
        (a.action === 'done' ? 1 : 0) - (b.action === 'done' ? 1 : 0) ||
        (a.time ?? '99').localeCompare(b.time ?? '99'),
    );
  const other = session.decisions.filter((d) => !today.includes(d) && d.action !== 'skip');
  const groups = new Map<string, typeof other>();
  for (const d of other) {
    const k = actionDate(d, session.local_date) ?? m[d.action];
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const title = (id: string) => session.cards.find((c) => c.task_id === id)?.title ?? '';
  return (
    <section className="sp-summary">
      <h1 className="plan-desktop-only">{m.summary}</h1>
      <h1 className="plan-mobile-only">{m.mobileSummary}</h1>
      <p className="plan-desktop-only">{m.unchanged}</p>
      <p className="plan-mobile-only">
        {pluralMessage(locale, count, { one: m.decidedOne, other: m.decidedMany })}
      </p>
      <div className="sp-sum-cols sp-sum">
        <section className="sp-sum-col">
          <h2>{m.today}</h2>
          {load ? (
            <p className={`sp-load is-${load.status === 'overload' ? 'over' : load.status}`}>
              <i />
              {loadPhrase(load, m)}
            </p>
          ) : null}
          <ul className="sp-sum-list">
            {today.map((d) => (
              <li
                key={d.task_id}
                className={`${d.action === 'done' ? 'is-done' : ''} ${!expanded && today.indexOf(d) > 3 ? 'plan-summary-extra' : ''}`}
              >
                <span>{d.time ?? '—'}</span>
                {title(d.task_id)}
                {d.action === 'done' ? ` · ${m.done}` : ''}
              </li>
            ))}
          </ul>
          {today.length > 4 && !expanded ? (
            <button
              type="button"
              className="sp-read-more plan-mobile-only"
              onClick={() => {
                setExpanded(true);
              }}
            >
              +{today.length - 4} {m.extra}
            </button>
          ) : null}
        </section>
        <section className="sp-sum-col">
          <h2 className="plan-desktop-only">{m.others}</h2>
          <h2 className="plan-mobile-only">{m.rest}</h2>
          {[...groups].map(([key, items]) => (
            <section key={key} className="sp-sum-group">
              <h3>
                {/^\d{4}-/.test(key)
                  ? new Intl.DateTimeFormat(locale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    }).format(new Date(`${key}T12:00Z`))
                  : key}
              </h3>
              <span className="plan-mobile-only">
                {items.length} {m.tasks}
              </span>
              <ul className="plan-desktop-only sp-sum-list">
                {items.map((d) => (
                  <li key={d.task_id}>
                    {d.time ?? '—'} · {title(d.task_id)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      </div>
      <div className="sp-sum-actions">
        <Button onClick={onBack}>
          <span className="plan-desktop-only">
            {m.return} <Kbd>Esc</Kbd>
          </span>
          <span className="plan-mobile-only">{m.returnReview}</span>
        </Button>
        <Button
          variant="primary"
          disabled={busy || !session.decisions.some((d) => d.action !== 'skip')}
          onClick={onConfirm}
        >
          {m.confirm}
          <Kbd>↵</Kbd>
        </Button>
      </div>
    </section>
  );
}
