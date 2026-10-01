"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function MfaQrCode({ uri }: { uri: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(uri, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (failed) {
    return (
      <p className="text-sm text-vice-text-muted">
        QR kon niet worden gegenereerd. Gebruik de setup key hieronder.
      </p>
    );
  }

  if (!dataUrl) {
    return <p className="text-sm text-vice-text-muted">QR-code genereren…</p>;
  }

  return (
    <div className="flex justify-center rounded-lg border border-vice-border bg-white p-6">
      <img
        src={dataUrl}
        alt="QR-code voor tweefactorauthenticatie"
        width={280}
        height={280}
        className="size-[280px] max-w-full"
      />
    </div>
  );
}
