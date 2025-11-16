"use client";

import { Sidebar } from "@/components/navigation/Sidebar";
import { PropsWithChildren } from "react";

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background px-8 py-10">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}

