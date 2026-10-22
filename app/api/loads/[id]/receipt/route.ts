import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase/admin";
import { loadReceipt } from "@/lib/receipt";
import { mediaIdFromStoredUrl, readChunkedMedia } from "@/lib/rtdb/media";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  if (!id || /[.#$[\]/]/.test(id)) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  const loadSnap = await adminDb().ref(`loads/${id}`).get();
  if (!loadSnap.exists()) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  const storedUrl = loadSnap.child("paymentReceiptUrl").val();
  if (typeof storedUrl !== "string" || !storedUrl) {
    return NextResponse.json({ error: "No receipt attached" }, { status: 404 });
  }

  const mediaId = mediaIdFromStoredUrl(storedUrl);
  const receipt = mediaId ? await readChunkedMedia(mediaId) : await loadReceipt(storedUrl);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt file not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(receipt.body), {
    headers: {
      "Content-Type": receipt.contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
