import type { Task } from '@reflexionia/sdk';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PriorityCheck } from '../../components/PriorityCheck';
import { api } from '../../api';
import { fill, useMessages } from '../../i18n';
import { completeBody } from '../tasks/complete-body';
import { refreshTaskSurfaces } from '../tasks/refresh';
export function CalendarTaskMark({ task }: { task: Task }) {
  const m = useMessages();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="calendar-task-mark">
      <PriorityCheck
        priority={task.priority}
        label={fill(m.completeLabel, task.title)}
        disabled={busy}
        checked={task.status === 'completed'}
        onChange={() => {
          setBusy(true);
          setError(false);
          void api
            .completeTask(task.id, completeBody(), crypto.randomUUID())
            .then(() => refreshTaskSurfaces(cache))
            .catch(() => {
              setError(true);
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      />
      {error ? <span role="alert">{m.saveFailed}</span> : null}
    </span>
  );
}
