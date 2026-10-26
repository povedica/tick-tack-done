import { Kbd } from '../../../components/ui';
import { useWtFMessages } from '../i18n-wt-f';
export function ShortcutFooter() {
  const m = useWtFMessages();
  return (
    <footer className="sp-foot">
      {m.footer.split(' · ').map((part) => {
        const words = part.split(' ');
        const count = words[0] === '←' ? 2 : 1;
        const key = words.slice(0, count).join(' ');
        return (
          <span key={part}>
            {key === '⠿' ? <span aria-hidden="true">⠿</span> : <Kbd>{key}</Kbd>}{' '}
            {words.slice(count).join(' ')}
          </span>
        );
      })}
    </footer>
  );
}
