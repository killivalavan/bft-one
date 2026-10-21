"use client";

import React from "react";
import { Store } from "lucide-react";
import { StoreSettings } from "@/components/admin/StoreSettings";
import { useTenant } from "@/lib/context/TenantContext";

export default function B2BStoreSettingsPage() {
  const { business } = useTenant();

  return (
    <div>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Store size={20} className="shrink-0" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Business Profile</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                B2B Supply
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {business?.name || "B2B Supply Hub"} — Brand logos, delivery slip headers, authorized signature &amp; business location
            </p>
          </div>
        </div>

        <StoreSettings />
      </div>
    </div>
  );
}
