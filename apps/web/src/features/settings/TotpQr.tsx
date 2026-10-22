import { toDataURL } from 'qrcode';
import { useEffect, useState } from 'react';

export function TotpQr({
  value,
  label,
  size = 180,
}: {
  readonly value: string;
  readonly label: string;
  readonly size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: 'M' }).then(
      (url) => {
        if (live) {
          setSrc(url);
        }
      },
      () => {
        if (live) {
          setSrc(null);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [value, size]);
  if (src === null) {
    return null;
  }
  return <img className="totp-qr" src={src} width={size} height={size} alt={label} />;
}
