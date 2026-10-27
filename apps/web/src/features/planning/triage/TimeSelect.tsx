import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useWtFMessages } from '../i18n-wt-f';
export function TimeSelect({
  value,
  slots,
  onChange,
  compact = false,
}: {
  readonly value: string;
  readonly slots: readonly string[];
  readonly onChange: (s: string) => void;
  /** Desktop card: no clock icon and no trailing colon. The When sheet keeps both. */
  readonly compact?: boolean;
}) {
  const m = useWtFMessages();
  const [custom, setCustom] = useState(false);
  return (
    <div className="sp-time">
      {compact ? null : <Clock size={15} aria-hidden="true" />}
      <span className="plan-time-label">{compact ? m.timeLabel : `${m.timeLabel}:`}</span>
      <select
        aria-label={m.time}
        className="sp-chip"
        value={custom ? 'custom' : value}
        onChange={(e) => {
          if (e.target.value === 'custom') setCustom(true);
          else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{m.noTime}</option>
        {slots.map((s) => (
          <option key={s}>{s}</option>
        ))}
        {value && !slots.includes(value) ? <option>{value}</option> : null}
        <option value="custom">{m.otherTime}</option>
      </select>
      {custom ? (
        <input
          aria-label={m.otherTime}
          type="time"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      ) : null}
    </div>
  );
}
