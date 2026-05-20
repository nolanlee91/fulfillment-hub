"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
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
        <div className="card p-6">
          <div className="flex flex-col items-center gap-2 mb-6">
            <Image
              src="/logo.png"
              alt="KDExpress"
              width={187}
              height={92}
              priority
              className="h-14 w-auto"
            />
            <p
              className="text-[10px] tracking-[0.12em] font-medium lowercase"
              style={{ color: "var(--text-muted)" }}
            >
              fulfillment.hub
            </p>
          </div>

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
