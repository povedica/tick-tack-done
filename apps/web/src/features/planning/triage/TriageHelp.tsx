import { Modal } from '../../../components/ui';
import { useWtFMessages } from '../i18n-wt-f';
export function TriageHelp({ onClose }: { readonly onClose: () => void }) {
  const m = useWtFMessages();
  return (
    <Modal title={m.help} onClose={onClose}>
      <p>{m.helpIntro}</p>
      <p>{m.footer}</p>
      <p>{m.helpOther}</p>
    </Modal>
  );
}
