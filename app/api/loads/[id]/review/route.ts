import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const load = await db.load.findUnique({
    where: { id },
    include: { broker: true },
  });

  if (!load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }

  const awaitingReview =
    Boolean(load.paymentReceiptUrl) &&
    !load.reviewedAt &&
    (load.status === "PENDING" || load.status === "CREATED");

  if (!awaitingReview) {
    return NextResponse.json({ error: "Load is not awaiting receipt approval" }, { status: 409 });
  }

  const { action, rejectionReason } = parsed.data;
  const approved = action === "approve";

  const updated = await db.load.update({
    where: { id },
    data: {
      status: approved ? "CREATED" : "CANCELLED",
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      rejectionReason: approved ? null : rejectionReason?.trim() || "Receipt rejected",
    },
  });

  await db.notification.create({
    data: {
      userId: load.broker.userId,
      type: "STATUS_UPDATE",
      title: approved ? "Load approved" : "Load rejected",
      body: approved
        ? `Load ${load.referenceNo} was approved and is now active.`
        : `Load ${load.referenceNo} was rejected: ${updated.rejectionReason}`,
      loadId: load.id,
      data: {
        kind: approved ? "approved" : "receipt_rejected",
        referenceNo: load.referenceNo,
        ...(approved ? {} : { reason: updated.rejectionReason ?? "" }),
      },
    },
  });

  return NextResponse.json({ load: updated });
}
