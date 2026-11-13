"use client";

import { CreditCard } from "lucide-react";
import { MySubscriptionView } from "@/components/admin/MySubscriptionView";
import { useTenant } from "@/lib/context/TenantContext";

export default function AdminSubscriptionPage() {
  const { business } = useTenant();

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs shrink-0">
          <CreditCard size={20} className="shrink-0" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            My Subscription
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {business?.name || "Store Operations"} — Plan entitlements, usage limits &amp; renewal requests
          </p>
        </div>
      </div>

      <MySubscriptionView />
    </div>
  );
}

