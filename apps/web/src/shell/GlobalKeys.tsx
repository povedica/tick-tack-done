import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { GO_PATHS, isTypingTarget } from './shortcuts';

export function GlobalKeys({ onHelp }: { readonly onHelp: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let chord = '';
    function onKey(event: KeyboardEvent): void {
      const typing = isTypingTarget(event.target);
      if (event.key === '?' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onHelp();
        return;
      }
      if (event.key === '.' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void queryClient.invalidateQueries();
        return;
      }
      if (typing) {
        chord = '';
        return;
      }
      if (event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) {
        chord = 'g';
        return;
      }
      if (chord === 'g') {
        chord = '';
        const path = GO_PATHS[event.key.toLowerCase()];
        if (path !== undefined) {
          event.preventDefault();
          void navigate(path);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate, onHelp, queryClient]);

  return null;
}
