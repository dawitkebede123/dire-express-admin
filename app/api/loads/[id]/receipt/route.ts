import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadReceipt } from "@/lib/receipt";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const load = await db.load.findUnique({
    where: { id },
    select: { paymentReceiptUrl: true },
  });

  if (!load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  if (!load.paymentReceiptUrl) {
    return NextResponse.json({ error: "No receipt attached" }, { status: 404 });
  }

  const receipt = await loadReceipt(load.paymentReceiptUrl);
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
