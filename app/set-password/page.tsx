"use client";

import { useEffect, useState } from "react";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";
import { AlertTriangle, CheckCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const hash = params.get("token_hash");
      const type = params.get("type");
      if (hash && type === "recovery") {
        setTokenHash(hash);
      }
    }
    setReady(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!tokenHash) {
      setError("This password setup link is invalid or missing a verification token.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }

    const policy = validatePasswordPolicy(newPassword, "admin");
    if (!policy.valid) {
      setError(policy.errors[0] || "Password does not meet security requirements.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "This password setup link has already been used or has expired.");
        return;
      }

      setDone(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#EFF6FF] border border-blue-200 text-[#2563EB] flex items-center justify-center">
            <KeyRound size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F172A]">Set Your Password</h1>
            <p className="text-xs text-[#64748B]">CounterCub Store Admin Setup</p>
          </div>
        </div>

        {!ready ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-[#64748B]">
            <Loader2 size={18} className="animate-spin text-[#2563EB]" /> Loading setup page...
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-emerald-200 text-[#16A34A] text-sm flex items-start gap-3">
              <CheckCircle size={18} className="shrink-0 mt-0.5" />
              <span>
                Your password has been set successfully! Redirecting you to the Store Login page...
              </span>
            </div>
            <a
              href="/login"
              className="w-full py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm flex items-center justify-center transition-colors"
            >
              Sign In to Your Store
            </a>
          </div>
        ) : !tokenHash ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#FFFBEB] border border-amber-200 text-amber-800 text-xs flex items-start gap-3 leading-relaxed">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-[#F59E0B]" />
              <span>
                This password setup link is invalid, already used, or expired. If you have already set your password, sign in below.
              </span>
            </div>
            <a
              href="/login"
              className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold flex items-center justify-center border border-[#E2E8F0]"
            >
              Go to Store Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-2xl bg-[#FEF2F2] border border-red-200 text-[#DC2626] text-xs flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#0F172A]">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, upper, lower, digit, symbol"
                  className="w-full h-11 px-3.5 pr-10 rounded-xl bg-white border border-[#E2E8F0] text-[#0F172A] placeholder:text-slate-400 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#0F172A]">Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E2E8F0] text-[#0F172A] placeholder:text-slate-400 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Setting Password...
                </>
              ) : (
                "Set Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
