"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { validatePasswordPolicy, type UserRoleType } from "@/lib/utils/passwordPolicy";
import { Lock, CheckCircle, AlertTriangle, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pendingTokenHash, setPendingTokenHash] = useState<string | null>(null);
  const [role, setRole] = useState<UserRoleType>("admin");
  const [isSuperAdminHost, setIsSuperAdminHost] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const superHost = host.startsWith("app.");
    setIsSuperAdminHost(superHost);

    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session?.user) {
        setHasSession(true);
        setReady(true);
      }
    });

    (async () => {
      try {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const tokenHash = params.get("token_hash");
          const otpType = params.get("type");
          if (tokenHash && otpType === "recovery") {
            setPendingTokenHash(tokenHash);
            setHasSession(true);
            setReady(true);
            return;
          }
          const code = params.get("code");
          if (code) {
            await supabaseClient.auth.exchangeCodeForSession(code).catch(() => {});
          }
        }
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!mounted) return;
        if (session?.user) {
          setHasSession(true);
          try {
            const res = await fetch("/api/user/me", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: "no-store",
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.flags?.isSuperAdmin) setRole("super_admin");
              else if (data?.flags?.isAdmin) setRole("admin");
              else setRole("staff");
            }
          } catch {}
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    const policy = validatePasswordPolicy(newPassword, isSuperAdminHost ? "super_admin" : role);
    if (!policy.valid) {
      setError(policy.errors[0] || "Password does not meet security requirements.");
      return;
    }

    setSubmitting(true);
    try {
      if (pendingTokenHash) {
        const { error: otpErr } = await supabaseClient.auth.verifyOtp({
          token_hash: pendingTokenHash,
          type: "recovery",
        });
        if (otpErr) {
          setError(otpErr.message || "This password setup link has expired or already been used.");
          return;
        }
      }
      const { error: updateErr } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  }

  const loginHref = isSuperAdminHost || role === "super_admin" ? "/super-admin-login" : "/login";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
            <Lock size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              {pendingTokenHash ? "Set Your Password" : "Reset Password"}
            </h1>
            <p className="text-xs text-slate-400">
              {isSuperAdminHost ? "CounterCub Platform Portal" : "CounterCub Workspace"}
            </p>
          </div>
        </div>

        {!ready ? (
          <div className="py-8 flex flex-col items-center gap-3 text-slate-400 text-xs">
            <Loader2 className="animate-spin text-blue-500" size={24} />
            <span>Verifying recovery link...</span>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>Your password has been updated. You can now sign in with your new password.</span>
            </div>
            <a
              href={loginHref}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <span>Continue to Sign In</span>
            </a>
          </div>
        ) : !hasSession ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <span>This password reset link is invalid or has expired. Request a new reset link from the login page.</span>
            </div>
            <a
              href={loginHref}
              className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700"
            >
              <ArrowLeft size={14} />
              <span>Back to Sign In</span>
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  className="w-full h-11 px-3.5 pr-10 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {isSuperAdminHost || role === "super_admin"
                  ? "At least 10 chars with uppercase, lowercase, number, and special character."
                  : "At least 8 chars with uppercase, lowercase, and a number or special character."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirm New Password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter new password"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <span>Save New Password</span>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

