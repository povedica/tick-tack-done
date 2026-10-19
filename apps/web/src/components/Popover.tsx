import { useEffect, useRef, type ReactNode } from 'react';

export function Popover({
  open,
  label,
  onClose,
  className,
  children,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly onClose: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      onClose();
    }
    function onPointer(event: MouseEvent): void {
      const node = ref.current;
      if (node === null || !(event.target instanceof Node)) {
        return;
      }
      if (!node.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose, open]);
  if (!open) {
    return null;
  }
  return (
    <div ref={ref} className={className ?? 'popover'} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}
