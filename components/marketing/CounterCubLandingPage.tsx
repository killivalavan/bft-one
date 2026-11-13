"use client";

import React, { useState } from "react";
import { ArrowRight, Shield } from "lucide-react";
import { SeyalLogo } from "@/components/ui/SeyalLogo";
import { validateTenantSlug } from "@/lib/utils/slugValidator";
import { getPlatformAdminUrl, getTenantUrl } from "@/lib/tenant/hostUrls";

/**
 * Public landing page for countercub.com / www.countercub.com (localhost:3000 in dev).
 * Placeholder content for now. No login and no store data are loaded on this host.
 */
export function CounterCubLandingPage() {
  const [slugInput, setSlugInput] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);

  const handleOpenShop = (e: React.FormEvent) => {
    e.preventDefault();
    setSlugError(null);
    const check = validateTenantSlug(slugInput);
    if (!check.valid || !check.normalizedSlug) {
      setSlugError(check.error || "Please enter a valid shop name.");
      return;
    }
    // Navigates to the validated shop workspace login (<slug>.countercub.com/login in prod, <slug>.localhost:PORT/login in dev)
    window.location.href = getTenantUrl(check.normalizedSlug, "/login");
  };

  return (
    <div className="min-h-screen bg-[#0B132B] text-white flex flex-col">
      <header className="border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <SeyalLogo size={36} showWordmark theme="dark" />
          <a
            href={getPlatformAdminUrl("/super-admin")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
          >
            <Shield size={13} />
            <span>Platform Login</span>
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <section className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-8">
          <div className="space-y-4">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/30">
              Coming soon
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Zero-Trust Multi-Tenant Retail &amp; Cafe Operating System
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
              POS billing, inventory, staff attendance, payroll and B2B dispatch for your shop,
              each on its own address.
            </p>
          </div>

          <form
            id="open-shop"
            onSubmit={handleOpenShop}
            className="max-w-md mx-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 text-left"
          >
            <label htmlFor="shop-slug" className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Open your shop
            </label>
            <div className="flex items-stretch rounded-xl overflow-hidden border border-slate-700 focus-within:border-[#2563EB]">
              <input
                id="shop-slug"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="your-shop"
                autoComplete="off"
                className="flex-1 min-w-0 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none"
              />
              <span className="bg-slate-800 px-3 flex items-center text-xs text-slate-400 font-mono">
                .countercub.com
              </span>
            </div>
            {slugError && <p className="text-xs text-rose-300">{slugError}</p>}
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-sm font-bold transition"
            >
              <span>Go to shop login</span>
              <ArrowRight size={15} />
            </button>
          </form>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-5 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} CounterCub. All rights reserved.
      </footer>
    </div>
  );
}
