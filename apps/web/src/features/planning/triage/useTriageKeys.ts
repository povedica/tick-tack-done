import { useEffect, useRef } from 'react';
import { isTypingTarget } from '../../../shell/shortcuts';
export function useTriageKeys(handle: (event: KeyboardEvent) => boolean) {
  const current = useRef(handle);
  current.current = handle;
  useEffect(() => {
    let navigationUntil = 0;
    const listener = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'g' && !event.metaKey && !event.ctrlKey) {
        navigationUntil = Date.now() + 1000;
        return;
      }
      if (Date.now() < navigationUntil) {
        navigationUntil = 0;
        return;
      }
      if (key === '/' || key === '[' || ((event.ctrlKey || event.metaKey) && key === 'k')) return;
      if (current.current(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);
}
