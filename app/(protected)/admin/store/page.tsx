"use client";

import { Store } from "lucide-react";
import { StoreSettings } from "@/components/admin/StoreSettings";
import { useTenant } from "@/lib/context/TenantContext";

export default function AdminStoreSettingsPage() {
  const { business } = useTenant();

  return (
    <div>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Store size={20} className="shrink-0" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Business Profile</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {business?.name || "Store Operations"} — Brand logos, bill headers, authorized signature &amp; store location
            </p>
          </div>
        </div>

        <StoreSettings />
      </div>
    </div>
  );
}
