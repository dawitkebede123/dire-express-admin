import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getAgentScores } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const agents = await getAgentScores();
  return NextResponse.json({ agents });
}
