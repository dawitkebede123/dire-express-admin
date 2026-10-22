import { NextResponse } from "next/server";
import { isAdminUid } from "@/lib/firebase/admin";
import { getSession } from "@/lib/session";

export async function requireAdminSession() {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdminUid(session.uid))) {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}
