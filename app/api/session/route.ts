import { NextResponse } from "next/server";
import { adminAuth, FirebaseConfigError, isAdminUid } from "@/lib/firebase/admin";
import { adminDb } from "@/lib/firebase/admin";
import {
  sealSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idToken?: unknown };
    if (typeof body.idToken !== "string" || !body.idToken) {
      return NextResponse.json({ error: "Missing id token" }, { status: 400 });
    }

    const decoded = await adminAuth().verifyIdToken(body.idToken);
    if (!(await isAdminUid(decoded.uid))) {
      return NextResponse.json({ error: "This account is not an admin" }, { status: 403 });
    }

    const profile = (await adminDb().ref(`users/${decoded.uid}`).get()).val() as { name?: string } | null;
    const token = await sealSession({
      uid: decoded.uid,
      email: decoded.email || "",
      name: profile?.name || decoded.name || "Admin",
      exp: Date.now() + sessionMaxAgeSeconds() * 1000,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
