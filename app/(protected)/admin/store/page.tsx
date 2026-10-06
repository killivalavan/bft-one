"use client";

import { Store } from "lucide-react";
import { StoreSettings } from "@/components/admin/StoreSettings";
import { useTenant } from "@/lib/context/TenantContext";

export default function AdminStoreSettingsPage() {
  const { business } = useTenant();

  return (
    <div className="min-h-screen pb-20 bg-[#F8FAFC]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Store size={20} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Store & Brand Identity</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {business?.name || "Store Operations"} — Brand logos, bill headers, authorized signature & address
            </p>
          </div>
        </div>

        <StoreSettings />
      </div>
    </div>
  );
}
