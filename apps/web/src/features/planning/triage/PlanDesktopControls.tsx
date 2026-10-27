import type { RefObject } from 'react';
import { ArrowRight, Ban, CalendarDays, Check, CloudSun, Sun } from 'lucide-react';
import type { PlanAction } from '@reflexionia/domain';
import { Kbd } from '../../../components/ui';
import { useWtFMessages } from '../i18n-wt-f';
import { DurationChips } from './DurationChips';
import { MoreMenu } from './MoreMenu';
import { TimeSelect } from './TimeSelect';

const DAY_ACTIONS = [
  ['today', Sun, 'H'],
  ['tomorrow', ArrowRight, 'M'],
  ['move', CalendarDays, 'O'],
] as const;

const TEXT_ACTIONS = [
  ['done', Check, 'C'],
  ['wont_do', Ban, 'N'],
] as const;

export function PlanDesktopControls({
  duration,
  time,
  slots,
  busy,
  anchor,
  onDuration,
  onTime,
  onAction,
}: {
  readonly duration: number;
  readonly time: string;
  readonly slots: readonly string[];
  readonly busy: boolean;
  readonly anchor: RefObject<HTMLButtonElement | null>;
  readonly onDuration: (n: number) => void;
  readonly onTime: (t: string) => void;
  readonly onAction: (action: PlanAction) => void;
}) {
  const m = useWtFMessages();
  return (
    <div className="plan-desktop-controls">
      <div className="plan-time-controls">
        <DurationChips compact value={duration} onChange={onDuration} />
        <span className="plan-time-sep" aria-hidden="true" />
        <TimeSelect compact value={time} slots={slots} onChange={onTime} />
      </div>
      <div className="plan-action-row">
        <div className="plan-day-segment" role="group" aria-label={m.when}>
          {DAY_ACTIONS.map(([action, Icon, key]) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              title={`${m[action]} (${key})`}
              ref={action === 'move' ? anchor : undefined}
              onClick={() => {
                onAction(action);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {m[action]}
              <Kbd>{key}</Kbd>
            </button>
          ))}
        </div>
        <div className="sp-secondary">
          <button
            type="button"
            className="plan-someday-action"
            disabled={busy}
            title={`${m.someday} (A)`}
            onClick={() => {
              onAction('someday');
            }}
          >
            <CloudSun size={16} aria-hidden="true" />
            {m.someday}
          </button>
          <span className="plan-action-sep" aria-hidden="true" />
          {TEXT_ACTIONS.map(([action, Icon, key]) => (
            <button
              key={action}
              type="button"
              className="plan-text-action"
              disabled={busy}
              title={`${m[action]} (${key})`}
              onClick={() => {
                onAction(action);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {m[action]}
              <Kbd>{key}</Kbd>
            </button>
          ))}
          <MoreMenu onAction={onAction} busy={busy} actions={['delete']} />
        </div>
      </div>
    </div>
  );
}
