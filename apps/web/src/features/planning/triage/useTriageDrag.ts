import { useEffect, useRef, useState, type PointerEventHandler } from 'react';
import { freeSlots, snap15 } from '@reflexionia/domain';
import type { LoadRange, PlanSession } from '../api';
import { clockMinutes, minuteClock } from './DayAgenda';
interface Ghost {
  date: string;
  time: string;
  duration: number;
  title: string;
  taskId: string;
  conflict: string | null;
}
export function useTriageDrag(input: {
  session: PlanSession | null;
  range: LoadRange | null;
  duration: number;
  onDrop: (date: string, time: string | undefined, id: string) => void;
}) {
  const latest = useRef(input);
  latest.current = input;
  const pending = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
    touch: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; title: string } | null>(null);
  const [active, setActive] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const target = useRef<Ghost | null>(null);
  const start =
    (id: string): PointerEventHandler<HTMLElement> =>
    (event) => {
      if (
        event.button !== 0 ||
        latest.current.session?.decisions.some((d) => d.task_id === id && d.action !== 'skip')
      )
        return;
      if (
        (event.target as HTMLElement).closest(
          'a,input,select,textarea,button:not(.sp-grip):not(.sp-q)',
        )
      )
        return;
      pending.current = {
        id,
        x: event.clientX,
        y: event.clientY,
        active: false,
        touch: event.pointerType === 'touch',
        timer: null,
      };
      if (event.pointerType === 'touch')
        pending.current.timer = setTimeout(() => {
          if (pending.current) {
            pending.current.active = true;
            setActive(true);
          }
        }, 300);
    };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const distance = Math.hypot(event.clientX - p.x, event.clientY - p.y);
      if (!p.active) {
        if (p.touch) {
          if (distance > 8) {
            if (p.timer) clearTimeout(p.timer);
            pending.current = null;
          }
          return;
        }
        if (distance < 5) return;
        p.active = true;
        setActive(true);
      }
      event.preventDefault();
      const { range, session, duration } = latest.current;
      const card = session?.cards.find((c) => c.task_id === p.id);
      if (!range || !card) return;
      setPreview({ x: event.clientX, y: event.clientY, title: card.title });
      const sidebar = document.querySelector('.plan-agenda-scroll');
      if (sidebar) {
        const box = sidebar.getBoundingClientRect();
        if (event.clientX >= box.left) {
          if (event.clientY > box.bottom - 20) sidebar.scrollTop += 14;
          else if (event.clientY < box.top + 20) sidebar.scrollTop -= 14;
        }
      }
      const node = document.elementFromPoint(event.clientX, event.clientY);
      const chip = node?.closest<HTMLElement>('[data-plan-day]');
      const agenda = node?.closest<HTMLElement>('[data-plan-agenda]');
      const date = chip?.dataset.planDay ?? agenda?.dataset.planAgenda;
      if (!date) {
        target.current = null;
        setGhost(null);
        return;
      }
      let time = '',
        conflict: string | null = null;
      const day = range.days.find((d) => d.date === date);
      if (agenda && day) {
        const box = agenda.getBoundingClientRect();
        const lower = Number(agenda.dataset.planStart),
          upper = Number(agenda.dataset.planEnd);
        const minute = Math.max(
          lower,
          Math.min(
            upper - duration,
            snap15(lower + ((event.clientY - box.top) / box.height) * (upper - lower)),
          ),
        );
        time = minuteClock(minute);
        const busy = [
          ...day.events
            .filter((e) => !e.is_all_day)
            .map((e) => ({ id: e.id, start: e.starts_at, end: e.ends_at, title: e.title })),
          ...day.tasks
            .filter((t) => t.id !== p.id && !t.is_all_day && t.start_date)
            .map((t) => ({
              id: t.id,
              start: t.start_date ?? '',
              end: new Date(
                Date.parse(t.start_date ?? '') + (t.duration_minutes ?? 30) * 60000,
              ).toISOString(),
              title: t.title,
            })),
        ];
        const slots = freeSlots({
          date,
          timeZone: range.time_zone,
          duration,
          workDayStart: '00:00',
          workDayEnd: '24:00',
          busy,
        });
        if (!slots.includes(time))
          conflict =
            busy.find((b) => {
              const label = new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: range.time_zone,
              }).format(new Date(b.start));
              const end = new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: range.time_zone,
              }).format(new Date(b.end));
              return minute < clockMinutes(end) && minute + duration > clockMinutes(label);
            })?.title ?? '—';
      }
      const next = { date, time, duration, title: card.title, taskId: p.id, conflict };
      target.current = next;
      setGhost(next);
    };
    const end = () => {
      const p = pending.current;
      if (p?.timer) clearTimeout(p.timer);
      if (p?.active) {
        const choice = target.current;
        if (choice && !choice.conflict)
          latest.current.onDrop(choice.date, choice.time || undefined, choice.taskId);
        const stop = (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
        };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', stop, true);
        }, 0);
      }
      pending.current = null;
      target.current = null;
      setGhost(null);
      setActive(false);
      setPreview(null);
    };
    const cancel = () => {
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      pending.current = null;
      target.current = null;
      setGhost(null);
      setActive(false);
      setPreview(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);
  return { start, ghost, active, preview };
}
