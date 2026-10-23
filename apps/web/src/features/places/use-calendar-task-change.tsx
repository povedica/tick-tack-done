import { runAction } from '../../components/run-action';
import { useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { AgendaPage } from '../calendar/use-agenda-query';
import type { Task, TaskPatch } from '@reflexionia/sdk';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { UndoToastStack } from '../../components/UndoToast';
import { refreshTaskSurfaces } from '../tasks/refresh';

export type CalendarTaskChange = (task: Task, patch: TaskPatch) => void;
export function useCalendarTaskChange() {
  const cache = useQueryClient();
  const messages = useMessages();
  const locale = useAppLocale();
  const busy = useRef(new Set<string>());
  const [undo, setUndo] = useState<{ id: string; task: Task; patch: TaskPatch; title: string }[]>(
    [],
  );
  const [failed, setFailed] = useState<{ task: Task; patch: TaskPatch } | null>(null);
  const patchCaches = (id: string, patch: TaskPatch) => {
    for (const key of ['calendar-tasks', 'calendar-start-tasks']) {
      cache.setQueriesData<Task[]>({ queryKey: [key] }, (old) =>
        old?.map((task) =>
          task.id === id
            ? { ...task, ...patch, tag_ids: patch.tag_ids ? [...patch.tag_ids] : task.tag_ids }
            : task,
        ),
      );
    }
    cache.setQueriesData<InfiniteData<AgendaPage>>({ queryKey: ['calendar-agenda'] }, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              tasks: page.tasks.map((task) =>
                task.id === id
                  ? {
                      ...task,
                      ...patch,
                      tag_ids: patch.tag_ids ? [...patch.tag_ids] : task.tag_ids,
                    }
                  : task,
              ),
            })),
          }
        : old,
    );
  };
  const save = async (task: Task, patch: TaskPatch, restoring = false) => {
    if (busy.current.has(task.id)) return;
    busy.current.add(task.id);
    let original = task;
    let restore: TaskPatch = {};
    try {
      await Promise.all(
        ['calendar-tasks', 'calendar-start-tasks', 'calendar-agenda'].map((key) =>
          cache.cancelQueries({ queryKey: [key] }),
        ),
      );
      original =
        cache
          .getQueriesData<Task[]>({ queryKey: ['calendar-tasks'] })
          .flatMap(([, rows]) => rows ?? [])
          .find((row) => row.id === task.id) ?? (await api.getTask(task.id));
      restore = {
        start_date: original.start_date,
        due_date: original.due_date,
        duration_minutes: original.duration_minutes,
        is_all_day: original.is_all_day,
        time_zone: original.time_zone,
      };
      if (Object.entries(restore).every(([key, value]) => patch[key as keyof TaskPatch] === value))
        return;
      patchCaches(task.id, patch);
      await api.patchTask(task.id, patch);
      setFailed(null);
      if (!restoring) {
        const instant = patch.start_date ?? patch.due_date;
        const when = instant
          ? new Intl.DateTimeFormat(locale, {
              timeZone: patch.time_zone ?? task.time_zone,
              dateStyle: 'medium',
              ...(patch.is_all_day ? {} : { timeStyle: 'short' }),
            }).format(new Date(instant))
          : '';
        setUndo((old) => [
          ...old.filter((item) => item.task.id !== task.id),
          {
            id: crypto.randomUUID(),
            task: original,
            patch: restore,
            title:
              messages.calendarMovedTo.replace('{date}', when) +
              (task.repeat_rule ? ' · ' + messages.calendarMovedOccurrence : ''),
          },
        ]);
      }
    } catch {
      patchCaches(task.id, restore);
      setFailed({ task: original, patch });
    } finally {
      busy.current.delete(task.id);
      runAction(refreshTaskSurfaces(cache));
    }
  };
  const change: CalendarTaskChange = (task, patch) => {
    runAction(save(task, patch));
  };
  return {
    change,
    feedback: (
      <>
        {failed ? (
          <div role="alert" className="calendar-drag-error">
            {messages.calendarMoveFailed}
            <button
              type="button"
              onClick={() => {
                runAction(save(failed.task, failed.patch));
              }}
            >
              {messages.retry}
            </button>
          </div>
        ) : null}
        <UndoToastStack
          items={undo}
          durationMs={5000}
          message="{name}"
          undoLabel={messages.undo}
          onExpire={(id) => {
            setUndo((old) => old.filter((item) => item.id !== id));
          }}
          onUndo={(id) => {
            const item = undo.find((value) => value.id === id);
            if (item) {
              setUndo((old) => old.filter((value) => value.id !== id));
              runAction(save(item.task, item.patch, true));
            }
          }}
        />
      </>
    ),
  };
}
