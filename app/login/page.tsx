"use client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";
import styles from "./login.module.css";

export default function LoginPage() {
  const { business } = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasTenantParam, setHasTenantParam] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasParam = new URLSearchParams(window.location.search).has("tenant");
      setHasTenantParam(hasParam);
    }

    let isMounted = true;
    (async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.user && isMounted) {
        try {
          const storedMode = localStorage.getItem("seyalpro_app_mode");
          if (storedMode === "baker") {
            router.replace("/b2b");
            return;
          }
        } catch { }
        router.replace("/");
      }
    })();

    return () => { isMounted = false; };
  }, [router]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // prevent duplicate submissions
    setError(undefined);
    setLoading(true);

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const loginPromise = supabaseClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out. Please check your internet connection and try again.")), 10000)
      );

      const { data: authData, error } = await Promise.race([loginPromise, timeoutPromise]);

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      try { localStorage.setItem('bftone_display_email', normalizedEmail); } catch { }
      try { localStorage.removeItem('bftone_tenant_cache'); } catch { }

      // Check if user is Super Admin -> Require 2FA on Super Admin Portal
      if (normalizedEmail === 'admin@seyalpro.com') {
        window.location.href = "/super-admin/login";
        return;
      }

      if (authData?.user) {
        try {
          const { data: prof } = await supabaseClient
            .from('profiles')
            .select('is_super_admin, business_id')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (prof?.is_super_admin) {
            window.location.href = "/super-admin/login";
            return;
          }

          if (prof?.business_id) {
            const { data: biz } = await supabaseClient
              .from('businesses')
              .select('slug, enabled_modules')
              .eq('id', prof.business_id)
              .maybeSingle();

            if (biz?.slug) {
              document.cookie = `tenant_slug=${biz.slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
            }

            const isBaker = Boolean(biz?.enabled_modules?.baker_mode);
            const isBilling = biz?.enabled_modules?.billing !== false;
            let storedMode = "cafe";
            try {
              storedMode = localStorage.getItem("seyalpro_app_mode") || "cafe";
            } catch { }

            if (isBaker && (!isBilling || storedMode === "baker")) {
              window.location.href = "/b2b";
              return;
            }
          }
        } catch (bizErr) {
          console.warn("Tenant profile resolve error:", bizErr);
        }
      }

      try {
        const storedMode = typeof window !== "undefined" ? localStorage.getItem("seyalpro_app_mode") : null;
        if (storedMode === "baker") {
          window.location.href = "/b2b";
          return;
        }
      } catch { }

      // Standard shop user/admin redirect to shop dashboard
      window.location.href = "/";
    } catch (err: unknown) {
      console.error("Login failure:", err);
      setError((err instanceof Error && err.message) || "An unexpected error occurred during login.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section
        className={styles.hero}
        role="img"
        aria-label="SeyalPro — Smarter Business. Simpler Operations. Manage your shop, team, sales and inventory in one place."
      />

      <main className={styles.panel}>
        <div className={styles.inner}>
          <header className={styles.brand}>
            <h1 className={styles.wordmark}>
              <span className={styles.wordmarkSeyal}>Seyal</span>
              <span className={styles.wordmarkPro}>Pro</span>
            </h1>
            {hasTenantParam && business?.name ? (
              <div className={styles.workspaceBadge}>
                <span>Workspace:</span>
                <span>{business.name}</span>
              </div>
            ) : (
              <p className={styles.tagline}>Enterprise Business Operating System</p>
            )}
          </header>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Welcome Back</h2>
              <p className={styles.cardSubtitle}>Sign in to access your workspace</p>
            </div>

            <form onSubmit={onLogin} className={styles.form} aria-busy={loading}>
              <div className={styles.field}>
                <label htmlFor="login-email" className={styles.label}>Email</label>
                <div className={styles.control}>
                  <Mail className={styles.leadingIcon} aria-hidden="true" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="login-password" className={styles.label}>Password</label>
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
                    onChange={e => setPassword(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    className={`${styles.input} ${styles.inputWithToggle}`}
                  />
                  <button
                    type="button"
                    id="login-toggle-password"
                    className={styles.toggle}
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    aria-controls="login-password"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
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
                    <Loader2 size={18} className={styles.spinner} aria-hidden="true" />
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
          </div>

          <footer className={styles.footer}>
            <p>&copy; {new Date().getFullYear()} {business?.name || "SeyalPro"}. All rights reserved.</p>
            <a href="/super-admin/login" id="login-root-portal" className={styles.rootLink}>
              Platform Root Portal (2FA)
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}
