import { PanelLeft } from 'lucide-react';
import { useShellActions } from './shell-actions';

export function SidebarFoldButton() {
  const { toggleNav, navLabel, navExpanded } = useShellActions();
  return (
    <button
      type="button"
      className="icon-button sidebar-fold-button"
      aria-label={navLabel}
      aria-expanded={navExpanded}
      aria-controls="section-sidebar"
      title={`${navLabel} ([)`}
      onClick={toggleNav}
    >
      <PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
