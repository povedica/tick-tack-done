/** Monochrome stamp. `currentColor` keeps it visible on light and dark surfaces. */
export function BrandMark({ size = 28 }: { readonly size?: number }) {
  return <span className="brand-mark" aria-hidden="true" style={{ width: size, height: size }} />;
}
