import { Kbd } from '../components/ui';
import { useMessages } from '../i18n';

export function ShortcutHelp({ onClose }: { readonly onClose: () => void }) {
  const messages = useMessages();
  const rows = [
    ['N', messages.fab],
    ['?', messages.shortcutsTitle],
    ['Ctrl/Cmd+K', messages.paletteTitle],
    ['/', messages.searchTitle],
    ['Esc', messages.close],
    ['.', messages.syncNow],
    ['G T', messages.navToday],
    ['G I', messages.navInbox],
    ['G C', messages.navCalendar],
    ['G M', messages.navMatrix],
    ['G S', messages.navSettings],
  ];
  return (
    <div className="ui-scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={messages.shortcutsTitle}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <h2>{messages.shortcutsTitle}</h2>
        <table className="shortcut-table">
          <tbody>
            {rows.map(([keys, label]) => (
              <tr key={keys}>
                <td>{label}</td>
                <td>
                  <Kbd>{keys ?? ''}</Kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={onClose}>
          {messages.close}
        </button>
      </div>
    </div>
  );
}
