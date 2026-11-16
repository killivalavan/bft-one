"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
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
      // Single-use OTP verification: consumes the token immediately in Supabase Auth
      const { error: otpErr } = await supabaseClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (otpErr) {
        setError("This password setup link has already been used or has expired.");
        return;
      }

      const { error: updateErr } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setError(updateErr.message || "Unable to save your password.");
        return;
      }

      // Sign out temporary recovery session so the Store Admin signs in cleanly at /login
      await supabaseClient.auth.signOut().catch(() => {});
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
            <KeyRound size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Set Your Password</h1>
            <p className="text-xs text-slate-400">CounterCub Store Admin Setup</p>
          </div>
        </div>

        {!ready ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" /> Loading setup page...
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3">
              <CheckCircle size={18} className="shrink-0 mt-0.5" />
              <span>
                Your password has been set successfully. This one-time setup link is now expired.
              </span>
            </div>
            <a
              href="/login"
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center transition-colors"
            >
              Sign In to Your Store
            </a>
          </div>
        ) : !tokenHash ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 leading-relaxed">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                This password setup link is invalid, already used, or expired. If you have already set your password, sign in below.
              </span>
            </div>
            <a
              href="/login"
              className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center"
            >
              Go to Store Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, upper, lower, digit, symbol"
                  className="w-full h-11 px-3.5 pr-10 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full h-11 px-3.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
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

