import { useActionToast } from '../../../components/action-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { planningRequest, type LoadRange } from '../api';
import { runAction } from '../../../components/run-action';
import { Popover } from '../../../components/Popover';
import { useCardSwipe } from './useCardSwipe';
import { useTriageDrag } from './useTriageDrag';
import { DayRail } from './DayRail';
import { DayAgenda } from './DayAgenda';
import { projectPlan } from './projectPlan';
import { QueueList } from './QueueList';
import { ShortcutFooter } from './ShortcutFooter';
import { TriageHelp } from './TriageHelp';
import { useTriageKeys } from './useTriageKeys';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  MoreHorizontal,
  PanelLeftOpen,
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
import { TaskCardPreview } from './TaskCardPreview';
import { TaskCard } from './TaskCard';
import { DurationChips } from './DurationChips';
import { TimeSelect } from './TimeSelect';
import { MobileActionBar } from './MobileActionBar';
import { MoreMenu } from './MoreMenu';
import { WhenSheet } from './WhenSheet';
import { SummaryView } from './SummaryView';
import '../planning-wt-f.css';
export function TriageFlow() {
  const cache = useQueryClient();
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
  const [queueVisible, setQueueVisible] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcesAnchor = useRef<HTMLButtonElement>(null);
  const [agendaWidth, setAgendaWidth] = useState(320);
  const cardStage = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState(false);
  const queuedReview = useRef(false);
  useEffect(() => {
    if (!busy && queuedReview.current) {
      queuedReview.current = false;
      if (session?.decisions.some((d) => d.action !== 'skip')) state.setReview(true);
    }
  }, [busy, session?.revision]);
  useTriageKeys((event) => {
    if (
      (!when && !help && document.querySelector('[role="dialog"]')) ||
      (event.target instanceof HTMLElement && event.target.closest('[role="separator"]'))
    )
      return false;
    if (busy || swipe.leaving) {
      if (event.key === 'Enter') queuedReview.current = true;
      return [
        'h',
        'm',
        'o',
        'c',
        'n',
        'a',
        'Delete',
        ' ',
        'Enter',
        'ArrowLeft',
        'ArrowRight',
        '1',
        '2',
        '3',
        '4',
      ].includes(event.key);
    }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      runAction(state.undo());
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (key === 'escape') {
      if (help) setHelp(false);
      else if (when) setWhen(false);
      else if (state.review) state.setReview(false);
      else exit();
      return true;
    }
    if (key === '?') {
      setHelp(!help);
      return true;
    }
    if (help || when || document.querySelector('[role="dialog"]')) return false;
    if (key === 'enter') {
      if (state.review) runAction(confirm());
      else if (session?.decisions.some((d) => d.action !== 'skip')) state.setReview(true);
      return true;
    }
    if (event.shiftKey && (key === 'arrowleft' || key === 'arrowright')) {
      const i = load?.days.findIndex((d) => d.date === selected) ?? 0;
      setSelected(
        load?.days[Math.max(0, Math.min(13, i + (key === 'arrowright' ? 1 : -1)))]?.date ??
          selected,
      );
      return true;
    }
    if (state.review) return false;
    if (key === 'arrowleft' || key === 'arrowright') {
      state.navigate(key === 'arrowleft' ? -1 : 1, window.matchMedia('(max-width: 768px)').matches);
      return true;
    }
    const values = [15, 30, 45, 60];
    if (/^[1-4]$/.test(key)) {
      changeDuration(values[Number(key) - 1] ?? 30);
      return true;
    }
    const actions: Record<string, PlanAction> = {
      h: 'today',
      m: 'tomorrow',
      o: 'move',
      c: 'done',
      ' ': 'done',
      n: 'wont_do',
      a: 'someday',
      delete: 'delete',
    };
    const selectedAction = actions[key];
    if (selectedAction) {
      action(selectedAction);
      return true;
    }
    return false;
  });
  useEffect(() => {
    if (card) {
      setDuration(
        chosen?.duration ??
          ((card.duration_minutes ?? 0) >= 5
            ? (card.duration_minutes ?? 30)
            : (load?.settings.default_task_duration ?? 30)),
      );
      setTime(chosen?.time ?? '');
      setTouched(chosen?.duration !== undefined);
    }
  }, [card?.task_id, chosen?.duration, chosen?.time]);
  useEffect(() => {
    if (session && !selected) setSelected(session.local_date);
  }, [session, selected]);
  const customLoad = useQuery({
    queryKey: ['planning-custom-load', selected, load?.time_zone],
    enabled: load !== null && selected !== '' && !load.days.some((d) => d.date === selected),
    queryFn: () =>
      planningRequest<LoadRange>(`/api/v1/planning/load?from=${selected}&days=1`, 'GET'),
  });
  const range =
    load && customLoad.data && !load.days.some((d) => d.date === selected)
      ? { ...load, days: [...load.days, ...customLoad.data.days] }
      : load;
  const projected = range && session ? projectPlan(range, session) : range;
  const drag = useTriageDrag({
    session,
    range: projected,
    duration,
    onDrop: (date, time, id) => {
      setSelected(date);
      runAction(
        state.decide(
          {
            action: 'move',
            date,
            ...(time ? { time } : {}),
            ...(time || touched ? { duration } : {}),
          },
          id,
          true,
        ),
      );
    },
  });
  const swipe = useCardSwipe({
    disabled: busy || drag.active,
    distance: () => (cardStage.current?.clientWidth ?? window.innerWidth) + 12,
    canPrevious: state.previousPending >= 0,
    canNext: state.nextPending >= 0,
    navigate: (delta) => {
      state.navigate(delta, true);
    },
  });
  const day = projected?.days.find((d) => d.date === selected);
  const busyIntervals = [
    ...(day?.events ?? [])
      .filter((e) => !e.is_all_day)
      .map((e) => ({ id: e.id, start: e.starts_at, end: e.ends_at })),
    ...(day?.tasks ?? [])
      .filter((t) => !t.is_all_day && t.start_date && t.id !== card?.task_id)
      .map((t) => ({
        id: t.id,
        start: t.start_date ?? '',
        end: new Date(
          Date.parse(t.start_date ?? '') + (t.duration_minutes ?? 30) * 60000,
        ).toISOString(),
      })),
  ];
  const slots = load
    ? freeSlots({
        date: selected,
        timeZone: load.time_zone,
        duration,
        workDayStart: '00:00',
        workDayEnd: '24:00',
        busy: busyIntervals,
      })
    : [];
  function changeDuration(n: number) {
    setDuration(n);
    setTouched(true);
  }
  function decision(next: PlanAction): Promise<boolean> {
    if (next === 'move') {
      setWhen(true);
      return Promise.resolve(false);
    }
    return state.decide({
      action: next,
      ...(time ? { time } : {}),
      ...(touched || time ? { duration } : {}),
    });
  }
  function action(next: PlanAction) {
    runAction(decision(next));
  }
  async function confirm() {
    if (
      session &&
      !session.decisions.some(
        (d) => d.action !== 'skip' && !session.committed_task_ids?.includes(d.task_id),
      )
    ) {
      await navigate('/today');
      return;
    }
    const operation = await state.apply();
    if (operation) {
      const count = session?.decisions.filter((d) => d.action !== 'skip').length ?? 0;
      useActionToast.getState().show(`${m.saved} · ${String(count)} ${m.changes}`, () => {
        runAction(
          planningRequest(`/api/v1/planning/operations/${operation}/revert`, 'POST').then(() =>
            cache.invalidateQueries(),
          ),
        );
      });
      await navigate('/today');
    }
  }

  const exit = () => {
    runAction(Promise.resolve(navigate('/today')));
  };
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
  const previousCard = session.cards[state.previousPending];
  const nextCard = session.cards[state.nextPending];
  return (
    <section className={`sp-page plan-triage ${drag.active ? 'is-dragging' : ''}`} aria-busy={busy}>
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
            disabled={!state.history.length || busy || swipe.leaving}
            onClick={() => {
              runAction(state.undo());
            }}
          >
            <Undo2 size={16} />
            {m.undo}
          </Button>
          <Button variant="ghost" onClick={exit}>
            {m.later}
          </Button>
          <Button
            ref={sourcesAnchor}
            variant="ghost"
            aria-label={m.sources}
            aria-expanded={sourcesOpen}
            onClick={() => {
              setSourcesOpen(!sourcesOpen);
            }}
          >
            <MoreHorizontal size={18} />
          </Button>
          <Popover
            open={sourcesOpen}
            anchor={sourcesAnchor}
            mobileSheet
            label={m.sources}
            closeLabel={m.close}
            onClose={() => {
              setSourcesOpen(false);
            }}
            className="popover popover-menu"
          >
            <div className="plan-source-options">
              {(['inbox', 'undated'] as const).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={state.sources[key]}
                    disabled={busy}
                    onChange={() => {
                      runAction(state.addSource(key));
                    }}
                  />
                  {m[key]}
                </label>
              ))}
            </div>
          </Popover>
          <Button
            variant="primary"
            disabled={!count || busy}
            onClick={() => {
              state.setReview(true);
            }}
          >
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
        <Button
          variant="ghost"
          disabled={state.previousPending < 0 || busy || swipe.leaving}
          onClick={() => {
            swipe.navigate(-1);
          }}
        >
          <ChevronLeft size={17} />
          {m.back}
        </Button>
        <Button
          variant="icon"
          aria-label={m.undo}
          disabled={!state.history.length || busy || swipe.leaving}
          onClick={() => {
            runAction(state.undo());
          }}
        >
          <Undo2 size={19} />
        </Button>
      </header>
      {state.error ? (
        <ErrorState
          title={m.failed}
          detail={state.error.includes('plan_conflict') ? m.conflict : m.kept}
          retryLabel={m.retry}
          onRetry={() => {
            runAction(confirm());
          }}
        />
      ) : null}
      <div className="plan-live" aria-live="polite">
        {card
          ? `${m.current} ${String(state.index + 1)} ${m.of} ${String(session.cards.length)}: ${card.title}`
          : ''}
      </div>
      {state.review ? (
        <SummaryView
          session={session}
          onBack={() => {
            state.setReview(false);
          }}
          onConfirm={() => {
            runAction(confirm());
          }}
          busy={busy}
          {...(projected?.days[0] ? { load: projected.days[0] } : {})}
        />
      ) : !card ? (
        <EmptyState
          title={m.empty}
          body=""
          action={
            <Button
              onClick={() => {
                state.planTomorrow();
              }}
            >
              {m.nextDay}
            </Button>
          }
        />
      ) : (
        <div
          className={`sp-cols ${queueVisible ? '' : 'is-queue-hidden'}`}
          style={{ '--plan-agenda-width': `${String(agendaWidth)}px` } as CSSProperties}
        >
          {queueVisible ? (
            <QueueList
              session={session}
              index={state.index}
              onSelect={state.setIndex}
              onDrag={drag.start}
              onCollapse={() => {
                setQueueVisible(false);
              }}
            />
          ) : (
            <div className="plan-queue-collapsed plan-desktop-only">
              <Button
                variant="ghost"
                aria-label={m.showQueue}
                aria-expanded={false}
                onClick={() => {
                  setQueueVisible(true);
                }}
              >
                <PanelLeftOpen size={18} />
              </Button>
            </div>
          )}
          <div className="plan-card-stage" ref={cardStage} {...swipe.bind}>
            <div
              className="plan-card-motion"
              key={card.task_id}
              data-moving={swipe.moving || swipe.leaving}
              data-dragging={swipe.moving}
              data-direction={swipe.direction}
              style={{ '--plan-swipe-x': `${String(swipe.offset)}px` } as CSSProperties}
            >
              {previousCard ? (
                <TaskCardPreview
                  card={previousCard}
                  side="previous"
                  date={session.local_date}
                  zone={session.time_zone}
                />
              ) : null}
              <TaskCard
                card={card}
                date={session.local_date}
                zone={session.time_zone}
                duration={duration}
                onDuration={() => {
                  setWhen(true);
                }}
                drag={drag.start(card.task_id)}
                onEdit={state.editCard}
              >
                {chosen ? (
                  <p className="plan-prior-choice">
                    {m[chosen.action]}
                    {chosen.date ? ` · ${chosen.date}` : ''}
                    {chosen.time ? `, ${chosen.time}` : ''}
                  </p>
                ) : null}
                <div className="plan-mobile-only">
                  <MoreMenu onAction={action} busy={busy} />
                </div>
                <div className="plan-desktop-controls">
                  <div className="plan-time-controls">
                    <DurationChips value={duration} onChange={changeDuration} />
                    <TimeSelect value={time} slots={slots} onChange={setTime} />
                  </div>
                  <div className="plan-action-row">
                    <div className="sp-primary">
                      {(
                        [
                          ['today', Sun, 'H'],
                          ['tomorrow', ArrowRight, 'M'],
                          ['move', CalendarDays, 'O'],
                        ] as const
                      ).map(([a, Icon, key]) => (
                        <Button
                          key={a}
                          disabled={busy}
                          {...(a === 'move' ? { ref: anchor } : {})}
                          onClick={() => {
                            action(a);
                          }}
                        >
                          <Icon size={17} />
                          {m[a]}
                          <Kbd>{key}</Kbd>
                        </Button>
                      ))}
                    </div>
                    <div className="sp-secondary">
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          action('done');
                        }}
                      >
                        <Check size={16} />
                        {m.done}
                        <Kbd>C</Kbd>
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          action('wont_do');
                        }}
                      >
                        <Ban size={16} />
                        {m.wont_do}
                        <Kbd>N</Kbd>
                      </Button>
                      <MoreMenu onAction={action} busy={busy} />
                    </div>
                  </div>
                </div>
              </TaskCard>
              {nextCard ? (
                <TaskCardPreview
                  card={nextCard}
                  side="next"
                  date={session.local_date}
                  zone={session.time_zone}
                />
              ) : null}
            </div>
          </div>
          <aside className="plan-day-sidebar">
            <div
              className="plan-agenda-resizer"
              role="separator"
              tabIndex={0}
              aria-label={m.resizeAgenda}
              aria-orientation="vertical"
              aria-valuemin={280}
              aria-valuemax={520}
              aria-valuenow={agendaWidth}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  e.stopPropagation();
                  setAgendaWidth((w) =>
                    Math.max(280, Math.min(520, w + (e.key === 'ArrowLeft' ? 20 : -20))),
                  );
                }
              }}
              onPointerDown={(e) => {
                resize.current = { x: e.clientX, width: agendaWidth };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (resize.current)
                  setAgendaWidth(
                    Math.max(
                      280,
                      Math.min(520, resize.current.width + resize.current.x - e.clientX),
                    ),
                  );
              }}
              onPointerUp={() => {
                resize.current = null;
              }}
              onPointerCancel={() => {
                resize.current = null;
              }}
            />
            <DayRail
              days={projected?.days.slice(0, 14) ?? []}
              dropDate={drag.ghost?.date ?? null}
              selected={selected}
              onSelect={(date) => {
                setSelected(date);
                setTime('');
              }}
            />
            {day && projected ? (
              <DayAgenda
                day={day}
                range={projected}
                ghost={drag.ghost?.date === selected && drag.ghost.time ? drag.ghost : null}
              />
            ) : null}
          </aside>
        </div>
      )}
      {!state.review && card ? (
        <>
          <MobileActionBar
            busy={busy || swipe.leaving}
            onAction={action}
            count={count}
            onReview={() => {
              state.setReview(true);
            }}
          />
        </>
      ) : null}
      {when ? (
        <WhenSheet
          busy={busy}
          error={state.error}
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
          onClose={() => {
            setWhen(false);
          }}
          onSomeday={() => {
            runAction(
              decision('someday').then((saved) => {
                if (saved) setWhen(false);
              }),
            );
          }}
          onConfirm={() => {
            const choice = {
              action: 'move' as const,
              date: selected,
              ...(time ? { time } : {}),
              ...(touched || time ? { duration } : {}),
            };
            const patch = effectOf(choice, session.local_date, session.time_zone);
            if (patch && time && !slots.includes(time)) return;
            runAction(
              state.decide(choice, card?.task_id, true).then((saved) => {
                if (saved) setWhen(false);
              }),
            );
          }}
          anchor={anchor}
          days={
            <DayRail
              days={projected?.days.slice(0, 14) ?? []}
              dropDate={drag.ghost?.date ?? null}
              selected={selected}
              onSelect={(date) => {
                setSelected(date);
                setTime('');
              }}
            />
          }
        />
      ) : null}
      {drag.preview ? (
        <div
          className="plan-drag-preview"
          aria-hidden="true"
          style={{
            left: Math.min(
              drag.preview.x + 18,
              window.innerWidth - Math.min(288, window.innerWidth / 2) - 12,
            ),
            top: Math.min(drag.preview.y + 16, window.innerHeight - 90),
          }}
        >
          <span>
            {drag.ghost?.time ? `${drag.ghost.time} · ` : ''}
            {duration} min
          </span>
          <strong>{drag.preview.title}</strong>
        </div>
      ) : null}
      {drag.active ? (
        <div className="plan-touch-destinations">
          <DayRail
            days={projected?.days.slice(0, 14) ?? []}
            dropDate={drag.ghost?.date ?? null}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      ) : null}
      {!state.review ? <ShortcutFooter /> : null}
      {help ? (
        <TriageHelp
          onClose={() => {
            setHelp(false);
          }}
        />
      ) : null}
      <UndoToastStack
        durationMs={5000}
        items={state.notice ? [{ id: state.notice, title: `${title} → ${destination}` }] : []}
        message="{name}"
        undoLabel={m.undo}
        onUndo={() => {
          runAction(state.undo());
        }}
        onExpire={() => {
          state.setNotice('');
        }}
      />
    </section>
  );
}
