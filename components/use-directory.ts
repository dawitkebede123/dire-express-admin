"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/components/auth-provider";
import type { Directory } from "@/lib/data";
import { explainReadError, loadDirectory, onDirectoryInvalidated } from "@/lib/rtdb/reads";

export function useDirectory() {
  const { status } = useAdminAuth();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    let request = 0;
    const run = () => {
      const current = ++request;
      loadDirectory()
        .then((value) => {
          if (cancelled || current !== request) return;
          setDirectory(value);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled || current !== request) return;
          setError(explainReadError(err));
        });
    };
    run();
    const unsubscribe = onDirectoryInvalidated(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [status]);

  return { directory, error, status };
}
