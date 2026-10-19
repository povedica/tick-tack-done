import { Kbd } from '../components/ui';
import { useMessages } from '../i18n';
import { SHORTCUT_ROWS } from './shortcuts';

export function ShortcutHelp({ onClose }: { readonly onClose: () => void }) {
  const messages = useMessages();
  const rows = SHORTCUT_ROWS.map(([keys, label]) => [keys, messages[label]]);
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
