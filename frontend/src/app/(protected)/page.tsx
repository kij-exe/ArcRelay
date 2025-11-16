"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, Activity, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface EndpointConfig {
  method: string;
  path: string;
  active?: boolean;
}

interface ProxyConfig {
  serviceName?: string;
  endpoints: EndpointConfig[];
}

// interface Balance {
//   amount: string;
// }

// interface WalletBalance {
//   balances: Balance[];
// }

// interface BalancesResponse {
//   balances: WalletBalance[];
// }

interface Settlement {
  id: string;
  endpoint: string;
  amount: string;
  network: string;
  status: string;
  timestamp: string;
}

interface DashboardStats {
  monthlyRevenue: string;
  revenueChange: string;
  activeEndpoints: number;
  totalServices: number;
  pendingWithdrawals: string;
  withdrawalsStatus: string;
}

interface SettlementsResponse {
  settlements: Settlement[];
}

// Get JWT token from localStorage
const getToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("arc_token");
};

export default function DashboardPage() {

  // Fetch endpoint configuration
  const PROXY_BASE = (process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:4000").replace(/\/+$/, "");

  const { data: config, isLoading: configLoading } = useQuery<ProxyConfig>({
    queryKey: ["config"],
    queryFn: async () => {
      const token = getToken();
      const response = await fetch(`${PROXY_BASE}/config`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to load config");
      return response.json();
    },
  });

  // (Balances query omitted on dashboard; page shows settlements only)

  // Fetch recent settlements
  const { data: settlementsData, isLoading: settlementsLoading } = useQuery<SettlementsResponse>({
    queryKey: ["settlements"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      return apiFetch<SettlementsResponse>("/settlements", { token });
    },
  });

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboardStats"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      return apiFetch<DashboardStats>("/dashboard/stats", { token });
    },
    enabled: !!config, // Only fetch when config is loaded
  });

  // (Optional) Aggregated balance available if needed later:
  // const totalBalance = balancesData?.balances.reduce((total, wallet) => {
  //   const walletBalance = wallet.balances[0]?.amount || "0";
  //   return total + parseFloat(walletBalance);
  // }, 0) || 0;

  // Calculate stats from fetched data
  const activeFromConfig =
    (config?.endpoints || []).filter(
      (e) => e && e.active !== false && typeof e.price === "string" && e.price.trim().length > 0
    ).length || 0;
  const calculatedStats: DashboardStats = {
    monthlyRevenue: stats?.monthlyRevenue || "0.00",
    revenueChange: stats?.revenueChange || "No data available",
    activeEndpoints: stats?.activeEndpoints ?? activeFromConfig,
    totalServices: stats?.totalServices || 1,
    pendingWithdrawals: stats?.pendingWithdrawals || "0.00",
    withdrawalsStatus: stats?.withdrawalsStatus || "All funds settled",
  };

  // Format time ago
  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins > 0 ? `${diffMins} minute${diffMins > 1 ? "s" : ""} ago` : "Just now";
  };

  // Format network name
  const formatNetwork = (network: string) => {
    const networkMap: Record<string, string> = {
      "BASE-SEPOLIA": "Base",
      "ETH-SEPOLIA": "Ethereum",
      "ARC-TESTNET": "Arc",
      "AVAX-FUJI": "Avalanche Fuji",
    };
    return networkMap[network] || network;
  };

  const isLoading = configLoading || settlementsLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  const statsCards = [
    {
      label: "Monthly Revenue",
      value: `$${parseFloat(calculatedStats.monthlyRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: calculatedStats.revenueChange,
      icon: TrendingUp,
    },
    {
      label: "Active Endpoints",
      value: calculatedStats.activeEndpoints.toString(),
      sub: `Across ${calculatedStats.totalServices} service${calculatedStats.totalServices > 1 ? "s" : ""}`,
      icon: Activity,
    },
    {
      label: "Pending Withdrawals",
      value: `$${parseFloat(calculatedStats.pendingWithdrawals).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: calculatedStats.withdrawalsStatus,
      icon: Clock,
    },
  ];

  return (
    <>
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-widest text-text-muted">
          Overview
        </p>
        <h1 className="text-3xl font-semibold text-text-primary">
          Welcome back, builder
        </h1>
        <p className="text-text-secondary">
          Monitor usage, adjust pricing, and manage settlements directly from
          your local workspace.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {statsCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl bg-surface p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-muted">{item.label}</p>
                <Icon className="h-5 w-5 text-text-muted" />
              </div>
              <p className="mt-2 text-3xl font-semibold text-text-primary">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{item.sub}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Settlements
          </h2>
          <div className="mt-6 space-y-4">
            {settlementsData?.settlements && settlementsData.settlements.length > 0 ? (
              settlementsData.settlements.map((settlement) => (
                <div
                  key={settlement.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-text-primary">
                      {settlement.endpoint}
                    </p>
                    <p className="text-sm text-text-muted">
                      Settled to {formatNetwork(settlement.network)} •{" "}
                      {formatTimeAgo(settlement.timestamp)}
                    </p>
                  </div>
                  <p className="text-base font-semibold text-text-primary">
                    +${parseFloat(settlement.amount).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-sm text-text-muted">
                No recent settlements
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

