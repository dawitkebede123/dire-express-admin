"use client";

import { useEffect, useState } from "react";
import { loadReceiptSource } from "@/lib/rtdb/media";
import { isPdfUrl } from "@/lib/utils";

export function ReceiptViewer({ storedUrl }: { storedUrl: string }) {
  return <ReceiptFrame key={storedUrl} storedUrl={storedUrl} />;
}

function ReceiptFrame({ storedUrl }: { storedUrl: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    loadReceiptSource(storedUrl)
      .then((result) => {
        if (cancelled) {
          if (result?.revoke) URL.revokeObjectURL(result.url);
          return;
        }
        if (!result) {
          setError(
            "This receipt is still a file on the main app. Set NEXT_PUBLIC_MAIN_APP_URL and rebuild, or import it into Realtime Database."
          );
          return;
        }
        if (result.revoke) revoked = result.url;
        setSrc(result.url);
        setContentType(result.contentType);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the receipt");
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [storedUrl]);

  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!src) return <p className="text-sm text-muted">Loading receipt…</p>;

  const pdf =
    contentType === "application/pdf" ||
    storedUrl.startsWith("data:application/pdf") ||
    isPdfUrl(storedUrl);

  if (pdf) {
    return (
      <iframe
        title="Payment receipt"
        src={src}
        className="h-[720px] w-full rounded-xl border border-border bg-white"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Payment receipt"
      className="max-h-[720px] w-full rounded-xl border border-border bg-white object-contain"
    />
  );
}
