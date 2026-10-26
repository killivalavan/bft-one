"use client";

import React, { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "authorized" | "denied">("loading");

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          if (isMounted) setStatus("denied");
          return;
        }

        // Quick client-side check from cached flags
        try {
          const cachedFlags = localStorage.getItem("bftone_flags");
          if (cachedFlags) {
            const parsed = JSON.parse(cachedFlags);
            if (parsed.is_admin || parsed.isAdmin || parsed.is_super_admin || parsed.isSuperAdmin) {
              if (isMounted) setStatus("authorized");
              return;
            }
          }
          const email = localStorage.getItem("bftone_display_email") || user.email;
          if (email && email.toLowerCase().includes("admin")) {
            if (isMounted) setStatus("authorized");
            return;
          }
        } catch {}

        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("is_admin, is_super_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (isMounted) {
          if (profile?.is_admin || (profile as any)?.is_super_admin || user.email?.toLowerCase().includes("admin")) {
            setStatus("authorized");
          } else {
            setStatus("denied");
          }
        }
      } catch {
        if (isMounted) setStatus("denied");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center gap-2 text-zinc-500 font-medium">
        <Loader2 className="animate-spin text-blue-600" size={24} />
        <span>Verifying Admin Authorization...</span>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 border border-red-100 shadow-xs">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Restricted Area</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          This area is strictly restricted to authorized administrators. Your account does not have admin permissions.
        </p>
        <Link
          href="/"
          className="mt-6 w-full inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] text-white font-bold text-sm shadow-xs transition-all cursor-pointer"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
