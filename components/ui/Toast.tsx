"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

type Toast = { id: string; title: string; description?: string; variant?: "success" | "error" | "info"; duration?: number };

type ToastCtx = {
  toast: (t: Omit<Toast, "id">) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter(x => x.id !== id)), t.duration || 3000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed z-[100] bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={twMerge(
            "rounded-lg px-4 py-3 shadow-lg text-white border",
            !t.variant && "bg-[#0F172A] border-slate-700",
            t.variant === "success" && "bg-[#16A34A] border-emerald-500",
            t.variant === "error" && "bg-[#DC2626] border-red-500",
            t.variant === "info" && "bg-[#2563EB] border-blue-500",
          )}>
            <div className="text-sm font-semibold">{t.title}</div>
            {t.description && <div className="text-xs/relaxed opacity-90">{t.description}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
