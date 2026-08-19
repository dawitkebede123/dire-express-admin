import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agents = await db.brokerProfile.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      referredBy: { include: { user: { select: { name: true, email: true } } } },
      referrals: {
        include: {
          loads: { where: { status: "DELIVERED" }, select: { id: true } },
        },
      },
      loads: { where: { status: "DELIVERED" }, select: { id: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json({
    agents: agents.map((agent) => {
      const delivered = agent.loads.length;
      const referredDelivered = agent.referrals.reduce(
        (sum, referral) => sum + referral.loads.length,
        0
      );
      return {
        id: agent.id,
        name: agent.user.name,
        email: agent.user.email,
        phone: agent.user.phone,
        company: agent.company,
        referee: agent.referredBy
          ? {
              id: agent.referredBy.id,
              name: agent.referredBy.user.name,
              email: agent.referredBy.user.email,
            }
          : null,
        referralCount: agent.referrals.length,
        delivered,
        score: delivered + referredDelivered,
      };
    }),
  });
}
