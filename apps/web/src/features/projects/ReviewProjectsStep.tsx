import { projectDayLabel } from '@reflexionia/domain';
import type { ProjectOverviewItem } from '@reflexionia/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { runAction } from '../../components/run-action';
import { useWeeklyCopy } from '../product/weekly-text';
import { MarkListPicker } from './MarkListPicker';
import { refreshProjectSurfaces } from './projects-api';
import { useProjectsCopy } from './projects-text';
import './projects.css';

interface Groups {
  attention: ProjectOverviewItem[];
  paused: ProjectOverviewItem[];
  ok: ProjectOverviewItem[];
}

function isItem(value: unknown): value is ProjectOverviewItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Partial<ProjectOverviewItem>;
  return typeof item.id === 'string' && typeof item.name === 'string';
}

export function readReviewProjects(value: unknown): Groups {
  const body =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const list = (key: string) => (Array.isArray(body[key]) ? body[key].filter(isItem) : []);
  return { attention: list('attention'), paused: list('paused'), ok: list('ok') };
}

export function ReviewProjectsStep({
  projects,
  onContinue,
}: {
  readonly projects: unknown;
  readonly onContinue: () => void;
}) {
  const copy = useWeeklyCopy();
  const projectsCopy = useProjectsCopy();
  const client = useQueryClient();
  const initial = readReviewProjects(projects);
  const [groups, setGroups] = useState<Groups>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const markAnchor = useRef<HTMLButtonElement>(null);
  const [markOpen, setMarkOpen] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  const activeCount = groups.attention.length + groups.ok.length;
  const shown = [...groups.attention, ...groups.paused, ...groups.ok];

  function move(id: string, state: 'active' | 'paused' | 'archived') {
    runAction(
      api.setProjectState(id, state).then(() => refreshProjectSurfaces(client)),
      {
        success: () => {
          setGroups((current) => relocate(current, id, state));
        },
      },
    );
  }

  function addNext(item: ProjectOverviewItem) {
    const title = (drafts[item.id] ?? '').trim();
    if (title.length === 0) {
      return;
    }
    runAction(
      api
        .createTask({ project_id: item.id, title }, crypto.randomUUID())
        .then(() => refreshProjectSurfaces(client)),
      {
        success: () => {
          setGroups((current) => ({
            attention: current.attention.filter((row) => row.id !== item.id),
            paused: current.paused,
            ok: [
              ...current.ok,
              {
                ...item,
                attention: null,
                next_action: {
                  task_id: 'local',
                  title,
                  due_date: null,
                  start_date: null,
                  is_all_day: true,
                },
              },
            ],
          }));
          setDrafts((current) => ({ ...current, [item.id]: '' }));
        },
      },
    );
  }

  return (
    <div className="review-projects">
      <p>
        {activeCount} {copy.projectsLead}
      </p>
      {shown.length === 0 ? (
        <p>
          {copy.projectsEmpty}{' '}
          <button
            ref={markAnchor}
            type="button"
            className="projects-text-link"
            onClick={() => {
              setMarkOpen(true);
            }}
          >
            {copy.markList}
          </button>
        </p>
      ) : null}
      {groups.attention.length === 0 ? null : (
        <section>
          <h2>{copy.needsDecision}</h2>
          {groups.attention.map((item) => (
            <div key={item.id} className="review-project-row">
              <strong>{item.name}</strong>
              <span>
                {item.next_action === null ? copy.noNextAction : item.next_action.title}
                {item.outcome ? ` · ${copy.outcomeLabel}: ${item.outcome}` : ''}
              </span>
              {item.next_action === null ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addNext(item);
                  }}
                >
                  <input
                    value={drafts[item.id] ?? ''}
                    placeholder={copy.addNextAction}
                    aria-label={`${copy.addNextAction}: ${item.name}`}
                    onChange={(event) => {
                      setDrafts((current) => ({ ...current, [item.id]: event.target.value }));
                    }}
                  />
                  <span>{copy.enterHint}</span>
                </form>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  move(item.id, 'paused');
                }}
              >
                {copy.pauseProject}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  move(item.id, 'archived');
                }}
              >
                {copy.archiveProject}
              </Button>
            </div>
          ))}
        </section>
      )}
      {groups.paused.length === 0 ? null : (
        <section>
          <h2>{copy.pausedBlock}</h2>
          {groups.paused.map((item) => (
            <div key={item.id} className="review-project-row">
              <strong>{item.name}</strong>
              <span>
                {copy.pausedSince}{' '}
                {projectDayLabel(
                  item.project_status_changed_at ?? item.created_at,
                  zone,
                  copy.locale,
                )}{' '}
                · {item.open_count} {copy.projectTasks}
              </span>
              <Button
                type="button"
                onClick={() => {
                  move(item.id, 'active');
                }}
              >
                {copy.resumeProject}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  move(item.id, 'archived');
                }}
              >
                {copy.archiveProject}
              </Button>
            </div>
          ))}
        </section>
      )}
      {groups.ok.length === 0 ? null : (
        <section>
          <h2>
            {copy.onTrack} · {groups.ok.length}
          </h2>
          {groups.ok.map((item) => (
            <div key={item.id} className="review-project-row">
              <strong>{item.name}</strong>
              <span>{item.next_action?.title ?? copy.noNextAction}</span>
            </div>
          ))}
        </section>
      )}
      <Button
        type="button"
        onClick={() => {
          const ids = shown.map((item) => item.id);
          runAction(
            (async () => {
              for (let index = 0; index < ids.length; index += 50) {
                const chunk = ids.slice(index, index + 50);
                if (chunk.length > 0) {
                  await api.reviewProjects(chunk);
                }
              }
              await refreshProjectSurfaces(client);
              onContinue();
            })(),
          );
        }}
      >
        {copy.continue}
      </Button>
      <MarkListPicker
        copy={projectsCopy}
        anchor={markAnchor}
        open={markOpen}
        onClose={() => {
          setMarkOpen(false);
        }}
      />
    </div>
  );
}

function relocate(groups: Groups, id: string, state: 'active' | 'paused' | 'archived'): Groups {
  const item = [...groups.attention, ...groups.paused, ...groups.ok].find((row) => row.id === id);
  const rest: Groups = {
    attention: groups.attention.filter((row) => row.id !== id),
    paused: groups.paused.filter((row) => row.id !== id),
    ok: groups.ok.filter((row) => row.id !== id),
  };
  if (item === undefined || state === 'archived') {
    return rest;
  }
  if (state === 'paused') {
    return { ...rest, paused: [...rest.paused, { ...item, state: 'paused' }] };
  }
  const target = item.next_action === null ? 'attention' : 'ok';
  return { ...rest, [target]: [...rest[target], { ...item, state: 'active' }] };
}
