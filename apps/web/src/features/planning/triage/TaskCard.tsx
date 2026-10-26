import { createPortal } from 'react-dom';
import { describeRepeatRule } from '@reflexionia/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEventHandler, ReactNode } from 'react';
import Markdown from 'react-markdown';
import { Clock, Flag, GripVertical, Menu, Paperclip, Repeat } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api';
import { PriorityMenu } from '../../../components/PriorityMenu';
import { DatePopover } from '../../../components/DatePopover';
import { Popover } from '../../../components/Popover';
import { runAction } from '../../../components/run-action';
import { TagChip } from '../../../components/ui';
import { useAppLocale } from '../../../i18n/locale';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanCard } from '../api';
export function TaskCard({
  card,
  date,
  zone,
  duration,
  onDuration,
  children,
  drag,
  onEdit,
}: {
  readonly onEdit: (
    id: string,
    change: { priority?: PlanCard['priority']; projectId?: string; repeatRule?: string | null },
  ) => Promise<void>;
  readonly card: PlanCard;
  readonly date: string;
  readonly zone: string;
  readonly duration: number;
  readonly onDuration: () => void;
  readonly children?: ReactNode;
  readonly drag?: PointerEventHandler<HTMLElement>;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const [editor, setEditor] = useState<'list' | 'priority' | 'repeat' | null>(null);
  const listAnchor = useRef<HTMLButtonElement>(null);
  const priorityAnchor = useRef<HTMLButtonElement>(null);
  const detailAnchor = useRef<HTMLButtonElement>(null);
  const repeatAnchor = useRef<HTMLButtonElement>(null);
  const projects = useQuery({
    queryKey: ['planning-projects'],
    queryFn: async () => {
      const items = [];
      let cursor: string | undefined;
      do {
        const page = await api.listProjects(cursor ? { cursor } : {});
        items.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      return items;
    },
    enabled: editor === 'list',
  });
  const dateDraft = useMemo(
    () => ({
      dueDate: card.due_date,
      allDay: card.is_all_day,
      durationMinutes: card.duration_minutes,
      reminder: null,
      reminderTouched: false,
      repeatRule: card.repeat_rule,
    }),
    [card.due_date, card.is_all_day, card.duration_minutes, card.repeat_rule],
  );
  const title = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    setExpanded(false);
    setEditor(null);
  }, [card.task_id]);
  const due = card.due_date ? new Date(card.due_date) : null;
  const dueKey = due
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(due)
    : null;
  const overdue = dueKey !== null && dueKey < date;
  const lateDays = dueKey
    ? Math.max(0, Math.round((Date.parse(date) - Date.parse(dueKey)) / 86400000))
    : 0;
  const listControl = (className: string) => (
    <button
      type="button"
      className={`plan-meta-button sp-proj ${className}`}
      aria-label={m.changeList}
      aria-expanded={editor === 'list'}
      onClick={(event) => {
        listAnchor.current = event.currentTarget;
        setEditor(editor === 'list' ? null : 'list');
      }}
      disabled={card.habit}
    >
      <Menu size={15} style={{ color: card.project_color ?? 'var(--ink-3)' }} />
      {card.project_name}
    </button>
  );
  return (
    <article
      className="sp-task sp-card"
      role="group"
      aria-labelledby="plan-task-title"
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') drag?.(event);
      }}
    >
      <div className="sp-meta">
        <button type="button" className="sp-grip" onPointerDown={drag} aria-label={m.footer}>
          <GripVertical size={18} />
        </button>
        {due ? (
          <span className={overdue ? 'sp-late' : ''}>
            {new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'short',
              timeZone: zone,
            }).format(due)}
            {overdue ? ` · ${m.ago} ${String(lateDays)} ${lateDays === 1 ? m.day : m.days}` : ''}
          </span>
        ) : null}
        {listControl('plan-desktop-only')}
        <div className="plan-priority-anchor">
          <button
            type="button"
            className="plan-meta-button"
            ref={priorityAnchor}
            aria-label={m.changePriority}
            aria-expanded={editor === 'priority'}
            onClick={() => {
              setEditor(editor === 'priority' ? null : 'priority');
            }}
            disabled={card.habit}
          >
            <Flag
              size={15}
              color={`var(--prio-${card.priority})`}
              fill={card.priority === 'none' ? 'none' : `var(--prio-${card.priority})`}
            />
          </button>
          <PriorityMenu
            anchor={priorityAnchor}
            closeLabel={m.close}
            open={editor === 'priority'}
            value={card.priority}
            onClose={() => {
              setEditor(null);
            }}
            onChange={(priority) => {
              runAction(onEdit(card.task_id, { priority }));
            }}
          />
        </div>
        {card.recurring ? (
          <button
            type="button"
            ref={repeatAnchor}
            className="plan-meta-button plan-repeat"
            aria-label={m.editRepeat}
            onClick={() => {
              setEditor('repeat');
            }}
            disabled={card.habit}
          >
            <Repeat size={13} />
            {card.habit
              ? m.habit
              : locale.startsWith('es') && card.repeat_rule
                ? (describeRepeatRule(card.repeat_rule) ?? m.repeating)
                : m.repeating}
          </button>
        ) : null}
        <Popover
          open={editor === 'list'}
          label={m.changeList}
          closeLabel={m.close}
          anchor={listAnchor}
          onClose={() => {
            setEditor(null);
          }}
          className="popover popover-menu"
          mobileSheet
        >
          {projects.isPending ? (
            <p role="status">{m.preparing}</p>
          ) : projects.isError ? (
            <p role="alert">{m.failed}</p>
          ) : (
            <ul className="popover-list">
              {projects.data
                .filter((p) => !p.closed)
                .map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="popover-row"
                      onClick={() => {
                        setEditor(null);
                        runAction(onEdit(card.task_id, { projectId: project.id }));
                      }}
                    >
                      <Menu size={14} style={{ color: project.color ?? 'var(--ink-3)' }} />
                      {project.name}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Popover>
        {editor === 'repeat' ? (
          <DatePopover
            mode="repeat-only"
            closeLabel={m.close}
            open
            value={dateDraft}
            timeZone={zone}
            anchor={repeatAnchor}
            onClose={() => {
              setEditor(null);
            }}
            onApply={(next) => {
              runAction(onEdit(card.task_id, { repeatRule: next.repeatRule }));
            }}
          />
        ) : null}
      </div>
      <div className="plan-mobile-context plan-mobile-only">
        {listControl('')}
        {card.tags.map((tag) => (
          <TagChip key={tag.id} label={tag.name} color={tag.color} />
        ))}
      </div>
      <h2 id="plan-task-title" className="sp-title" tabIndex={-1} ref={title}>
        {card.title}
      </h2>
      <button className="sp-mobile-duration" type="button" onClick={onDuration}>
        <Clock size={14} />
        {duration} min
      </button>
      <div className="sp-extras plan-desktop-only">
        {card.tags.map((tag) => (
          <TagChip key={tag.id} label={tag.name} color={tag.color} />
        ))}
      </div>
      <div className={`sp-desc ${expanded ? 'is-expanded' : ''}`}>
        <Markdown>{card.content}</Markdown>
      </div>
      {card.content.length > 0 || card.title.length > 90 || card.tags.length > 2 ? (
        <button
          type="button"
          className="sp-read-more"
          onClick={(event) => {
            detailAnchor.current = event.currentTarget;
            if (window.matchMedia('(max-width: 768px)').matches) setDetails(true);
            else setExpanded(!expanded);
          }}
        >
          {expanded ? m.less : m.more}
        </button>
      ) : null}
      <div className="sp-files plan-desktop-only">
        {card.attachments.map((file) => (
          <a key={file.id} className="sp-file" href={file.url} target="_blank" rel="noreferrer">
            <Paperclip size={14} />
            {file.name}
          </a>
        ))}
      </div>
      {card.attachments.length ? (
        <button
          type="button"
          className="plan-mobile-files plan-mobile-only"
          onClick={(event) => {
            detailAnchor.current = event.currentTarget;
            setDetails(true);
          }}
        >
          <Paperclip size={14} />
          {m.attachments} ({card.attachments.length})
        </button>
      ) : null}
      {children}
      {details
        ? createPortal(
            <Popover
              open
              mobileSheet
              anchor={detailAnchor}
              label={card.title}
              className="popover plan-task-details-popover"
              closeLabel={m.close}
              onClose={() => {
                setDetails(false);
              }}
            >
              <div className="plan-task-details">
                <div className="sp-extras">
                  {card.tags.map((tag) => (
                    <TagChip key={tag.id} label={tag.name} color={tag.color} />
                  ))}
                </div>
                <Markdown>{card.content}</Markdown>
                <div className="sp-files">
                  {card.attachments.map((file) => (
                    <a
                      key={file.id}
                      className="sp-file"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Paperclip size={14} />
                      {file.name}
                    </a>
                  ))}
                </div>
              </div>
            </Popover>,
            document.body,
          )
        : null}
    </article>
  );
}
