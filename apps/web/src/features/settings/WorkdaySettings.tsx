import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, List, Plus, Tag, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { Popover } from '../../components/Popover';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { fill, useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { refreshTaskSurfaces } from '../tasks/refresh';
import './settings-wt-e.css';
import { workCopy, workCountLine, workDays, workHideHelp, type WorkDayCode } from './work-text';

interface WorkdayMe {
  readonly default_task_duration_minutes: number;
  readonly deadline_soon_days: number;
  readonly evening_start: string;
  readonly shutdown_reminder_time: string | null;
}

export function WorkdaySettings() {
  const messages = useMessages();
  const locale = useAppLocale();
  const copy = workCopy(locale);
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const work = useQuery({ queryKey: ['work-context'], queryFn: () => api.getWorkContext() });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects({ limit: 100 }),
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags({ limit: 100 }) });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<readonly WorkDayCode[] | null>(null);

  async function saveMembership(patch: Parameters<typeof api.updateWorkContext>[0]): Promise<void> {
    setError(null);
    await api.updateWorkContext(patch);
    await queryClient.invalidateQueries({ queryKey: ['work-context'] });
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    await refreshTaskSurfaces(queryClient);
  }

  if (me.isPending || work.isPending) {
    return (
      <section>
        <h1>{copy.title}</h1>
        <SkeletonRows />
      </section>
    );
  }
  if (me.isError || work.isError) {
    return (
      <section>
        <h1>{copy.title}</h1>
        <ErrorState
          title={fill(messages.loadFailed, copy.title)}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(me.refetch());
            runAction(work.refetch());
          }}
        />
      </section>
    );
  }

  const data = me.data as WorkdayMe;
  const profile = work.data;
  const selected = days ?? profile.work_days;
  const folderRows = folders.data?.items ?? [];
  const listRows = projects.data?.items ?? [];
  const tagRows = tags.data?.items ?? [];

  return (
    <section className="token-settings workday-settings">
      <h1>{copy.title}</h1>
      <p className="lede">{copy.lede}</p>
      <form
        className="workday-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const text = (key: string) => {
            const raw = form.get(key);
            const value = typeof raw === 'string' ? raw : '';
            return value.length === 0 ? null : value;
          };
          setBusy(true);
          setSaved(false);
          setError(null);
          runAction(
            api
              .updateMe({
                work_day_start: text('work_day_start'),
                work_day_end: text('work_day_end'),
                work_days: [...selected],
                evening_start: text('evening_start') ?? '18:00',
                shutdown_reminder_time: text('shutdown_reminder_time'),
                default_task_duration_minutes: Number(form.get('default_task_duration_minutes')),
                deadline_soon_days: Number(form.get('deadline_soon_days')),
              })
              .then(async () => {
                setDays(null);
                await queryClient.invalidateQueries({ queryKey: ['me'] });
                await queryClient.invalidateQueries({ queryKey: ['work-context'] });
                setSaved(true);
              })
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : messages.settingsFailed);
              })
              .finally(() => {
                setBusy(false);
              }),
          );
        }}
      >
        <h2>{copy.schedule}</h2>
        <div className="work-hours">
          <span id="work-hours-label">{copy.hours}</span>
          <div className="work-hours-fields">
            <input
              name="work_day_start"
              aria-label={copy.starts}
              defaultValue={profile.work_day_start ?? ''}
              pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
              placeholder="09:00"
            />
            <span aria-hidden="true">–</span>
            <input
              name="work_day_end"
              aria-label={copy.ends}
              defaultValue={profile.work_day_end ?? ''}
              pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
              placeholder="18:00"
            />
          </div>
        </div>
        <div className="work-days">
          <span id="work-days-label">{copy.days}</span>
          <div role="group" aria-labelledby="work-days-label">
            {workDays().map((day) => {
              const on = selected.includes(day.code);
              const letter = locale.toLowerCase().startsWith('en') ? day.en : day.es;
              const name = locale.toLowerCase().startsWith('en') ? day.nameEn : day.nameEs;
              return (
                <button
                  key={day.code}
                  type="button"
                  className={on ? 'is-on' : ''}
                  aria-pressed={on}
                  aria-label={name}
                  onClick={() => {
                    const next = on
                      ? selected.filter((code) => code !== day.code)
                      : [...selected, day.code];
                    setDays(next);
                  }}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        <div className="work-membership">
          <h2>
            {copy.membership} <small>{copy.optional}</small>
          </h2>
          <p>{copy.rule}</p>
          <MembershipRow
            label={copy.folders}
            addLabel={`${copy.add} ${copy.folders}`}
            removeLabel={copy.remove}
            searchLabel={copy.search}
            emptyLabel={copy.empty}
            icon={<Folder size={14} aria-hidden="true" />}
            selected={folderRows.filter((row) => profile.work_folder_ids.includes(row.id))}
            options={folderRows.filter((row) => !profile.work_folder_ids.includes(row.id))}
            nameOf={(row) => row.name}
            countOf={() => null}
            onAdd={(row) => {
              runAction(
                saveMembership({ work_folder_ids: [...profile.work_folder_ids, row.id] }).catch(
                  (reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                  },
                ),
              );
            }}
            onRemove={(row) => {
              runAction(
                saveMembership({
                  work_folder_ids: profile.work_folder_ids.filter((id) => id !== row.id),
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                }),
              );
            }}
          />
          <MembershipRow
            label={copy.lists}
            addLabel={`${copy.add} ${copy.lists}`}
            removeLabel={copy.remove}
            searchLabel={copy.search}
            emptyLabel={copy.empty}
            icon={<List size={14} aria-hidden="true" />}
            selected={listRows.filter((row) => profile.work_project_ids.includes(row.id))}
            options={listRows.filter((row) => !profile.work_project_ids.includes(row.id))}
            nameOf={(row) => row.name}
            countOf={(row) => row.active_task_count}
            onAdd={(row) => {
              runAction(
                saveMembership({ work_project_ids: [...profile.work_project_ids, row.id] }).catch(
                  (reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                  },
                ),
              );
            }}
            onRemove={(row) => {
              runAction(
                saveMembership({
                  work_project_ids: profile.work_project_ids.filter((id) => id !== row.id),
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                }),
              );
            }}
          />
          <MembershipRow
            label={copy.tags}
            addLabel={`${copy.add} ${copy.tags}`}
            removeLabel={copy.remove}
            searchLabel={copy.search}
            emptyLabel={copy.empty}
            icon={<Tag size={14} aria-hidden="true" />}
            selected={tagRows.filter((row) => profile.work_tag_ids.includes(row.id))}
            options={tagRows.filter((row) => !profile.work_tag_ids.includes(row.id))}
            nameOf={(row) => row.name}
            countOf={(row) => row.active_task_count}
            onAdd={(row) => {
              runAction(
                saveMembership({ work_tag_ids: [...profile.work_tag_ids, row.id] }).catch(
                  (reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                  },
                ),
              );
            }}
            onRemove={(row) => {
              runAction(
                saveMembership({
                  work_tag_ids: profile.work_tag_ids.filter((id) => id !== row.id),
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                }),
              );
            }}
          />
          <p className="work-count">
            {workCountLine(
              locale,
              profile.counts.lists,
              profile.counts.tags,
              profile.counts.active_tasks,
            )}
          </p>
          <label className="work-hide">
            <span>
              <strong>{copy.hide}</strong>
              <small>
                {workHideHelp(locale, profile.work_day_start, profile.work_day_end, selected)}
              </small>
            </span>
            <button
              type="button"
              className="notification-switch"
              role="switch"
              aria-checked={profile.hide_work_outside_hours}
              aria-label={copy.hide}
              onClick={() => {
                runAction(
                  saveMembership({
                    hide_work_outside_hours: !profile.hide_work_outside_hours,
                  }).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : messages.settingsFailed);
                  }),
                );
              }}
            >
              <span />
            </button>
          </label>
        </div>

        <h2>{copy.estimates}</h2>
        <Estimate
          name="default_task_duration_minutes"
          label={messages.defaultDuration}
          unit={copy.minutes}
          initial={data.default_task_duration_minutes}
          min={5}
          max={240}
        />
        <Estimate
          name="deadline_soon_days"
          label={messages.deadlineSoon}
          unit={copy.daysBefore}
          initial={data.deadline_soon_days}
          min={1}
          max={14}
        />
        <div className="workday-setting-row">
          <label htmlFor="workday-evening">{messages.eveningStart}</label>
          <input
            id="workday-evening"
            name="evening_start"
            defaultValue={data.evening_start}
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
            placeholder="HH:mm"
          />
        </div>
        <div className="workday-setting-row">
          <label htmlFor="workday-shutdown">{messages.shutdownTime}</label>
          <input
            id="workday-shutdown"
            name="shutdown_reminder_time"
            defaultValue={data.shutdown_reminder_time ?? ''}
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
            placeholder="HH:mm"
          />
        </div>
        <Button variant="primary" type="submit" loading={busy}>
          {messages.repeatSave}
        </Button>
        {saved ? <span role="status">{messages.saved}</span> : null}
      </form>
      {error !== null ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function Estimate({
  name,
  label,
  unit,
  initial,
  min,
  max,
}: {
  readonly name: string;
  readonly label: string;
  readonly unit: string;
  readonly initial: number;
  readonly min: number;
  readonly max: number;
}) {
  return (
    <div className="workday-setting-row">
      <label htmlFor={`workday-${name}`}>{label}</label>
      <span className="work-estimate">
        <input
          id={`workday-${name}`}
          name={name}
          type="number"
          min={min}
          max={max}
          required
          defaultValue={initial}
        />
        <span>{unit}</span>
      </span>
    </div>
  );
}

function MembershipRow<T extends { id: string }>({
  label,
  addLabel,
  removeLabel,
  searchLabel,
  emptyLabel,
  icon,
  selected,
  options,
  nameOf,
  countOf,
  onAdd,
  onRemove,
}: {
  readonly label: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly searchLabel: string;
  readonly emptyLabel: string;
  readonly icon: ReactNode;
  readonly selected: readonly T[];
  readonly options: readonly T[];
  readonly nameOf: (row: T) => string;
  readonly countOf: (row: T) => number | null;
  readonly onAdd: (row: T) => void;
  readonly onRemove: (row: T) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visible = options.filter((row) =>
    nameOf(row).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="work-membership-row">
      <span>{label}</span>
      <div className="work-chips">
        {selected.map((row) => (
          <span className="work-chip" key={row.id}>
            {icon}
            {nameOf(row)}
            <button
              type="button"
              aria-label={`${removeLabel} ${nameOf(row)}`}
              onClick={() => {
                onRemove(row);
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          ref={anchor}
          type="button"
          className="work-add"
          aria-label={addLabel}
          aria-expanded={open}
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
        >
          <Plus size={14} aria-hidden="true" /> {copyAdd(addLabel)}
        </button>
        <Popover
          open={open}
          anchor={anchor}
          label={addLabel}
          className="popover work-picker"
          onClose={() => {
            setOpen(false);
          }}
        >
          <input
            data-popover-initial=""
            aria-label={searchLabel}
            value={query}
            placeholder={searchLabel}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <ul>
            {visible.length === 0 ? <li className="work-picker-empty">{emptyLabel}</li> : null}
            {visible.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(row);
                    setOpen(false);
                  }}
                >
                  {icon}
                  <span>{nameOf(row)}</span>
                  {countOf(row) === null ? null : <small>{countOf(row)}</small>}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      </div>
    </div>
  );
}

function copyAdd(label: string): string {
  return label.startsWith('Añadir') ? 'Añadir' : 'Add';
}
