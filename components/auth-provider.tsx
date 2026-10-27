"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import { NOT_AN_ADMIN, readDashboardAdmin, type AdminProfile } from "@/lib/rtdb/admin-access";

export type AuthStatus = "loading" | "signedOut" | "denied" | "ready" | "error";

export type AdminSession = AdminProfile & { uid: string };

type AuthState = {
  status: AuthStatus;
  admin: AdminSession | null;
  message: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", admin: null, message: null });
  const deniedRef = useRef(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    let checkId = 0;

    let auth;
    try {
      auth = getClientAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase is not configured";
      const timer = window.setTimeout(() => {
        if (!cancelled) setState({ status: "error", admin: null, message });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        const check = ++checkId;
        if (!user) {
          if (cancelled) return;
          if (deniedRef.current) {
            setState({ status: "denied", admin: null, message: NOT_AN_ADMIN });
          } else {
            setState({ status: "signedOut", admin: null, message: null });
          }
          return;
        }

        deniedRef.current = false;
        setState({ status: "loading", admin: null, message: null });
        readDashboardAdmin(user.uid)
          .then(async (profile) => {
            if (cancelled || check !== checkId) return;
            if (!profile) {
              deniedRef.current = true;
              setState({ status: "denied", admin: null, message: NOT_AN_ADMIN });
              await signOut(auth);
              return;
            }
            setState({
              status: "ready",
              admin: { uid: user.uid, ...profile },
              message: null,
            });
          })
          .catch((error: unknown) => {
            if (cancelled || check !== checkId) return;
            setState({
              status: "error",
              admin: null,
              message: error instanceof Error ? error.message : "Could not verify admin access",
            });
          });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase is not configured";
      const timer = window.setTimeout(() => {
        if (!cancelled) setState({ status: "error", admin: null, message });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAdminAuth must be used within AuthProvider");
  return state;
}
