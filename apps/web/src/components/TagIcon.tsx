import { Tag } from 'lucide-react';

export function TagIcon({ color }: { readonly color?: string | null | undefined }) {
  return (
    <Tag
      className="tag-outline-icon"
      size={16}
      strokeWidth={1.5}
      fill="none"
      aria-hidden="true"
      style={{ color: color ?? 'var(--ink-3)', flexShrink: 0 }}
    />
  );
}
