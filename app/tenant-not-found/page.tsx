"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Globe, ArrowRight, Building2 } from "lucide-react";
import { SeyalLogo } from "@/components/ui/SeyalLogo";

export default function TenantNotFoundPage() {
  const [hostname, setHostname] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostname(window.location.host);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0B132B] text-white flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_55%)] pointer-events-none" />
      <div className="relative z-10 w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-7 sm:p-9 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          <SeyalLogo size={40} showWordmark theme="dark" />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <ShieldAlert size={32} />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Building2 size={12} />
            404 — Workspace Not Found
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            This CounterCub workspace does not exist
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
            {hostname ? (
              <>
                The subdomain{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-xs border border-slate-700">
                  {hostname}
                </code>{" "}
                is not linked to an active CounterCub shop workspace, or uses a
                reserved system address.
              </>
            ) : (
              "The requested subdomain is not linked to an active CounterCub shop workspace."
            )}
          </p>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-left space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Zero-Trust Tenant Isolation
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            For security, CounterCub never falls back to another shop&apos;s
            workspace when a subdomain is unknown, retired, or misconfigured.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <a
            href="https://www.countercub.com"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/20 transition cursor-pointer"
          >
            <Globe size={16} />
            Visit CounterCub.com
          </a>
          <Link
            href="https://app.countercub.com/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 transition cursor-pointer"
          >
            Platform Admin Login
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

