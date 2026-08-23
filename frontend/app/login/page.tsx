"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, classifyApiError } from "@/lib/api";
import { setTokens } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await api.login(email, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      router.push("/");
    } catch (err) {
      setError(classifyApiError(err).hint || "Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card animate-in w-full max-w-sm p-7">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: "#0d0d0d" }} aria-hidden="true">
          <svg width="21" height="21" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="16,18 32,18 32,82 16,82" fill="#ffffff" />
            <polygon points="68,18 84,18 84,82 68,82" fill="#ffffff" />
            <polygon points="16,18 32,18 84,82 68,82" fill="#0bb981" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sign in to Nexora</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            AI-powered market research, gated to your account.
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••••"
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-1 w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        No account yet?{" "}
        <Link href="/register" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Create one
        </Link>
      </p>
    </div>
  );
}
