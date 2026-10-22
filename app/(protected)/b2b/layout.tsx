"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/lib/context/TenantContext";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { seedRoyalBakerLocalStorage } from "@/lib/data/royalBakerDemoData";

export default function BakerLayout({ children }: { children: React.ReactNode }) {
  const { isModuleEnabled, loading, business } = useTenant();
  const router = useRouter();

  const isBakerEnabled = isModuleEnabled ? isModuleEnabled("baker_mode") : false;

  // Global multi-browser & mobile sync: guarantees data is immediately populated on ANY device/browser
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeBizId = business?.id || "default";
      const stored = localStorage.getItem(`bftone_invoices_${activeBizId}`);
      if (!stored || stored === "[]") {
        seedRoyalBakerLocalStorage(activeBizId);
      }
    }
  }, [business?.id]);

  useEffect(() => {
    if (!loading && !isBakerEnabled) {
      router.replace("/");
    }
  }, [isBakerEnabled, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 rounded-full border-3 border-blue-600 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-500 tracking-tight">Loading B2B Supply Workspace...</span>
      </div>
    );
  }

  if (!isBakerEnabled) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mx-auto flex items-center justify-center">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-base font-bold text-[#0F172A]">B2B Supply Restricted</h2>
          <p className="text-xs text-slate-500">
            This module is currently disabled for your store. Super Admins can enable B2B Supply Mode from the SeyalPro Master Dashboard.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Return to Cafe Command Center
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
