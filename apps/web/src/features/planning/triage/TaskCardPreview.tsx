import { civilDateKey, describeRepeatRule } from '@reflexionia/domain';
import { Clock, Flag, Menu, Repeat } from 'lucide-react';
import Markdown from 'react-markdown';
import { TagChip } from '../../../components/ui';
import { useAppLocale } from '../../../i18n/locale';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanCard } from '../api';

export function TaskCardPreview({
  card,
  side,
  zone,
  date,
}: {
  readonly card: PlanCard;
  readonly side: 'previous' | 'next';
  readonly zone: string;
  readonly date: string;
}) {
  const locale = useAppLocale(),
    m = useWtFMessages();
  const dueKey = card.due_date ? civilDateKey(card.due_date, zone) : null;
  const late = dueKey
    ? Math.max(0, Math.round((Date.parse(date) - Date.parse(dueKey)) / 86400000))
    : 0;
  return (
    <div
      className={`sp-card plan-neighbor is-${side}`}
      aria-hidden="true"
      inert
      data-preview-task={card.task_id}
    >
      <div className="sp-meta">
        {card.due_date ? (
          <span className={late ? 'sp-late' : ''}>
            {new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'short',
              timeZone: zone,
            }).format(new Date(card.due_date))}
            {late ? ` · ${m.ago} ${String(late)} ${late === 1 ? m.day : m.days}` : ''}
          </span>
        ) : null}
        <Flag size={15} color={`var(--prio-${card.priority})`} />
        {card.recurring ? (
          <span className="plan-repeat">
            <Repeat size={13} />
            {locale.startsWith('es') && card.repeat_rule
              ? (describeRepeatRule(card.repeat_rule) ?? m.repeating)
              : m.repeating}
          </span>
        ) : null}
      </div>
      <div className="plan-preview-context">
        <span className="sp-proj">
          <Menu size={15} style={{ color: card.project_color ?? 'var(--ink-3)' }} />
          {card.project_name}
        </span>
        {card.tags.map((tag) => (
          <TagChip key={tag.id} label={tag.name} color={tag.color} />
        ))}
      </div>
      <p className="plan-preview-title">{card.title}</p>
      <span className="plan-preview-duration">
        <Clock size={14} />
        {card.duration_minutes ?? 30} min
      </span>
      <div className="sp-desc">
        <Markdown>{card.content}</Markdown>
      </div>
    </div>
  );
}
