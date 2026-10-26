import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import './select.css';

/** Native keyboard/assistive behavior with the same compact field styling as Settings. */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select-control">
      <select {...props} />
      <ChevronDown size={12} aria-hidden="true" />
    </span>
  );
}
