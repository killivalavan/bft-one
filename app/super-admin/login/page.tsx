"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Globe, Shield, KeyRound, Lock, Sparkles, Loader2,
  CheckCircle, AlertTriangle, ArrowRight, ArrowLeft, Copy, Check, QrCode, Smartphone
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type AuthStep = "credentials" | "mfa_challenge" | "mfa_enroll";

export default function SuperAdminLoginPage() {
  const [step, setStep] = useState<AuthStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // MFA State
  const [factorId, setFactorId] = useState<string>("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first OTP input when reaching 2FA step
  useEffect(() => {
    if (step === "mfa_challenge" || step === "mfa_enroll") {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  // Handle standard Email + Password submission
  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // 1. Authenticate with Supabase
      const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authErr || !authData?.user) {
        throw new Error(authErr?.message || "Invalid credentials. Please verify your email and password.");
      }

      // 2. Strict Super Admin Role Verification
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("is_super_admin")
        .eq("id", authData.user.id)
        .maybeSingle();

      const isSuper =
        !!profile?.is_super_admin ||
        normalizedEmail === "admin@seyalpro.com";

      if (!isSuper) {
        // Block client admins & staff from using this portal
        await supabaseClient.auth.signOut();
        throw new Error(
          "Access Denied: This portal is exclusively reserved for SeyalPro Platform Owners. Store accounts must use the shop login."
        );
      }

      // Persist email identifier for active session
      try {
        localStorage.setItem("bftone_display_email", normalizedEmail);
      } catch {}

      // 3. Check 2FA (MFA) Enrollment
      const { data: factorsData, error: factorsErr } = await supabaseClient.auth.mfa.listFactors();

      if (factorsErr) {
        console.warn("Could not list MFA factors:", factorsErr);
      }

      const totpFactors = factorsData?.totp || [];
      const verifiedFactor = totpFactors.find((f) => f.status === "verified");

      if (verifiedFactor) {
        // 2FA is already enrolled -> Prompt for 6-digit TOTP challenge
        setFactorId(verifiedFactor.id);
        setStep("mfa_challenge");
      } else {
        // First time 2FA setup -> Enroll new TOTP factor & present QR Code
        const { data: enrollData, error: enrollErr } = await supabaseClient.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "SeyalPro Command Authenticator",
        });

        if (enrollErr || !enrollData) {
          throw new Error(enrollErr?.message || "Failed to initialize 2-Factor Authentication enrollment.");
        }

        setFactorId(enrollData.id);
        setQrCodeUrl(enrollData.totp?.qr_code || "");
        setSecretKey(enrollData.totp?.secret || "");
        setStep("mfa_enroll");
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  // Handle OTP digit changes with auto-focus next
  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      // Handle pasting whole 6-digit code
      const cleaned = value.replace(/\D/g, "").slice(0, 6);
      if (cleaned.length > 0) {
        const newOtp = [...otpCode];
        for (let i = 0; i < 6; i++) {
          newOtp[i] = cleaned[i] || "";
        }
        setOtpCode(newOtp);
        const focusIdx = Math.min(cleaned.length, 5);
        otpInputsRef.current[focusIdx]?.focus();
        if (cleaned.length === 6) {
          submitOtp(newOtp.join(""));
        }
      }
      return;
    }

    const newOtp = [...otpCode];
    newOtp[index] = value.replace(/\D/g, "");
    setOtpCode(newOtp);

    // Advance focus
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // Auto submit when complete
    const fullCode = newOtp.join("");
    if (fullCode.length === 6 && !newOtp.includes("")) {
      submitOtp(fullCode);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  }

  // Verify the 6-digit TOTP code
  async function submitOtp(codeToVerify?: string) {
    const code = codeToVerify || otpCode.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits from your Authenticator app.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (step === "mfa_challenge") {
        // Verify existing challenge
        const { data: challengeData, error: challengeErr } = await supabaseClient.auth.mfa.challengeAndVerify({
          factorId,
          code,
        });

        if (challengeErr) {
          throw new Error("Invalid 2FA code. Please check your Authenticator app and try again.");
        }
      } else if (step === "mfa_enroll") {
        // First-time enrollment verification
        const { data: challenge, error: challengeErr } = await supabaseClient.auth.mfa.challenge({
          factorId,
        });

        if (challengeErr) throw new Error(challengeErr.message);

        const { data: verifyData, error: verifyErr } = await supabaseClient.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code,
        });

        if (verifyErr) {
          throw new Error("Invalid verification code. Please confirm the secret key in your app.");
        }
      }

      // Success: Redirect to Super Admin Hub
      window.location.href = "/super-admin";
    } catch (err: any) {
      setError(err.message || "2FA verification failed.");
      setLoading(false);
    }
  }

  function copySecret() {
    if (typeof navigator !== "undefined" && navigator.clipboard && secretKey) {
      navigator.clipboard.writeText(secretKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-600/15 via-sky-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-600/30 ring-1 ring-white/20 mb-1">
            <Globe size={28} className="animate-pulse" />
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider border border-indigo-400/30 backdrop-blur-md">
              <Shield size={12} className="text-indigo-400" />
              <span>SeyalPro Command Center</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>2FA Secured</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Root Platform Portal
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm max-w-sm mx-auto">
            {step === "credentials" && "Authorized SaaS owner login with hardware/TOTP 2-Factor Authentication."}
            {step === "mfa_challenge" && "Enter the 6-digit verification code from your Authenticator app."}
            {step === "mfa_enroll" && "Scan the QR code below with Google Authenticator or 1Password to activate 2FA."}
          </p>
        </div>

        {/* Card Frame */}
        <Card className="border border-slate-800 bg-slate-900/90 backdrop-blur-2xl shadow-2xl shadow-black/50 rounded-3xl overflow-hidden ring-1 ring-slate-700/50">
          <CardHeader className="bg-slate-950/60 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Lock size={14} className="text-indigo-400" />
              <span>
                {step === "credentials" ? "Step 1: Identity Verification" : "Step 2: Two-Factor Security Check"}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {step === "credentials" ? "1 / 2" : "2 / 2"}
            </span>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-6">
            
            {/* STEP 1: CREDENTIALS */}
            {step === "credentials" && (
              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider flex items-center justify-between">
                    <span>Master Admin Email</span>
                    <span className="text-[11px] text-indigo-400 normal-case font-medium">admin@seyalpro.com</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="admin@seyalpro.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 bg-slate-950/70 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider">
                    Master Password
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 bg-slate-950/70 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl transition-all font-mono"
                  />
                </div>

                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-start gap-2.5 animate-in slide-in-from-top-1">
                    <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  block
                  disabled={loading}
                  className="h-11 bg-gradient-to-r from-sky-500 via-indigo-600 to-indigo-700 hover:from-sky-400 hover:to-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <>
                      <span>Continue to 2FA Verification</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* STEP 2A: 2FA TOTP CHALLENGE */}
            {step === "mfa_challenge" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                    <Smartphone size={32} className="animate-bounce" />
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Two-Factor Code
                  </h3>
                  <p className="text-xs text-slate-400">
                    Open your Authenticator app (Google Authenticator / Authy) and enter the 6-digit code.
                  </p>
                </div>

                {/* 6-Digit Code Inputs */}
                <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                  {otpCode.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black font-mono bg-slate-950/80 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
                    />
                  ))}
                </div>

                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <Button
                    onClick={() => submitOtp()}
                    block
                    disabled={loading || otpCode.join("").length !== 6}
                    className="h-11 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <span>Verify & Access Command Center</span>}
                  </Button>

                  <button
                    onClick={() => {
                      setStep("credentials");
                      setOtpCode(["", "", "", "", "", ""]);
                      setError(null);
                    }}
                    className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 py-1"
                  >
                    <ArrowLeft size={13} />
                    <span>Back to Credentials</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2B: FIRST TIME 2FA ENROLLMENT */}
            {step === "mfa_enroll" && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-center space-y-3">
                  <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    First-Time 2FA Activation Required
                  </p>

                  {/* QR Code Container */}
                  {qrCodeUrl ? (
                    <div className="inline-flex p-3 rounded-xl bg-white shadow-xl">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-44 h-44" />
                    </div>
                  ) : (
                    <div className="w-44 h-44 mx-auto rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}

                  {/* Secret Key Copy */}
                  {secretKey && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-400">Can't scan? Enter key manually:</p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-indigo-300 max-w-full truncate">
                        <span className="truncate">{secretKey}</span>
                        <button
                          type="button"
                          onClick={copySecret}
                          className="hover:text-white transition-colors p-1"
                          title="Copy Secret Key"
                        >
                          {copiedKey ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider block text-center">
                    Enter the 6-Digit Code from your app to confirm:
                  </label>
                  <div className="flex items-center justify-center gap-2">
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputsRef.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-10 h-12 text-center text-xl font-bold font-mono bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                    {error}
                  </div>
                )}

                <Button
                  onClick={() => submitOtp()}
                  block
                  disabled={loading || otpCode.join("").length !== 6}
                  className="h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Activate 2FA & Enter Portal"}
                </Button>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-2 text-xs text-slate-500">
          <Link
            href="/login"
            className="hover:text-slate-300 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={13} />
            <span>Regular Client Shop Login</span>
          </Link>

          <span className="font-mono text-[11px] text-slate-600">
            TLS 1.3 • AES-256 Encrypted
          </span>
        </div>

      </div>
    </div>
  );
}
