import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Project } from '@reflexionia/sdk';
import { api } from '../../api';
import { useActionToast } from '../../components/action-toast';
import { PeriodNavigator } from '../../components/period/PeriodNavigator';
import { runAction } from '../../components/run-action';
import { Button, EmptyState, SkeletonRows } from '../../components/ui';
import { fill, useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { newMutation, runOrQueue } from '../offline/client';
import { completeBody } from '../tasks/complete-body';
import { collectTags } from '../tasks/collect';
import { rowFromTask } from '../tasks/model';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { viewsApi } from '../views/api';
import { Board } from '../views/components/ViewPages';

export function InboxPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const inbox = projects.data?.items.find((project) => project.is_inbox);
  const tasks = useQuery({
    queryKey: ['inbox-tasks', inbox?.id],
    queryFn: () =>
      api.listTasks({
        ...(inbox?.id === undefined ? {} : { projectId: inbox.id }),
        status: 'active',
        sort: 'manual',
        limit: 100,
      }),
    enabled: inbox !== undefined,
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const [process, setProcess] = useState(false);
  const [cursor, setCursor] = useState(0);
  const names = new Map((projects.data?.items ?? []).map((project) => [project.id, project.name]));
  const tagNames = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag.name]));
  const rows = [...(tasks.data?.items ?? [])]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((task) => rowFromTask(task, names, tagNames));
  const current = rows[cursor];

  function step(text?: string): void {
    setCursor((value) => value + 1);
    if (text !== undefined) {
      useActionToast.getState().show(text);
    }
    runAction(refreshTaskSurfaces(queryClient));
  }

  if (process) {
    return (
      <section className="screen-page">
        <header className="page-header">
          <h1>{messages.inboxTitle}</h1>
          <Button
            variant="ghost"
            onClick={() => {
              setProcess(false);
            }}
          >
            {messages.processExit}
          </Button>
        </header>
        {current !== undefined ? (
          <>
            <p>{fill(messages.processOf, `${String(cursor + 1)}/${String(rows.length)}`)}</p>
            <ProcessCard
              messages={messages}
              locale={locale}
              taskTitle={current.title}
              projects={projects.data?.items ?? []}
              onDate={(preset, date) => {
                runAction(
                  api.snoozeTask(current.id, preset, date).then(() => {
                    step(messages.processDate);
                  }),
                );
              }}
              onMove={(projectId) => {
                runAction(
                  api.moveTask(current.id, projectId).then(() => {
                    step(messages.processMove);
                  }),
                );
              }}
              onDone={() => {
                runAction(
                  runOrQueue(newMutation('complete', current.id, {}), (key) =>
                    api.completeTask(current.id, completeBody(), key),
                  ).then(() => {
                    step(messages.processDoneAction);
                  }),
                );
              }}
              onDelete={() => {
                const id = current.id;
                runAction(
                  api.deleteTask(id).then(() => {
                    useActionToast.getState().show(messages.movedToTrash, () => {
                      runAction(api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient)));
                    });
                    step(messages.movedToTrash);
                  }),
                );
              }}
              onSkip={() => {
                step();
              }}
            />
          </>
        ) : (
          <EmptyState title={messages.processDone} body={messages.emptyInbox} />
        )}
      </section>
    );
  }

  if (inbox === undefined) {
    return tasks.isPending ? (
      <SkeletonRows />
    ) : (
      <EmptyState title={messages.inboxTitle} body={messages.emptyInbox} />
    );
  }

  return (
    <Board
      key={inbox.id}
      messages={messages}
      title={messages.inboxTitle}
      queryKey={['inbox-tasks', inbox.id]}
      createProjectId={inbox.id}
      matrixListId={inbox.id}
      viewKey="inbox"
      headerActions={
        <Button
          onClick={() => {
            setProcess(true);
            setCursor(0);
          }}
        >
          {messages.process}
        </Button>
      }
      load={(groupBy, sort) =>
        viewsApi.previewFilter(
          {
            mode: 'normal',
            rules: {
              combinator: 'AND',
              groups: [
                {
                  combinator: 'AND',
                  conditions: [{ field: 'list', op: 'in', value: [inbox.id] }],
                },
              ],
            },
          },
          { groupBy, sort },
        )
      }
    />
  );
}

function ProcessCard({
  messages,
  taskTitle,
  projects,
  onDate,
  onMove,
  onDone,
  onDelete,
  onSkip,
}: {
  readonly messages: Messages;
  readonly locale: string;
  readonly taskTitle: string;
  readonly projects: readonly Project[];
  readonly onDate: (preset: 'tomorrow' | 'next_week' | 'date', date?: string) => void;
  readonly onMove: (projectId: string) => void;
  readonly onDone: () => void;
  readonly onDelete: () => void;
  readonly onSkip: () => void;
}) {
  return (
    <article>
      <h2>{taskTitle}</h2>
      <div className="page-toolbar">
        <Button
          onClick={() => {
            onDate('date', new Date().toISOString());
          }}
        >
          {messages.processToday}
        </Button>
        <Button
          onClick={() => {
            onDate('tomorrow');
          }}
        >
          {messages.processTomorrow}
        </Button>
        <Button
          onClick={() => {
            onDate('next_week');
          }}
        >
          {messages.processWeek}
        </Button>
        <PeriodNavigator
          title={messages.processDate}
          date={new Date()}
          onPick={(date) => {
            onDate('date', date.toISOString());
          }}
        />
        <label>
          {messages.processMove}
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value.length > 0) {
                onMove(event.target.value);
              }
            }}
          >
            <option value="">{messages.listMove}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={onDone}>{messages.processDoneAction}</Button>
        <Button variant="danger" onClick={onDelete}>
          {messages.processDelete}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {messages.processSkip}
        </Button>
      </div>
    </article>
  );
}
