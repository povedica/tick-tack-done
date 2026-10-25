import { useWtFMessages } from '../i18n-wt-f';
export function ShortcutFooter() {
  const m = useWtFMessages();
  return <footer className="sp-foot">{m.footer}</footer>;
}
