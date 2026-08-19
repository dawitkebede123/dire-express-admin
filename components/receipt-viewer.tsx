import { isPdfUrl } from "@/lib/utils";

export function ReceiptViewer({
  src,
  storedUrl,
}: {
  src: string;
  storedUrl: string;
}) {
  if (isPdfUrl(storedUrl) || isPdfUrl(src)) {
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
