import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useWtFMessages } from '../i18n-wt-f';
export function TimeSelect({
  value,
  slots,
  onChange,
}: {
  readonly value: string;
  readonly slots: readonly string[];
  readonly onChange: (s: string) => void;
}) {
  const m = useWtFMessages();
  const [custom, setCustom] = useState(false);
  return (
    <div className="sp-time">
      <Clock size={15} />
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
        <option value="">{m.noTime} ▾</option>
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
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
