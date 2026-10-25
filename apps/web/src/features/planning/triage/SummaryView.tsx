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
}: {
  readonly session: PlanSession;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const today = session.decisions
    .filter((d) => actionDate(d, session.local_date) === session.local_date || d.action === 'done')
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
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
      <p>{m.unchanged}</p>
      <div className="sp-sum-cols">
        <section>
          <h2>{m.today}</h2>
          <ul>
            {today.map((d) => (
              <li key={d.task_id} className={d.action === 'done' ? 'is-done' : ''}>
                <span>{d.time ?? '—'}</span>
                {title(d.task_id)}
                {d.action === 'done' ? ` · ${m.done}` : ''}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>{m.others}</h2>
          {[...groups].map(([key, items]) => (
            <section key={key}>
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
              <ul>
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
          {m.return}
          <Kbd>Esc</Kbd>
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
