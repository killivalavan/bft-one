"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Loader2 } from "lucide-react";
import Link from "next/link";

export default function StockRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inventory");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shadow-xs">
        <Boxes className="w-8 h-8 animate-pulse" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">Upgrading to Inventory & Recipes Engine</h2>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          Stock Manager has been upgraded into the unified Inventory system with raw items, recipes, procurement, and stock audits.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
        <Loader2 className="w-4 h-4 animate-spin" />
        Redirecting to /inventory...
      </div>
      <Link
        href="/inventory"
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-xs"
      >
        Go to Inventory Now
      </Link>
    </div>
  );
}
