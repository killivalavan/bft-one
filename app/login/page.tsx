"use client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, Mail, Lock, Eye, EyeOff, LogIn, ShieldAlert, ArrowRight } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";
import { getPlatformAdminUrl, getTenantUrl } from "@/lib/tenant/hostUrls";
import { resolveCanonicalHostname } from "@/lib/tenant/hostnameResolver";
import { getBusinessStoreId } from "@/lib/utils/storeIdGenerator";
import styles from "./login.module.css";

export default function LoginPage() {
  const { business, tenantError } = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [mismatchInfo, setMismatchInfo] = useState<{
    email: string;
    homeBusinessName: string;
    homeBusinessSlug: string;
    isExistingSession?: boolean;
  } | null>(null);

  const [superAdminNotice, setSuperAdminNotice] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();

  // Read ?email= from query string if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get("email");
      if (emailParam) {
        setEmail(emailParam);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (session?.user && isMounted) {
        // Authoritatively check user's assigned workspace before redirecting
        try {
          const res = await fetch("/api/user/me", {
            headers: session.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {},
            cache: "no-store",
          });
          if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
              await supabaseClient.auth
                .signOut({ scope: "local" })
                .catch(() => {});
              return;
            }
          } else {
            const data = await res.json();
            const hostRes =
              typeof window !== "undefined"
                ? resolveCanonicalHostname(window.location.host)
                : null;
            const currentTenantSlug =
              hostRes?.kind === "tenant_workspace"
                ? hostRes.tenantSlug
                : null;

            const isOwnTenantWorkspace = Boolean(
              currentTenantSlug &&
                data?.homeBusiness?.slug &&
                data.homeBusiness.slug.toLowerCase() ===
                  currentTenantSlug.toLowerCase()
            );

            if (data?.flags?.isSuperAdmin && !isOwnTenantWorkspace) {
              supabaseClient.auth
                .signOut({ scope: "local" })
                .catch(() => {});
              if (isMounted) setSuperAdminNotice(true);
              return;
            }

            if (
              currentTenantSlug &&
              data?.homeBusiness?.slug &&
              data.homeBusiness.slug.toLowerCase() !==
                currentTenantSlug.toLowerCase()
            ) {
              // Active session belongs to another store: show mismatch card
              if (isMounted) {
                setMismatchInfo({
                  email: session.user.email || "",
                  homeBusinessName:
                    data.homeBusiness.name || "Assigned Store",
                  homeBusinessSlug: data.homeBusiness.slug,
                  isExistingSession: true,
                });
              }
              return;
            }
          }
        } catch (e) {
          console.warn("Session check error:", e);
        }

        try {
          const storedMode = localStorage.getItem("seyalpro_app_mode");
          if (storedMode === "baker") {
            router.replace("/b2b");
            return;
          }
        } catch {}
        router.replace("/");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function onForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(undefined);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter your account email address to receive a reset link.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetErr } = await supabaseClient.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (resetErr) {
        setError(resetErr.message);
        return;
      }
      setResetSent(true);
    } catch (err: any) {
      setError(err?.message || "Failed to send password reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(undefined);
    setMismatchInfo(null);
    setSuperAdminNotice(false);

    if (tenantError === "TENANT_NOT_FOUND") {
      setError("Workspace not found. Please check the shop URL and try again.");
      return;
    }

    setLoading(true);

    const trimmedIdentifier = email.trim();
    console.log("[CounterCub Login] Initiating login for:", trimmedIdentifier);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Login timed out. Please check your internet connection and try again."
              )
            ),
          10000
        )
      );

      const loginResponse = await Promise.race([
        fetch("/api/public/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: trimmedIdentifier,
            password,
          }),
        }),
        timeoutPromise,
      ]);

      const loginPayload = await loginResponse.json().catch(() => ({}));
      if (!loginResponse.ok || !loginPayload?.session?.access_token || !loginPayload?.session?.refresh_token) {
        setError(loginPayload?.error || "Invalid login credentials");
        setLoading(false);
        return;
      }

      const { data: authData, error } = await Promise.race([
        supabaseClient.auth.setSession({
          access_token: loginPayload.session.access_token,
          refresh_token: loginPayload.session.refresh_token,
        }),
        timeoutPromise,
      ]);

      console.log(
        "[CounterCub Login] Auth response received. Error:",
        error?.message,
        "User ID:",
        authData?.user?.id
      );

      if (error || !authData?.user) {
        setError(error?.message || "Invalid login credentials");
        setLoading(false);
        return;
      }

      const resolvedDisplayEmail =
        authData.user.email || loginPayload.displayIdentifier || trimmedIdentifier;
      const token = authData?.session?.access_token;

      // Authoritatively verify user's profile and workspace membership
      if (authData?.user) {
        let meData: any = null;
        try {
          const res = await fetch("/api/user/me", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
          });
          if (res.ok) {
            meData = await res.json();
            console.log("[CounterCub Login] /api/user/me data:", meData);
          } else {
            console.warn("[CounterCub Login] /api/user/me returned status:", res.status);
          }
        } catch (apiErr) {
          console.warn("[CounterCub Login] Could not query /api/user/me:", apiErr);
        }

        const isSuperAdmin = Boolean(meData?.flags?.isSuperAdmin);

        // 1. Resolve current workspace hostname & user's home business
        const hostRes =
          typeof window !== "undefined"
            ? resolveCanonicalHostname(window.location.host)
            : null;
        const currentTenantSlug =
          hostRes?.kind === "tenant_workspace" ? hostRes.tenantSlug : null;

        const homeBiz = meData?.homeBusiness;
        const isOwnTenantWorkspace = Boolean(
          currentTenantSlug &&
            homeBiz?.slug &&
            homeBiz.slug.toLowerCase() === currentTenantSlug.toLowerCase()
        );

        // 2. Super Admin accounts must sign in via the dedicated platform admin portal
        // unless they are signing into their own assigned home store workspace.
        if (isSuperAdmin && !isOwnTenantWorkspace) {
          console.log("[CounterCub Login] Detected Super Admin on non-home login");
          supabaseClient.auth
            .signOut({ scope: "local" })
            .catch(() => {});
          try {
            localStorage.removeItem("bftone_tenant_cache");
          } catch {}
          setSuperAdminNotice(true);
          setLoading(false);
          return;
        }

        console.log("[CounterCub Login] Workspace check:", {
          currentTenantSlug,
          homeBizSlug: homeBiz?.slug,
        });

        if (
          currentTenantSlug &&
          homeBiz?.slug &&
          homeBiz.slug.toLowerCase() !== currentTenantSlug.toLowerCase()
        ) {
          console.log("[CounterCub Login] Showing Wrong Workspace card for:", homeBiz.slug);
          // Immediately wipe the session on this store's origin to prevent cross-origin state leakage
          supabaseClient.auth
            .signOut({ scope: "local" })
            .catch(() => {});
          try {
            localStorage.removeItem("bftone_tenant_cache");
          } catch {}
          try {
            localStorage.removeItem("bftone_display_email");
          } catch {}
          setMismatchInfo({
            email: resolvedDisplayEmail,
            homeBusinessName: homeBiz.name || "Assigned Store",
            homeBusinessSlug: homeBiz.slug,
            isExistingSession: false,
          });
          setLoading(false);
          return;
        }

        if (currentTenantSlug && !homeBiz) {
          supabaseClient.auth
            .signOut({ scope: "local" })
            .catch(() => {});
          try {
            localStorage.removeItem("bftone_tenant_cache");
          } catch {}
          setError(
            "Access denied: Your account is not assigned to any shop workspace."
          );
          setLoading(false);
          return;
        }
      }

      try {
        localStorage.setItem("bftone_display_email", resolvedDisplayEmail);
      } catch {}
      try {
        localStorage.removeItem("bftone_tenant_cache");
      } catch {}

      try {
        const storedMode =
          typeof window !== "undefined"
            ? localStorage.getItem("seyalpro_app_mode")
            : null;
        if (storedMode === "baker") {
          window.location.href = "/b2b";
          return;
        }
      } catch {}

      window.location.href = "/";
    } catch (err: unknown) {
      console.error("Login failure:", err);
      setError(
        (err instanceof Error && err.message) ||
          "An unexpected error occurred during login."
      );
      setLoading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section
        className={styles.hero}
        role="img"
        aria-label="CounterCub — Smarter Business. Simpler Operations. Manage your shop, team, sales and inventory in one place."
      />

      <main className={styles.panel}>
        <div className={styles.inner}>
          <header className={styles.brand}>
            <h1 className={styles.wordmark}>
              <span className={styles.wordmarkSeyal}>Counter</span>
              <span className={styles.wordmarkPro}>Cub</span>
            </h1>
            {business?.id && business?.name ? (
              <div className={styles.workspaceBadge}>
                <span>Workspace:</span>
                <span>{business.name}</span>
              </div>
            ) : (
              <p className={styles.tagline}>
                Enterprise Business Operating System
              </p>
            )}
          </header>

          {/* Cross-Tenant Workspace Mismatch Card */}
          {mismatchInfo ? (
            <div className={styles.card}>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs">
                  <ShieldAlert size={28} />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-slate-900">
                    Wrong Workspace
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    Your account (
                    <strong className="text-slate-800 font-semibold">
                      {mismatchInfo.email}
                    </strong>
                    ) belongs to{" "}
                    <strong className="text-blue-600 font-bold">
                      {mismatchInfo.homeBusinessName}
                    </strong>
                    {business?.name ? (
                      <>
                        , not{" "}
                        <strong className="text-slate-800 font-semibold">
                          {business.name}
                        </strong>
                      </>
                    ) : (
                      ""
                    )}
                    .
                  </p>
                </div>

                <div className="w-full pt-2 space-y-2.5">
                  <a
                    href={getTenantUrl(
                      mismatchInfo.homeBusinessSlug,
                      `/login?email=${encodeURIComponent(mismatchInfo.email)}`
                    )}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                  >
                    <span>Go to {mismatchInfo.homeBusinessName} Login</span>
                    <ArrowRight size={16} />
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      supabaseClient.auth
                        .signOut({ scope: "local" })
                        .catch(() => {});
                      setMismatchInfo(null);
                      setPassword("");
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all cursor-pointer"
                  >
                    Try Another Account
                  </button>
                </div>
              </div>
            </div>
          ) : superAdminNotice ? (
            /* Super Admin Redirect Card */
            <div className={styles.card}>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-xs">
                  <Lock size={28} />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-slate-900">
                    Platform Administrator
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    CounterCub Platform Administrator accounts must sign in
                    through the centralized Platform Portal with 2FA.
                  </p>
                </div>

                <div className="w-full pt-2 space-y-2.5">
                  <a
                    href={getPlatformAdminUrl("/super-admin-login")}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                  >
                    <span>Go to Platform Portal (2FA Login)</span>
                    <ArrowRight size={16} />
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      setSuperAdminNotice(false);
                      setPassword("");
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all cursor-pointer"
                  >
                    Back to Store Login
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Standard Store Login Card */
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{forgotMode ? "Reset Password" : "Welcome Back"}</h2>
                <p className={styles.cardSubtitle}>
                  {forgotMode ? "Enter your email to receive a reset link" : "Sign in to access your workspace"}
                </p>
              </div>

              {forgotMode ? (
                <form onSubmit={onForgotPassword} className={styles.form} aria-busy={loading}>
                  <div className={styles.field}>
                    <label htmlFor="reset-email" className={styles.label}>
                      Account Email
                    </label>
                    <div className={styles.control}>
                      <Mail className={styles.leadingIcon} aria-hidden="true" />
                      <input
                        id="reset-email"
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                      />
                    </div>
                  </div>

                  {resetSent && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                      If an account exists for {email.trim()}, a password reset link has been sent.
                    </div>
                  )}

                  {error && (
                    <div id="login-error" role="alert" className={styles.error}>
                      {error}
                    </div>
                  )}

                  <button type="submit" className={styles.submit} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 size={18} className={styles.spinner} aria-hidden="true" />
                        <span>Sending…</span>
                      </>
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setResetSent(false);
                      setError(undefined);
                    }}
                    className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 py-1.5 cursor-pointer"
                  >
                    Back to Store Login
                  </button>
                </form>
              ) : (
              <form
                onSubmit={onLogin}
                className={styles.form}
                aria-busy={loading}
              >
                <div className={styles.field}>
                  <label htmlFor="login-email" className={styles.label}>
                    Store Reference ID, Employee ID, or Mail ID
                  </label>
                  <div className={styles.control}>
                    <Mail className={styles.leadingIcon} aria-hidden="true" />
                    <input
                      id="login-email"
                      name="email"
                      type="text"
                      inputMode="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      placeholder={`e.g. KBS74713, ${getBusinessStoreId(business).employeePrefix || "ck"}10121997, or owner@store.com`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "login-error" : undefined}
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className={styles.label}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(true);
                        setResetSent(false);
                        setError(undefined);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className={styles.control}>
                    <Lock className={styles.leadingIcon} aria-hidden="true" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "login-error" : undefined}
                      className={`${styles.input} ${styles.inputWithToggle}`}
                    />
                    <button
                      type="button"
                      id="login-toggle-password"
                      className={styles.toggle}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      aria-controls="login-password"
                    >
                      {showPassword ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div id="login-error" role="alert" className={styles.error}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  id="login-submit"
                  className={styles.submit}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2
                        size={18}
                        className={styles.spinner}
                        aria-hidden="true"
                      />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={18} aria-hidden="true" />
                      <span>Access Dashboard</span>
                    </>
                  )}
                </button>
              </form>
              )}
            </div>
          )}

          <footer className={styles.footer}>
            <p>
              &copy; {new Date().getFullYear()} {business?.name || "CounterCub"}.
              All rights reserved.
            </p>
            <a
              href={getPlatformAdminUrl("/super-admin-login")}
              id="login-root-portal"
              className={styles.rootLink}
            >
              Platform Root Portal (2FA)
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}
