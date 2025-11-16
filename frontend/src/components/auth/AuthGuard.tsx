"use client";

import { useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";

export function AuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState<boolean>(false);

  useEffect(() => {
    // Run only on client after mount to avoid SSR/client mismatch
    const token = typeof window !== "undefined" ? window.localStorage.getItem("arc_token") : null;
    const present = Boolean(token);
    setHasToken(present);
    setReady(true);
    if (!present) {
      router.replace("/login");
    }
  }, [router]);

  // During SSR and until we check client storage, render a stable placeholder
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <p className="text-sm text-text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!hasToken) {
    // We initiated a redirect; keep placeholder to prevent content flash
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <p className="text-sm text-text-muted">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}




/*
"use client";

import { useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo } from "react";

export function AuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("arc_token");
  }, []);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <p className="text-sm text-text-muted">Checking credentials…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
  */