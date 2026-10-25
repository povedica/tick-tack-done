import { useEffect, useRef, useState } from 'react';
import type { PointerEventHandler, ReactNode } from 'react';
import Markdown from 'react-markdown';
import { Clock, Flag, GripVertical, Paperclip, Repeat } from 'lucide-react';
import { TagChip } from '../../../components/ui';
import { useAppLocale } from '../../../i18n/locale';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanCard } from '../api';
export function TaskCard({
  card,
  date,
  duration,
  onDuration,
  children,
  drag,
}: {
  readonly card: PlanCard;
  readonly date: string;
  readonly duration: number;
  readonly onDuration: () => void;
  readonly children?: ReactNode;
  readonly drag?: PointerEventHandler<HTMLElement>;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const title = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    title.current?.focus();
    setExpanded(false);
  }, [card.task_id]);
  const due = card.due_date ? new Date(card.due_date) : null;
  const dueKey = due
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(due)
    : null;
  const overdue = dueKey !== null && dueKey < date;
  const lateDays = dueKey
    ? Math.max(0, Math.round((Date.parse(date) - Date.parse(dueKey)) / 86400000))
    : 0;
  return (
    <article
      className="sp-task"
      role="group"
      aria-labelledby="plan-task-title"
      onPointerDown={drag}
    >
      <div className="sp-meta">
        <button type="button" className="sp-grip" onPointerDown={drag} aria-label={m.footer}>
          <GripVertical size={18} />
        </button>
        {due ? (
          <span className={overdue ? 'sp-late' : ''}>
            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(due)}
            {overdue ? ` · ${m.ago} ${lateDays} ${lateDays === 1 ? m.day : m.days}` : ''}
          </span>
        ) : null}
        <span className="sp-proj">
          <i className="sp-dot" style={{ background: card.project_color ?? 'var(--ink-3)' }} />
          {card.project_name}
        </span>
        {card.priority !== 'none' ? (
          <span>
            <Flag size={13} />
            {m[card.priority]}
          </span>
        ) : null}
        {card.recurring ? (
          <span title={card.repeat_rule ?? ''}>
            <Repeat size={13} />
            {card.repeat_rule}
          </span>
        ) : null}
      </div>
      <h2 id="plan-task-title" tabIndex={-1} ref={title}>
        {card.title}
      </h2>
      <button className="sp-mobile-duration" type="button" onClick={onDuration}>
        <Clock size={14} />
        {duration} min
      </button>
      <div className="sp-extras">
        {(card.tags ?? []).map((tag) => (
          <TagChip key={tag.id} label={tag.name} color={tag.color} />
        ))}
      </div>
      <div className={`sp-desc ${expanded ? 'is-expanded' : ''}`}>
        <Markdown>{card.content ?? ''}</Markdown>
      </div>
      {(card.content ?? '').length > 240 ? (
        <button type="button" className="sp-read-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? m.less : m.more}
        </button>
      ) : null}
      <div className="sp-files">
        {(card.attachments ?? []).map((file) => (
          <a key={file.id} className="sp-file" href={file.url} target="_blank" rel="noreferrer">
            <Paperclip size={14} />
            {file.name}
          </a>
        ))}
      </div>
      {children}
    </article>
  );
}
