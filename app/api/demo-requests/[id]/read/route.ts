import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { markDemoRequestRead } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await context.params;
  try {
    await markDemoRequestRead(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update demo request";
    const status = message === "Demo request not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
