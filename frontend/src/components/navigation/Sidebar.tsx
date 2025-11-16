"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Tag,
  ArrowDownCircle,
  Wallet2,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Pricing", href: "/pricing", icon: Tag },
  { label: "Withdraw", href: "/withdraw", icon: ArrowDownCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") {
      return "user@example.com";
    }
    return window.localStorage.getItem("arc_user_email") || "user@example.com";
  });

  useEffect(() => {
    const handler = () => {
      const stored = window.localStorage.getItem("arc_user_email");
      if (stored) {
        setEmail(stored);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem("arc_token");
    window.localStorage.removeItem("arc_user_email");
    window.location.href = "/login";
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-surface px-6 py-8 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand-primary">
          <Wallet2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-text-muted">ArcRelay</p>
          <p className="font-semibold text-text-primary">Developer Portal</p>
        </div>
      </div>

      <nav className="mt-10 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-subtle text-brand-primary"
                  : "text-text-secondary hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-100 bg-surface-subtle p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted">
          Signed in as
        </p>
        <p className="truncate text-sm font-semibold text-text-primary">
          {email}
        </p>
        <button
          onClick={handleLogout}
          className="mt-4 w-full rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

