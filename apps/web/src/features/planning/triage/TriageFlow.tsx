import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  MoreHorizontal,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { freeSlots, actionDate, effectOf, type PlanAction } from '@reflexionia/domain';
import { Button, EmptyState, ErrorState, Kbd, SkeletonRows } from '../../../components/ui';
import { UndoToastStack } from '../../../components/UndoToast';
import { useAppLocale } from '../../../i18n/locale';
import { useWtFMessages } from '../i18n-wt-f';
import { useTriageSession } from './useTriageSession';
import { TaskCard } from './TaskCard';
import { DurationChips } from './DurationChips';
import { TimeSelect } from './TimeSelect';
import { MobileActionBar } from './MobileActionBar';
import { MoreMenu } from './MoreMenu';
import { WhenSheet } from './WhenSheet';
import { SummaryView } from './SummaryView';
import '../planning-wt-f.css';
export function TriageFlow() {
  const state = useTriageSession(),
    m = useWtFMessages(),
    locale = useAppLocale(),
    navigate = useNavigate();
  const { session, load, card, chosen, busy } = state;
  const [duration, setDuration] = useState(30),
    [touched, setTouched] = useState(false),
    [time, setTime] = useState(''),
    [when, setWhen] = useState(false),
    [selected, setSelected] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (card) {
      setDuration(chosen?.duration ?? card.duration_minutes ?? 30);
      setTime(chosen?.time ?? '');
      setTouched(chosen?.duration !== undefined);
    }
  }, [card?.task_id, chosen?.duration, chosen?.time]);
  useEffect(() => {
    if (session && !selected) setSelected(session.local_date);
  }, [session, selected]);
  const day = load?.days.find((d) => d.date === selected);
  const busyIntervals = [
    ...(day?.events ?? [])
      .filter((e) => !e.is_all_day)
      .map((e) => ({ id: e.id, start: e.starts_at, end: e.ends_at })),
    ...(day?.tasks ?? [])
      .filter((t) => !t.is_all_day && t.start_date && t.id !== card?.task_id)
      .map((t) => ({
        id: t.id,
        start: t.start_date!,
        end: new Date(Date.parse(t.start_date!) + (t.duration_minutes ?? 30) * 60000).toISOString(),
      })),
  ];
  const slots = load
    ? freeSlots({
        date: selected,
        timeZone: load.time_zone,
        duration,
        workDayStart: day?.available_minutes === null ? null : load.settings.work_day_start,
        workDayEnd: load.settings.work_day_end,
        eveningStart: load.settings.evening_start,
        busy: busyIntervals,
      })
    : [];
  function changeDuration(n: number) {
    setDuration(n);
    setTouched(true);
  }
  function action(action: PlanAction) {
    if (action === 'move') {
      setWhen(true);
      return;
    }
    void state.decide({
      action,
      ...(time ? { time } : {}),
      ...(touched || time ? { duration } : {}),
    });
  }
  async function confirm() {
    const operation = await state.apply();
    if (operation)
      navigate('/today', {
        state: {
          planUndo: {
            id: operation,
            count: session?.decisions.filter((d) => d.action !== 'skip').length ?? 0,
          },
        },
      });
  }
  const exit = () => navigate('/today');
  if (!session || !load)
    return (
      <section className="screen-page plan-loading">
        {state.error ? (
          <ErrorState title={m.loadingFailed} retryLabel={m.retry} onRetry={state.retry} />
        ) : (
          <>
            <p role="status">{m.preparing}</p>
            <SkeletonRows />
          </>
        )}
      </section>
    );
  const count = session.decisions.filter((d) => d.action !== 'skip').length;
  const noticeChoice = session.decisions.find((d) => d.task_id === state.notice);
  const noticeDate = noticeChoice ? actionDate(noticeChoice, session.local_date) : null;
  const destination = noticeDate
    ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${noticeDate}T12:00Z`),
      ) + (noticeChoice?.time ? `, ${noticeChoice.time}` : '')
    : noticeChoice
      ? m[noticeChoice.action]
      : '';
  const title = session.cards.find((c) => c.task_id === state.notice)?.title ?? '';
  return (
    <section className="sp-page plan-triage" aria-busy={busy}>
      <header className="sp-head plan-desktop-only">
        <div>
          <h1>{m.title}</h1>
          <p>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
              new Date(`${session.local_date}T12:00Z`),
            )}
          </p>
        </div>
        <div className="sp-head-act">
          <Button
            variant="ghost"
            disabled={!state.history.length || busy}
            onClick={() => void state.undo()}
          >
            <Undo2 size={16} />
            {m.undo}
          </Button>
          <Button variant="ghost" onClick={exit}>
            {m.later}
          </Button>
          <details className="plan-more">
            <summary aria-label={m.sources}>
              <MoreHorizontal size={18} />
            </summary>
            <div>
              {(['inbox', 'undated'] as const).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={state.sources[key]}
                    disabled={busy}
                    onChange={() => void state.addSource(key)}
                  />
                  {m[key]}
                </label>
              ))}
            </div>
          </details>
          <Button variant="primary" disabled={!count || busy} onClick={() => state.setReview(true)}>
            {m.review} ({count})
          </Button>
        </div>
      </header>
      <header className="plan-mobile-head">
        <Button variant="icon" aria-label={m.close} onClick={exit}>
          <X size={19} />
        </Button>
        <span>
          {state.index + 1} / {session.cards.length}
        </span>
        <Button variant="ghost" disabled={state.index === 0} onClick={() => state.navigate(-1)}>
          <ChevronLeft size={17} />
          {m.back}
        </Button>
        <Button
          variant="icon"
          aria-label={m.undo}
          disabled={!state.history.length || busy}
          onClick={() => void state.undo()}
        >
          <Undo2 size={19} />
        </Button>
      </header>
      {state.error ? (
        <ErrorState
          title={m.failed}
          detail={m.kept}
          retryLabel={m.retry}
          onRetry={() => void confirm()}
        />
      ) : null}
      <div className="plan-live" aria-live="polite">
        {card
          ? `${m.current} ${state.index + 1} ${m.of} ${session.cards.length}: ${card.title}`
          : ''}
      </div>
      {state.review ? (
        <SummaryView
          session={session}
          onBack={() => state.setReview(false)}
          onConfirm={() => void confirm()}
          busy={busy}
        />
      ) : !card ? (
        <EmptyState
          title={m.empty}
          body=""
          action={
            <Button
              onClick={() => {
                setSelected(session.local_date);
                setWhen(true);
              }}
            >
              {m.nextDay}
            </Button>
          }
        />
      ) : (
        <div className="sp-cols">
          <div
            className="plan-card-stage"
            onTouchStart={(e) => {
              const p = e.touches[0];
              if (p) touch.current = { x: p.clientX, y: p.clientY };
            }}
            onTouchEnd={(e) => {
              const p = e.changedTouches[0],
                start = touch.current;
              touch.current = null;
              if (
                p &&
                start &&
                Math.abs(p.clientY - start.y) < 60 &&
                Math.abs(p.clientX - start.x) > 80
              )
                state.navigate(p.clientX > start.x ? -1 : 1);
            }}
          >
            <TaskCard
              card={card}
              date={session.local_date}
              duration={duration}
              onDuration={() => setWhen(true)}
            >
              <MoreMenu onAction={action} busy={busy} />
              <div className="plan-desktop-controls">
                <div className="plan-time-controls">
                  <DurationChips value={duration} onChange={changeDuration} />
                  <TimeSelect value={time} slots={slots} onChange={setTime} />
                </div>
                <div className="sp-primary">
                  {(
                    [
                      ['today', Sun, 'H'],
                      ['tomorrow', ArrowRight, 'M'],
                      ['move', CalendarDays, 'O'],
                    ] as const
                  ).map(([a, Icon, key]) => (
                    <Button key={a} disabled={busy} onClick={() => action(a)}>
                      <Icon size={17} />
                      {m[a]}
                      <Kbd>{key}</Kbd>
                    </Button>
                  ))}
                </div>
                <div className="sp-secondary">
                  <Button variant="ghost" disabled={busy} onClick={() => action('done')}>
                    <Check size={16} />
                    {m.done}
                    <Kbd>C</Kbd>
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => action('wont_do')}>
                    <Ban size={16} />
                    {m.wont_do}
                    <Kbd>N</Kbd>
                  </Button>
                </div>
              </div>
            </TaskCard>
            {session.cards[state.index + 1] ? (
              <div className="plan-next-peek" aria-hidden="true">
                {session.cards[state.index + 1]?.title}
              </div>
            ) : null}
          </div>
        </div>
      )}
      {!state.review && card ? (
        <>
          <MobileActionBar busy={busy} onAction={action} />
          <Button
            className="plan-mobile-review"
            disabled={!count}
            onClick={() => state.setReview(true)}
          >
            {m.review} ({count})
          </Button>
        </>
      ) : null}
      {when ? (
        <WhenSheet
          date={selected}
          time={time}
          duration={duration}
          slots={slots}
          onDate={(d) => {
            setSelected(d);
            setTime('');
          }}
          onTime={setTime}
          onDuration={changeDuration}
          onClose={() => setWhen(false)}
          onConfirm={() => {
            const choice = {
              action: 'move' as const,
              date: selected,
              ...(time ? { time } : {}),
              ...(touched || time ? { duration } : {}),
            };
            const patch = effectOf(choice, session.local_date, session.time_zone);
            if (patch && time && !slots.includes(time)) return;
            setWhen(false);
            void state.decide(choice);
          }}
          days={
            <div className="plan-simple-days">
              {load.days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={selected === d.date}
                  onClick={() => {
                    setSelected(d.date);
                    setTime('');
                  }}
                >
                  {new Intl.DateTimeFormat(locale, {
                    weekday: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${d.date}T12:00Z`))}
                </button>
              ))}
            </div>
          }
        />
      ) : null}
      <UndoToastStack
        durationMs={5000}
        items={state.notice ? [{ id: state.notice, title: `${title} → ${destination}` }] : []}
        message="{name}"
        undoLabel={m.undo}
        onUndo={() => void state.undo()}
        onExpire={() => state.setNotice('')}
      />
    </section>
  );
}
