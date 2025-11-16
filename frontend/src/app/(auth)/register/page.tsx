"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [error, setError] = useState<string | null>(null);

  const getOAuthUrl = () => {
    const base =
      process.env.NEXT_PUBLIC_BACKEND_OAUTH_BASE ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:3000";
    const normalized = base.replace(/\/api$/, "");
    return `${normalized}/auth/google`;
  };

  const onSubmit = async (values: FormValues) => {
    try {
      setError(null);
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <div className="rounded-3xl bg-surface p-8 shadow-card border-2 border-card-border">
      <div className="mb-6 space-y-2 text-center text-text-primary">
        <h1 className="text-2xl font-semibold">
          Create an account
        </h1>
        <p className="text-sm opacity-90">
          Start managing your Circle-powered APIs
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="text-sm font-medium text-text-primary">
              Email address
            </label>
            <input
              type="email"
              className="mt-2 w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-sm text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition"
              placeholder="you@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">
              Password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-sm text-text-primary focus:border-border-focus focus:ring-2 focus:ring-brand-subtle focus:outline-none transition"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">
                {errors.password.message}
              </p>
            )}
          </div>

        {error && (
          <div className="rounded-xl bg-red-50/80 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand-primary px-4 py-3 text-base font-semibold text-black transition hover:bg-brand-hover disabled:opacity-60 shadow-sm"
        >
          {isSubmitting ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wider text-text-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        onClick={() => (window.location.href = getOAuthUrl())}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-text-primary transition hover:bg-background-muted"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4">
          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.64,6.053,29.082,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,14,24,14c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.64,6.053,29.082,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.197l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.616-3.317-11.277-7.946l-6.548,5.046C9.486,39.556,16.227,44,24,44z" />
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.793,2.238-2.231,4.166-4.087,5.565c0,0,0.001,0,0.001,0l6.19,5.238 C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
        </svg>
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-text-primary">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}

