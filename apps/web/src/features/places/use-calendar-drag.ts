import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  calendarAxisMinute,
  calendarAxisTarget,
  calendarDragPatch,
  DRAG_SNAP_MINUTES,
  type CalendarDragTarget,
} from '@reflexionia/domain';
import type { Task, TaskPatch } from '@reflexionia/sdk';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { calendarDay, shiftDayKey } from '../today/groups';
import { HOUR_PX, minutesInZone } from './hour';
import type { CalendarTaskChange } from './use-calendar-task-change';

interface Session {
  task: Task;
  mode: 'move' | 'resize';
  x: number;
  y: number;
  active: boolean;
  timer: number;
  node: HTMLElement;
  offset: number;
  target: CalendarDragTarget | null;
  patch: TaskPatch | null;
  keyboard: boolean;
}
export function useCalendarDrag(
  root: RefObject<HTMLElement | null>,
  zone: string,
  onChange?: CalendarTaskChange,
) {
  const messages = useMessages();
  const locale = useAppLocale();
  const helpId = useId();
  const session = useRef<Session | null>(null);
  const suppress = useRef(0);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const [preview, setPreview] = useState<{
    taskId: string;
    patch: TaskPatch;
    target: CalendarDragTarget;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const startDay = (task: Task) => calendarDay(task.start_date ?? task.due_date ?? '', zone);
  const startMinute = (task: Task) =>
    task.is_all_day ? 0 : minutesInZone(task.start_date ?? task.due_date ?? '', zone);
  const publish = (drag: Session, target: CalendarDragTarget) => {
    if (JSON.stringify(drag.target) === JSON.stringify(target)) return;
    const patch = calendarDragPatch(drag.task, target, zone);
    root.current?.querySelectorAll('[data-calendar-drag-over]').forEach((node) => {
      node.removeAttribute('data-calendar-drag-over');
    });
    const kind = target.preserveClock ? 'day' : target.allDay ? 'allday' : 'hour';
    root.current
      ?.querySelector<HTMLElement>(
        `[data-calendar-drop-day="${target.day}"][data-calendar-drop-kind="${kind}"]`,
      )
      ?.setAttribute('data-calendar-drag-over', 'true');
    drag.target = target;
    drag.patch = patch;
    setPreview({ taskId: drag.task.id, patch, target });
    const when = patch.start_date ?? patch.due_date;
    setAnnouncement(
      when
        ? new Intl.DateTimeFormat(locale, {
            timeZone: zone,
            dateStyle: 'medium',
            ...(patch.is_all_day ? {} : { timeStyle: 'short' }),
          }).format(new Date(when))
        : '',
    );
  };
  const finish = (commit: boolean) => {
    const drag = session.current;
    if (!drag) return;
    window.clearTimeout(drag.timer);
    if (drag.active) suppress.current = Date.now() + 500;
    session.current = null;
    setPreview(null);
    root.current?.querySelectorAll('[data-calendar-drag-over]').forEach((node) => {
      node.removeAttribute('data-calendar-drag-over');
    });
    if (commit && drag.active && drag.patch) callback.current?.(drag.task, drag.patch);
    if (!commit) setAnnouncement(messages.calendarDragCancelled);
  };
  useEffect(() => {
    let frame = 0;
    let lastPoint: { x: number; y: number; altKey: boolean } | null = null;
    const update = (point: { x: number; y: number; altKey: boolean }) => {
      const drag = session.current;
      if (!drag?.active) return;
      root.current?.querySelectorAll('[data-calendar-drag-over]').forEach((node) => {
        node.removeAttribute('data-calendar-drag-over');
      });
      const hit = document
        .elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>('[data-calendar-drop-day]');
      if (!hit || !root.current?.contains(hit)) {
        drag.patch = null;
        drag.target = null;
        setPreview(null);
        return;
      }
      const day = hit.dataset.calendarDropDay ?? '';
      const kind = hit.dataset.calendarDropKind;
      const step = point.altKey ? 5 : DRAG_SNAP_MINUTES;
      if (drag.mode === 'resize' && (kind !== 'hour' || day !== startDay(drag.task))) {
        drag.patch = null;
        drag.target = null;
        setPreview(null);
        return;
      }
      const repeated = root.current.dataset.calendarRepeatedHour;
      const repeatHour = repeated === undefined ? null : Number(repeated);
      const raw = ((point.y - hit.getBoundingClientRect().top) * 60) / HOUR_PX;
      const minute = Math.max(
        0,
        Math.min(
          (repeatHour === null ? 1440 : 1500) - step,
          Math.round((raw - drag.offset) / step) * step,
        ),
      );
      const target: CalendarDragTarget =
        kind === 'day'
          ? { day, preserveClock: true }
          : kind === 'allday'
            ? { day, allDay: true }
            : drag.mode === 'resize'
              ? {
                  day,
                  minute: startMinute(drag.task),
                  duration: Math.max(
                    15,
                    Math.round(raw / step) * step -
                      calendarAxisMinute(
                        drag.task.start_date ?? drag.task.due_date ?? '',
                        zone,
                        repeatHour,
                      ),
                  ),
                  laterOccurrence:
                    calendarAxisMinute(
                      drag.task.start_date ?? drag.task.due_date ?? '',
                      zone,
                      repeatHour,
                    ) !== startMinute(drag.task) &&
                    startMinute(drag.task) < ((repeatHour ?? -1) + 1) * 60,
                }
              : calendarAxisTarget(day, minute, repeatHour, zone);
      hit.dataset.calendarDragOver = 'true';
      publish(drag, target);
    };
    const scroll = () => {
      const drag = session.current;
      if (!drag?.active || drag.keyboard) {
        frame = 0;
        return;
      }
      const board = root.current;
      if (board && lastPoint && board.classList.contains('hour-board')) {
        const box = board.getBoundingClientRect();
        const head = board.querySelector('.hour-allday')?.getBoundingClientRect().bottom ?? box.top;
        if (lastPoint.y > head && lastPoint.y < head + 48) board.scrollTop -= 8;
        else if (lastPoint.y > box.bottom - 48 && lastPoint.y < box.bottom) board.scrollTop += 8;
        update(lastPoint);
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (event: PointerEvent) => {
      const drag = session.current;
      if (!drag || drag.keyboard) return;
      const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
      if (!drag.active && distance >= 4) {
        if (event.pointerType === 'touch') {
          finish(false);
          return;
        }
        drag.active = true;
      }
      if (!drag.active) return;
      event.preventDefault();
      lastPoint = { x: event.clientX, y: event.clientY, altKey: event.altKey };
      update(lastPoint);
      if (!frame) frame = requestAnimationFrame(scroll);
    };
    const up = (event: PointerEvent) => {
      if (!session.current || session.current.keyboard) return;
      if (session.current.active)
        update({ x: event.clientX, y: event.clientY, altKey: event.altKey });
      finish(true);
    };
    const deselect = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-calendar-task]'))
        setSelectedTask(null);
    };
    document.addEventListener('pointerdown', deselect);
    const cancel = () => {
      finish(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedTask(null);
      if (session.current && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      }
    };
    const touch = (event: TouchEvent) => {
      if (session.current?.active) event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      if (
        Date.now() < suppress.current &&
        event.target instanceof Node &&
        root.current?.contains(event.target)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key, true);
    document.addEventListener('touchmove', touch, { passive: false });
    document.addEventListener('click', click, true);
    return () => {
      cancelAnimationFrame(frame);
      if (session.current) window.clearTimeout(session.current.timer);
      session.current = null;
      document.removeEventListener('pointerdown', deselect);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('touchmove', touch);
      document.removeEventListener('click', click, true);
    };
  }, [zone]);
  const bindTask = (task: Task, month = false) => ({
    'data-calendar-task': task.id,
    'data-calendar-dragging':
      preview?.taskId === task.id || selectedTask === task.id ? 'true' : undefined,
    'aria-roledescription': messages.calendarDraggableRole,
    'aria-describedby': helpId,
    tabIndex: task.status === 'active' ? 0 : undefined,
    onDragStart: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !callback.current ||
        task.status !== 'active' ||
        task.kind !== 'task' ||
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest('input, .task-check-hit, button:not([data-calendar-resize])'))
      )
        return;
      event.stopPropagation();
      const mode =
        event.target instanceof Element && event.target.closest('[data-calendar-resize]')
          ? 'resize'
          : 'move';
      const node = event.currentTarget;
      const col = node.closest<HTMLElement>('[data-calendar-drop-kind="hour"]');
      const offset =
        mode === 'resize' || !col || task.is_all_day
          ? 0
          : ((event.clientY - col.getBoundingClientRect().top) * 60) / HOUR_PX -
            calendarAxisMinute(
              task.start_date ?? task.due_date ?? '',
              zone,
              root.current?.dataset.calendarRepeatedHour === undefined
                ? null
                : Number(root.current.dataset.calendarRepeatedHour),
            );
      const drag: Session = {
        task,
        mode,
        x: event.clientX,
        y: event.clientY,
        active: false,
        timer: 0,
        node,
        offset,
        target: null,
        patch: null,
        keyboard: false,
      };
      session.current = drag;
      if (event.pointerType === 'touch' && mode === 'resize' && selectedTask === task.id)
        drag.active = true;
      else if (event.pointerType === 'touch')
        drag.timer = window.setTimeout(() => {
          if (session.current === drag) {
            drag.active = true;
            setSelectedTask(task.id);
            if ('vibrate' in navigator) navigator.vibrate(10);
            publish(drag, {
              day: startDay(task),
              ...(month
                ? { preserveClock: true }
                : { minute: startMinute(task), allDay: task.is_all_day }),
            });
          }
        }, 400);
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        !callback.current ||
        task.status !== 'active' ||
        task.kind !== 'task' ||
        (event.target instanceof Element && event.target.closest('input, button'))
      )
        return;
      let drag = session.current;
      if (!drag && event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        drag = {
          task,
          mode: 'move',
          x: 0,
          y: 0,
          active: true,
          timer: 0,
          node: event.currentTarget,
          offset: 0,
          target: null,
          patch: null,
          keyboard: true,
        };
        session.current = drag;
        publish(drag, {
          day: startDay(task),
          ...(month
            ? { preserveClock: true }
            : { minute: startMinute(task), allDay: task.is_all_day }),
        });
        setAnnouncement(messages.calendarDragKeyboardStart.replace('{title}', task.title));
        return;
      }
      if (!drag?.keyboard || drag.task.id !== task.id) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        return;
      }
      if (event.key.toLowerCase() === 'a' && drag.target && !month) {
        event.preventDefault();
        event.stopPropagation();
        publish(drag, {
          ...drag.target,
          allDay: !drag.target.allDay,
          minute: drag.target.minute ?? 540,
        });
        return;
      }
      if (!event.key.startsWith('Arrow') || !drag.target) return;
      event.preventDefault();
      event.stopPropagation();
      const target = { ...drag.target };
      const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      if (month || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        target.day = shiftDayKey(
          target.day,
          sign * (month && ['ArrowUp', 'ArrowDown'].includes(event.key) ? 7 : 1),
        );
      else if (event.shiftKey && !task.is_all_day)
        target.duration = Math.max(
          15,
          (target.duration ?? task.duration_minutes ?? 30) + sign * 15,
        );
      else if (task.is_all_day) {
        target.allDay = false;
        target.minute = 9 * 60;
      } else
        target.minute = Math.max(
          0,
          Math.min(1425, (target.minute ?? startMinute(task)) + sign * (event.altKey ? 5 : 15)),
        );
      publish(drag, target);
    },
  });
  const external = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation();
      if (event.pointerType === 'touch') {
        const timer = window.setTimeout(() => {
          setAnnouncement(messages.calendarExternalReadonly);
        }, 400);
        const clear = () => {
          window.clearTimeout(timer);
        };
        document.addEventListener('pointerup', clear, { once: true });
        document.addEventListener('pointercancel', clear, { once: true });
      }
    },
    onDragStart: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
    },
  };
  return { bindTask, preview, helpId, announcement, external };
}
