import { dateTimeFormat } from '../../lib/dates/formatters';
import { useState } from 'react';
import type { Messages } from '../../i18n';

export interface ExternalEventView {
  readonly id: string;
  readonly subscription_id?: string;
  readonly title: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly is_all_day: boolean;
  readonly time_zone?: string | null;
  readonly color?: string | null;
  readonly summary?: string | null;
  readonly location?: string | null;
  readonly description?: string | null;
  readonly provider?: string | null;
}

export function ExternalEventPopover({
  event,
  messages,
  locale,
  onClose,
}: {
  readonly event: ExternalEventView;
  readonly messages: Messages;
  readonly locale: string;
  readonly onClose: () => void;
}) {
  const when = dateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: event.is_all_day ? undefined : 'short',
  });
  return (
    <div className="menu-card external-popover" role="dialog" aria-label={event.title}>
      <p className="external-popover-title">
        <span className="cal-dot" style={dotStyle(event.color)} />
        {event.title}
      </p>
      {event.summary !== null && event.summary !== undefined && event.summary.length > 0 ? (
        <p>{event.summary}</p>
      ) : null}
      <p>
        {event.is_all_day
          ? messages.allDay
          : `${when.format(new Date(event.starts_at))} – ${when.format(new Date(event.ends_at ?? event.starts_at))}`}
      </p>
      {event.location !== null && event.location !== undefined && event.location.length > 0 ? (
        <p>{event.location}</p>
      ) : null}
      {event.description !== null &&
      event.description !== undefined &&
      event.description.length > 0 ? (
        <p>{event.description}</p>
      ) : null}
      <p className="ui-muted">{messages.googleReadonly}</p>
      <button type="button" className="text-button" onClick={onClose}>
        {messages.cancel}
      </button>
    </div>
  );
}

export function useExternalEvent() {
  const [event, setEvent] = useState<ExternalEventView | null>(null);
  return {
    event,
    open: setEvent,
    close: () => {
      setEvent(null);
    },
  };
}

export function dotStyle(color: string | null | undefined): { background: string } | undefined {
  if (color === undefined || color === null || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return undefined;
  }
  return { background: color };
}

export function chipStyle(
  color: string | null | undefined,
): { background: string; boxShadow: string } | undefined {
  if (color === undefined || color === null || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return undefined;
  }
  return {
    background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
    boxShadow: `inset 3px 0 0 ${color}`,
  };
}

export function isExternalEvent(value: unknown): value is ExternalEventView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as { id?: unknown; title?: unknown; starts_at?: unknown };
  return (
    typeof event.id === 'string' &&
    typeof event.title === 'string' &&
    typeof event.starts_at === 'string'
  );
}
