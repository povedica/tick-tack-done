export function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  const needle = query.trim();
  const index =
    needle.length === 0 ? -1 : text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}
