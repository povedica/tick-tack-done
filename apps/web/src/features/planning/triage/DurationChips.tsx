import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useWtFMessages } from '../i18n-wt-f';
export function DurationChips({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (n: number) => void;
}) {
  const m = useWtFMessages();
  const [custom, setCustom] = useState(false);
  const isCustom = custom || ![15, 30, 60].includes(value);
  return (
    <div className="sp-dur" role="radiogroup" aria-label={m.duration}>
      <Clock size={15} />
      <span className="plan-duration-label">{m.duration}:</span>
      {[15, 30, 60].map((n) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === n}
          key={n}
          className={`sp-chip ${value === n ? 'is-on' : ''}`}
          onClick={() => {
            setCustom(false);
            onChange(n);
          }}
        >
          {n === 60 ? '1 h' : `${String(n)} min`}
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={isCustom}
        className={`sp-chip ${isCustom ? 'is-on' : ''}`}
        onClick={() => {
          setCustom(true);
        }}
      >
        {m.other}
      </button>
      {isCustom ? (
        <input
          aria-label={m.customDuration}
          type="number"
          min={5}
          max={480}
          step={5}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 5 && n <= 480) onChange(n);
          }}
        />
      ) : null}
    </div>
  );
}
