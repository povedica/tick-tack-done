export function BrandMark({ size = 28 }: { readonly size?: number }) {
  return (
    <img
      className="brand-mark"
      src="/android-chrome-192x192.png"
      alt=""
      width={size}
      height={size}
    />
  );
}
