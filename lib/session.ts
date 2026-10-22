import { cookies } from "next/headers";
import { openSession, SESSION_COOKIE, type SessionPayload } from "@/lib/session-token";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}
