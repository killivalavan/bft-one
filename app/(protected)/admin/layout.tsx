"use client";

import React, { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
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

        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (isMounted) {
          if (profile?.is_admin) {
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
          className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all shadow-xs"
        >
          Return Home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
