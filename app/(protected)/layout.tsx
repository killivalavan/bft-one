"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useUser();
  const { flags, loading: profileLoading } = useProfile();
  const { status: tenantStatus } = useTenant();
  const router = useRouter();
  const pathname = usePathname();

  const isLoading = userLoading || (user ? profileLoading : false) || tenantStatus === "resolving";

  useEffect(() => {
    if (isLoading) return;

    // 1. Unauthenticated redirect to login
    if (!user) {
      const redirectUrl = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : "/login";
      router.replace(redirectUrl);
      return;
    }

    // 2. Super Admin route protection
    if (pathname.startsWith("/super-admin") && pathname !== "/super-admin/login") {
      if (!flags?.isSuperAdmin) {
        router.replace("/");
        return;
      }
    }
  }, [user, flags, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Authenticating workspace...
        </span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // 3. Store Admin route protection: Strictly block non-admins with Restricted Area screen
  const isVisitingAdmin = pathname.startsWith("/admin");
  const isUserAdmin = Boolean(flags?.isAdmin || flags?.isSuperAdmin);

  if (isVisitingAdmin && !isUserAdmin) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 bg-slate-50/60">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100 shadow-2xs">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
              Admin Access Only
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Restricted Area</h2>
            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
              This section is strictly restricted to store administrators. Your account does not have admin permissions to access this page.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] text-white font-bold text-sm shadow-xs transition-all cursor-pointer"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
