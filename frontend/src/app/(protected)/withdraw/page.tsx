"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowDownCircle, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Balance {
  amount: string;
  updateDate: string;
}

interface WalletBalance {
  circleWalletId: string;
  blockchain: string;
  address: string;
  state: string;
  balances: Balance[];
}

interface BalancesResponse {
  balances: WalletBalance[];
}

// Request shape is constructed inline in the API call

interface GatewayTransferRequest {
  amount: string;
  destinationAddress: string;
  chain: string;
  network: string;
  sourceWallets?: string[];
}

interface GatewayTransferResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  attestation?: string;
  txHash?: string;
}

interface Transaction {
  id: string;
  state: string;
  transactionHash?: string;
  amount: string;
  destinationChain: string;
  destinationAddress: string;
  createdAt: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
}
// Chain configurations
const SUPPORTED_CHAINS = [
  { value: "ARC-TESTNET", label: "ARC Testnet" },
  { value: "BASE-SEPOLIA", label: "Base Sepolia" },
  { value: "ETH-SEPOLIA", label: "Ethereum Sepolia" },
] as const;

// Ethereum address validation regex (works for all EVM chains)
const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const withdrawalSchema = z.object({
  destinationChain: z.enum(["ARC-TESTNET", "BASE-SEPOLIA", "ETH-SEPOLIA"]),
  destinationAddress: z
    .string()
    .min(1, "Destination address is required")
    .regex(ETHEREUM_ADDRESS_REGEX, "Invalid Ethereum address format"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: "Amount must be a positive number" }
    )
    .refine(
      (val) => {
      const num = parseFloat(val);
      return num > 0.000001; // Minimum withdrawal amount
    },
      { message: "Amount must be at least 0.000001 USDC" }
    ),
  sourceWallets: z.array(z.string()).optional(),
});

type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

export default function WithdrawPage() {
  const queryClient = useQueryClient();
  const [maxAmount, setMaxAmount] = useState<string>("0");

  // Get JWT token from localStorage
  const getToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("arc_token");
  };

  // Fetch aggregated balances
  const { data: balancesData, isLoading: balancesLoading } = useQuery<BalancesResponse>({
    queryKey: ["balances"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      return apiFetch<BalancesResponse>("/balances", { token });
    },
  });

  // Calculate aggregated USDC balance
  const aggregatedBalance = balancesData?.balances.reduce((total, wallet) => {
    const walletBalance = wallet.balances[0]?.amount || "0";
    return total + parseFloat(walletBalance);
  }, 0) || 0;

  // Set max amount when balance loads
  useEffect(() => {
    if (aggregatedBalance > 0) {
      setMaxAmount(aggregatedBalance.toFixed(6));
    }
  }, [aggregatedBalance]);

  // Transaction history
  const { data: transactionsData } = useQuery<TransactionsResponse>({
    queryKey: ["transactions"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      return apiFetch<TransactionsResponse>("/transactions", { token });
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      destinationChain: "BASE-SEPOLIA",
      destinationAddress: "",
      amount: "",
    },
  });

  const watchedAmount = watch("amount");

  // Pre-fill amount with max balance
  const handleMaxClick = () => {
    setValue("amount", maxAmount, { shouldValidate: true });
  };

  // Function to convert form chain value to API chain/network format
  const parseChainAndNetwork = (chainValue: string): { chain: string; network: string } => {
    const chainMap: Record<string, { chain: string; network: string }> = {
      "ARC-TESTNET": { chain: "ARC", network: "Testnet" },
      "BASE-SEPOLIA": { chain: "Base", network: "Sepolia" },
      "ETH-SEPOLIA": { chain: "ETH", network: "Sepolia" },
    };
    return chainMap[chainValue] || { chain: "Base", network: "Sepolia" };
  };

  // Gateway Transfer mutation
  const withdrawalMutation = useMutation({
    mutationFn: async (data: WithdrawalFormData): Promise<GatewayTransferResponse> => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");

      const { chain, network } = parseChainAndNetwork(data.destinationChain);

      const requestBody: GatewayTransferRequest = {
        amount: data.amount,
        destinationAddress: data.destinationAddress,
        chain,
        network,
        // sourceWallets is optional - let the backend select the optimal wallets
      };

      return apiFetch<GatewayTransferResponse>("/gateway/transfer", {
        token,
        method: "POST",
        body: JSON.stringify(requestBody),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      reset();
      setMaxAmount(aggregatedBalance.toFixed(6));
    },
  });

  const onSubmit = (data: WithdrawalFormData) => {
    withdrawalMutation.mutate(data);
  };

  const getExplorerUrl = (chain: string, txHash?: string) => {
    if (!txHash) return null;
    const chainMap: Record<string, string> = {
      "BASE-SEPOLIA": `https://sepolia.basescan.org/tx/${txHash}`,
      "ETH-SEPOLIA": `https://sepolia.etherscan.io/tx/${txHash}`,
      "ARC-TESTNET": `https://explorer-sepolia.archon.foundation/tx/${txHash}`,
    };
    return chainMap[chain] || null;
  };

  const formatTransactionState = (state: string) => {
    const stateMap: Record<string, { label: string; color: string }> = {
      COMPLETE: { label: "Complete", color: "text-green-600" },
      CONFIRMED: { label: "Confirmed", color: "text-green-600" },
      SENT: { label: "Sent", color: "text-blue-600" },
      PENDING: { label: "Pending", color: "text-yellow-600" },
      FAILED: { label: "Failed", color: "text-red-600" },
      CANCELLED: { label: "Cancelled", color: "text-gray-600" },
    };
    return stateMap[state] || { label: state, color: "text-gray-600" };
  };

  if (balancesLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-text-primary">Withdraw</h1>
        <p className="mt-1 text-text-secondary">
          Transfer USDC from your Circle Unified Wallet to any supported chain
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* From Panel */}
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-subtle text-brand-primary">
              <ArrowDownCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">From</h2>
              <p className="text-sm text-text-muted">Circle Unified Wallet</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-text-muted">Available Balance</p>
            <p className="mt-1 text-3xl font-bold text-text-primary">
              {aggregatedBalance.toFixed(6)} <span className="text-lg font-normal text-text-secondary">USDC</span>
            </p>
          </div>
          <div className="mt-4 rounded-lg bg-background-muted p-3">
            <p className="text-xs text-text-muted">Unified balance across all supported chains</p>
          </div>
        </div>

        {/* To Panel */}
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">To</h2>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Chain Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">
                Destination Chain
              </label>
              <select
                {...register("destinationChain")}
                className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition"
              >
                {SUPPORTED_CHAINS.map((chain) => (
                  <option key={chain.value} value={chain.value}>
                    {chain.label}
                  </option>
                ))}
              </select>
              {errors.destinationChain && (
                <p className="mt-1 text-sm text-error">{errors.destinationChain.message}</p>
              )}
            </div>

            {/* Destination Address */}
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">
                Destination Address
              </label>
              <input
                {...register("destinationAddress")}
                type="text"
                placeholder="0x..."
                className="w-full rounded-lg border border-border bg-white px-4 py-3 font-mono text-sm text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition"
              />
              {errors.destinationAddress && (
                <p className="mt-1 text-sm text-error">{errors.destinationAddress.message}</p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Amount</label>
              <div className="flex gap-2">
                <input
                  {...register("amount")}
                  type="text"
                  placeholder="0.00"
                  className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-brand-primary transition hover:bg-background-muted"
                >
                  MAX
                </button>
              </div>
              {errors.amount && (
                <p className="mt-1 text-sm text-error">{errors.amount.message}</p>
              )}
              <p className="mt-1 text-xs text-text-muted">
                Available: {aggregatedBalance.toFixed(6)} USDC
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || withdrawalMutation.isPending || parseFloat(watchedAmount || "0") > aggregatedBalance}
              className="w-full rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting || withdrawalMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Confirm Transfer"
              )}
            </button>
          </form>

          {withdrawalMutation.isSuccess && (
            <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Gateway transfer initiated successfully</span>
              </div>
              {withdrawalMutation.data?.transactionId && (
                <p className="mt-2 text-xs">Transaction ID: {withdrawalMutation.data.transactionId}</p>
              )}
              {withdrawalMutation.data?.txHash && (
                <p className="mt-1 text-xs">Transaction Hash: {withdrawalMutation.data.txHash}</p>
              )}
            </div>
          )}

          {withdrawalMutation.isError && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                <span>{withdrawalMutation.error instanceof Error ? withdrawalMutation.error.message : "Withdrawal failed"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Transaction History</h2>
        {!(transactionsData?.transactions && transactionsData.transactions.length > 0) ? (
          <div className="py-8 text-center text-text-muted">
            <p>No transactions yet</p>
            <p className="mt-1 text-sm">Your withdrawal history will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-background-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Transaction
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Destination
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(transactionsData?.transactions ?? []).map((tx) => {
                  const stateInfo = formatTransactionState(tx.state);
                  const explorerUrl = getExplorerUrl(tx.destinationChain, tx.transactionHash);
                  return (
                    <tr key={tx.id} className="hover:bg-background-muted/50 transition">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-text-secondary">{tx.id.slice(0, 8)}...</code>
                          {explorerUrl && (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary hover:text-brand-hover"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-text-primary">
                        {parseFloat(tx.amount).toFixed(6)} USDC
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-text-secondary">
                          <div className="font-medium">{tx.destinationChain}</div>
                          <code className="text-xs font-mono">{tx.destinationAddress.slice(0, 10)}...</code>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-sm font-medium ${stateInfo.color}`}>
                          {stateInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-text-muted">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

