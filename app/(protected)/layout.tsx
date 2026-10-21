"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { Loader2 } from "lucide-react";

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

    // 3. Store Admin route protection
    if (pathname.startsWith("/admin")) {
      if (!flags?.isAdmin && !flags?.isSuperAdmin) {
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

  return <>{children}</>;
}
