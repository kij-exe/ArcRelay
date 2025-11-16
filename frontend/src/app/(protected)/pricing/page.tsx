"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, AlertCircle } from "lucide-react";

// Wallet interfaces will be used when we add a wallet display section
// interface Wallet {
//   circleWalletId: string;
//   blockchain: string;
//   address: string;
//   state: string;
// }
// interface WalletsResponse {
//   walletSetId: string;
//   wallets: Wallet[];
// }

interface EndpointConfig {
  method: string;
  path: string;
  description: string;
  price: string | null;
  token: string | null;
  payTo: string | null;
  network: string;
  maxTimeoutSeconds: number | null;
  autoSettle: boolean;
  active: boolean;
  facilitatorUrl: string;
}

interface ProxyConfig {
  serviceName?: string;
  upstreamBaseUrl: string;
  endpoints: EndpointConfig[];
}

const PROXY_BASE = (process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:4000").replace(/\/+$/, "");

export default function PricingPage() {
  const queryClient = useQueryClient();
  const [editedEndpoints, setEditedEndpoints] = useState<Record<string, Partial<EndpointConfig>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Wallets query will be used when we add a wallet display section
  // const { data: wallets, isLoading: walletsLoading } = useQuery<WalletsResponse>({
  //   queryKey: ["wallets"],
  //   queryFn: async () => { ... },
  // });

  const getToken = () => (typeof window !== "undefined" ? window.localStorage.getItem("arc_token") : null);

  const { data: config, isLoading: configLoading } = useQuery<ProxyConfig>({
    queryKey: ["config"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${PROXY_BASE}/config`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load config");
      return (await res.json()) as ProxyConfig;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedConfig: ProxyConfig) => {
      const token = getToken();
      const response = await fetch(`${PROXY_BASE}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updatedConfig),
      });
      if (!response.ok) throw new Error("Failed to save config");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
      setEditedEndpoints({});
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    },
  });

  const handleFieldChange = <K extends keyof EndpointConfig>(
    index: number,
    field: K,
    value: EndpointConfig[K]
  ) => {
    setEditedEndpoints((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    if (!config) return;
    const updatedEndpoints = config.endpoints.map((endpoint, idx) => ({
      ...endpoint,
      ...editedEndpoints[idx],
    }));
    saveMutation.mutate({
      ...config,
      endpoints: updatedEndpoints,
    });
  };

  const hasChanges = Object.keys(editedEndpoints).length > 0;

  if (configLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3 text-error">
          <AlertCircle className="h-5 w-5" />
          <p>Failed to load endpoint configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">Pricing</h1>
          <p className="mt-1 text-text-secondary">
            Configure payment requirements for your API endpoints
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {saveSuccess && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-success">
          Configuration saved successfully
        </div>
      )}

      {saveError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error">
          {saveError}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-background-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Endpoint
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Price (USDC)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Timeout (s)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Auto-Settle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.endpoints.map((endpoint, idx) => {
                const edited = editedEndpoints[idx] || {};
                const currentPrice = edited.price !== undefined ? edited.price : endpoint.price;
                const currentTimeout = edited.maxTimeoutSeconds !== undefined ? edited.maxTimeoutSeconds : endpoint.maxTimeoutSeconds;
                const currentAutoSettle = edited.autoSettle !== undefined ? edited.autoSettle : (endpoint.autoSettle ?? true);
                const currentActive = edited.active !== undefined ? edited.active : (endpoint.active ?? false);

                return (
                  <tr key={idx} className="hover:bg-background-muted/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-brand-subtle px-2 py-1 text-xs font-medium text-brand-primary">
                          {endpoint.method}
                        </span>
                        <span className="font-mono text-sm text-text-primary">
                          {endpoint.path}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary max-w-xs truncate">
                      {endpoint.description}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={currentPrice || ""}
                        onChange={(e) => handleFieldChange(idx, "price", e.target.value)}
                        placeholder="0.00"
                        disabled={!currentActive}
                        className="w-24 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition disabled:bg-gray-100 disabled:text-text-muted disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        value={currentTimeout || ""}
                        onChange={(e) => handleFieldChange(idx, "maxTimeoutSeconds", parseInt(e.target.value) || null)}
                        placeholder="300"
                        disabled={!currentActive}
                        className="w-20 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition disabled:bg-gray-100 disabled:text-text-muted disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={currentAutoSettle}
                          onChange={(e) => handleFieldChange(idx, "autoSettle", e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-primary peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                      </label>
                    </td>
                    <td className="px-6 py-4">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={currentActive}
                          onChange={(e) => handleFieldChange(idx, "active", e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {config.endpoints.length === 0 && (
        <div className="rounded-2xl bg-surface p-12 text-center shadow-card">
          <p className="text-text-muted">No endpoints configured yet</p>
          <p className="mt-2 text-sm text-text-secondary">
            Add an OpenAPI spec to generate endpoint configuration
          </p>
        </div>
      )}
    </div>
  );
}

