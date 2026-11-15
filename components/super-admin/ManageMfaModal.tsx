"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ShieldCheck, Smartphone, Trash2, Plus, Loader2, X, AlertTriangle } from "lucide-react";

type TotpFactor = { id: string; friendly_name?: string | null; status: string; created_at?: string };

/**
 * Super Admin 2FA device management (requires an active AAL2 session).
 * - Add a backup authenticator (QR enrollment + 6-digit verification).
 * - Remove a device only after step-up verification with a *different* verified device,
 *   and never the last verified device (prevents self-lockout / 2FA removal).
 */
export function ManageMfaModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [busy, setBusy] = useState(false);

  // Enrollment state
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [deviceName, setDeviceName] = useState("Backup Authenticator");
  const [enrollCode, setEnrollCode] = useState("");

  // Removal state
  const [removing, setRemoving] = useState<TotpFactor | null>(null);
  const [removeCode, setRemoveCode] = useState("");

  const loadFactors = useCallback(async () => {
    setLoading(true);
    const { data } = await supabaseClient.auth.mfa.listFactors();
    setFactors(((data?.totp || []) as TotpFactor[]).filter((f) => f.status === "verified"));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  async function requireAal2(): Promise<boolean> {
    const { data } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== "aal2") {
      toast({ title: "2FA session required", description: "Please sign in again with 2FA.", variant: "error" });
      return false;
    }
    return true;
  }

  async function cancelPending() {
    if (pending) {
      await supabaseClient.auth.mfa.unenroll({ factorId: pending.id }).catch(() => {});
    }
    setPending(null);
    setEnrollCode("");
  }

  async function handleClose() {
    await cancelPending();
    onClose();
  }

  async function startEnroll() {
    if (!(await requireAal2())) return;
    const name = deviceName.trim() || "Backup Authenticator";
    if (factors.some((f) => (f.friendly_name || "").toLowerCase() === name.toLowerCase())) {
      toast({ title: "Name already used", description: "Choose a different device name.", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      // Clear abandoned unverified enrollments first (listFactors().totp excludes them)
      const { data: all } = await supabaseClient.auth.mfa.listFactors();
      for (const f of all?.all || []) {
        if (f.factor_type === "totp" && f.status !== "verified") {
          await supabaseClient.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
        }
      }
      const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: "totp", friendlyName: name });
      if (error || !data) throw error || new Error("Enrollment failed");
      setPending({ id: data.id, qr: data.totp?.qr_code || "", secret: data.totp?.secret || "" });
    } catch (err: any) {
      toast({ title: "Could not start enrollment", description: err?.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    if (!pending || enrollCode.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: pending.id, code: enrollCode });
      if (error) throw new Error("Invalid code. Check the new device and try again.");
      toast({ title: "Backup device added", variant: "success" });
      setPending(null);
      setEnrollCode("");
      setDeviceName("Backup Authenticator");
      await loadFactors();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err?.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Step-up must use a device OTHER than the one being removed (proves you still hold a working device)
  const stepUpFactor = removing ? factors.find((f) => f.id !== removing.id) : undefined;

  async function confirmRemove() {
    if (!removing || !stepUpFactor || removeCode.length !== 6) return;
    if (factors.length < 2) {
      toast({ title: "Cannot remove last device", variant: "error" });
      return;
    }
    if (!(await requireAal2())) return;
    setBusy(true);
    try {
      const { error: stepErr } = await supabaseClient.auth.mfa.challengeAndVerify({
        factorId: stepUpFactor.id,
        code: removeCode,
      });
      if (stepErr) throw new Error(`Invalid code from "${stepUpFactor.friendly_name || "other device"}".`);
      const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: removing.id });
      if (error) throw error;
      await supabaseClient.auth.refreshSession().catch(() => {});
      toast({ title: "Device removed", variant: "success" });
      setRemoving(null);
      setRemoveCode("");
      await loadFactors();
    } catch (err: any) {
      toast({ title: "Removal failed", description: err?.message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const codeInput = (value: string, set: (v: string) => void) => (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="6-digit code"
      className="font-mono tracking-[0.4em] text-center"
    />
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-[#E2E8F0] shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">Manage 2FA Devices</h3>
              <p className="text-xs text-[#64748B]">Add a backup authenticator so a lost phone never locks you out.</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Device list */}
        <div className="space-y-2">
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={20} /></div>
          ) : (
            factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-xl border border-[#E2E8F0] bg-slate-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone size={16} className="text-[#2563EB] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{f.friendly_name || "Authenticator"}</p>
                    {f.created_at && (
                      <p className="text-[11px] text-[#64748B]">Added {new Date(f.created_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={factors.length < 2 || busy}
                  title={factors.length < 2 ? "Add a backup device before removing your only device" : "Remove device"}
                  onClick={() => { setRemoving(f); setRemoveCode(""); }}
                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
          {!loading && factors.length < 2 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>You only have one 2FA device. Add a backup now — if you lose it, recovery requires the Supabase Dashboard.</span>
            </div>
          )}
        </div>

        {/* Remove confirmation (step-up with another device) */}
        {removing && stepUpFactor && (
          <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/60 space-y-3">
            <p className="text-xs text-rose-800">
              To remove <b>{removing.friendly_name || "this device"}</b>, enter the current code from{" "}
              <b>{stepUpFactor.friendly_name || "your other device"}</b>.
            </p>
            {codeInput(removeCode, setRemoveCode)}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setRemoving(null)} className="flex-1 rounded-xl cursor-pointer">
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || removeCode.length !== 6}
                onClick={confirmRemove}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : "Remove Device"}
              </Button>
            </div>
          </div>
        )}

        {/* Add backup device */}
        {!removing && (
          <div className="pt-1 border-t border-[#E2E8F0] space-y-3">
            {!pending ? (
              <div className="flex gap-2 pt-3">
                <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Device name" />
                <Button
                  type="button"
                  disabled={busy}
                  onClick={startEnroll}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={15} /> Add Device</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 pt-3">
                <p className="text-xs text-[#334155]">Scan with the <b>new</b> device (Google Authenticator, 1Password, etc.), then enter its 6-digit code.</p>
                {pending.qr && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pending.qr} alt="2FA QR code" className="w-44 h-44 rounded-xl border border-[#E2E8F0] bg-white p-2" />
                  </div>
                )}
                <p className="text-[11px] text-center text-[#64748B] break-all font-mono">{pending.secret}</p>
                {codeInput(enrollCode, setEnrollCode)}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={cancelPending} className="flex-1 rounded-xl cursor-pointer">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || enrollCode.length !== 6}
                    onClick={verifyEnroll}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl cursor-pointer"
                  >
                    {busy ? <Loader2 className="animate-spin" size={16} /> : "Verify & Add"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

