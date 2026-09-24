"use client";
import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/hooks/useProfile";
import { validatePasswordPolicy } from "@/lib/utils/passwordPolicy";
import { Lock, Eye, EyeOff, Check, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";

export function ChangePasswordCard() {
  const { flags } = useProfile();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const roleType = flags?.isSuperAdmin ? "super_admin" : flags?.isAdmin ? "admin" : "staff";
  const policy = validatePasswordPolicy(newPassword, roleType);

  const strengthColorMap = {
    weak: "bg-red-500 text-red-700",
    fair: "bg-amber-500 text-amber-700",
    good: "bg-sky-500 text-sky-700",
    strong: "bg-emerald-500 text-emerald-700",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!newPassword) {
      setMessage({ type: "error", text: "Please enter a new password." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    if (!policy.valid) {
      setMessage({ type: "error", text: policy.errors.join(" ") });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Session expired. Please log in again." });
        setLoading(false);
        return;
      }

      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update password." });
      } else {
        setMessage({ type: "success", text: "Your password has been changed successfully!" });
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Network error updating password." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <Lock size={16} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900">Security & Password</h3>
          <p className="text-xs text-zinc-500">Update your account credentials securely</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* New Password Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-600">New Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={roleType === "staff" ? "Min 6 chars (e.g. DOB or PIN)" : "Min 8-10 chars with uppercase & numbers"}
              className="w-full pr-10 pl-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Strength Bar */}
          {newPassword && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-zinc-500">Password Strength:</span>
                <span className="capitalize font-bold text-zinc-700">{policy.strength}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden flex gap-1">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full flex-1 rounded-full transition-all ${
                      policy.score >= step
                        ? strengthColorMap[policy.strength].split(" ")[0]
                        : "bg-zinc-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-600">Confirm New Password</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
          />
        </div>

        {/* Status Feedback */}
        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {message.type === "success" ? (
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !newPassword || !confirmPassword}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Updating Password...</span>
            </>
          ) : (
            <>
              <Check size={16} />
              <span>Save New Password</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
