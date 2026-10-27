import { ApiError } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, List, Target } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../api';
import { Popover } from '../../components/Popover';
import { Button } from '../../components/ui';
import { runAction } from '../../components/run-action';
import { refreshProjectSurfaces } from './projects-api';
import { deleteButtonLabel, taskImpactLine, type ProjectsCopy } from './projects-text';

export function DeleteProjectDialog({
  projectId,
  name,
  copy,
  onClose,
}: {
  readonly projectId: string;
  readonly name: string;
  readonly copy: ProjectsCopy;
  readonly onClose: () => void;
}) {
  const client = useQueryClient();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const impact = useQuery({
    queryKey: ['project-deletion-impact', projectId],
    queryFn: () => api.getProjectDeletionImpact(projectId),
  });
  const [mismatch, setMismatch] = useState(false);
  const data = impact.data;
  return (
    <Popover
      open
      centered
      mobileSheet
      label={copy.deleteHeading(name)}
      onClose={onClose}
      className="project-delete"
      initialFocus={cancelRef}
    >
      <h2>{copy.deleteHeading(name)}</h2>
      <p>{copy.deleteLead}</p>
      {impact.isPending || data === undefined ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <ul>
          <li>
            <List size={16} aria-hidden="true" />
            <span>{copy.listLine(data.name)}</span>
          </li>
          <li>
            <CircleCheck size={16} aria-hidden="true" />
            <span>
              {taskImpactLine(data.task_count, data.completed_count, data.open_count, copy.english)}
            </span>
          </li>
          <li>
            <Target size={16} aria-hidden="true" />
            <span>{copy.deleteOutcome}</span>
          </li>
        </ul>
      )}
      <p className="project-delete-note">{copy.deleteNote}</p>
      {mismatch ? <p role="alert">{copy.deleteMismatch}</p> : null}
      <div className="project-delete-actions">
        <Button
          ref={cancelRef}
          type="button"
          onClick={() => {
            onClose();
          }}
        >
          {copy.cancel}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={data === undefined || impact.isFetching}
          onClick={() => {
            if (data === undefined) {
              return;
            }
            const expected = data.task_count;
            runAction(
              (async () => {
                try {
                  await api.deleteProject(projectId, { expectedTaskCount: expected });
                } catch (error) {
                  if (isTaskCountMismatch(error)) {
                    setMismatch(true);
                    await impact.refetch();
                    return;
                  }
                  throw error;
                }
                await refreshProjectSurfaces(client);
                onClose();
              })(),
            );
          }}
        >
          {data === undefined ? copy.delete : deleteButtonLabel(data.task_count, copy.english)}
        </Button>
      </div>
    </Popover>
  );
}

export function isTaskCountMismatch(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.code === 'confirmation_mismatch'
  );
}
