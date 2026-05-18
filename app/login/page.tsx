"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(next);
        router.refresh();
      } else {
        setError(data.error ?? "Sign in failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #15803d, #22c55e)",
              boxShadow: "0 2px 12px rgba(74, 222, 128, 0.25)",
            }}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ color: "#052e16" }}
            >
              local_shipping
            </span>
          </div>
          <div className="leading-tight">
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              KDEXPRESS
            </h1>
            <p
              className="text-[10px] mt-0.5 tracking-[0.12em] font-medium lowercase"
              style={{ color: "var(--text-muted)" }}
            >
              fulfillment.hub
            </p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-4">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="filter-label">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
                className="filter-input"
              />
            </div>

            <div>
              <label className="filter-label">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
                className="filter-input"
              />
            </div>

            {error && (
              <div
                className="text-xs px-3 py-2 rounded font-medium"
                style={{
                  backgroundColor: "rgba(220, 38, 38, 0.10)",
                  color: "var(--color-danger)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="btn btn-primary w-full justify-center mt-4"
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
