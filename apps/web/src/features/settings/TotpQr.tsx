import { toDataURL } from 'qrcode';
import { useEffect, useState } from 'react';

export function TotpQr({ value, label }: { readonly value: string; readonly label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void toDataURL(value, { margin: 1, width: 180, errorCorrectionLevel: 'M' }).then(
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
  }, [value]);
  if (src === null) {
    return null;
  }
  return <img className="totp-qr" src={src} width={180} height={180} alt={label} />;
}
