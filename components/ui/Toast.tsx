"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

type Toast = { id: string; title: string; description?: string; variant?: "success"|"error"|"info" };

type ToastCtx = {
  toast: (t: Omit<Toast, "id">) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }:{ children: React.ReactNode }){
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: Omit<Toast, "id">)=>{
    const id = Math.random().toString(36).slice(2);
    setToasts((prev)=>[...prev, { id, ...t }]);
    setTimeout(()=>setToasts((prev)=>prev.filter(x=>x.id!==id)), 3000);
  },[]);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed z-[100] bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 space-y-2">
        {toasts.map(t=> (
          <div key={t.id} className={twMerge(
            "rounded-xl px-3 py-2 shadow-md text-white",
            !t.variant && "bg-slate-900",
            t.variant==="success" && "bg-emerald-600",
            t.variant==="error" && "bg-red-600",
            t.variant==="info" && "bg-sky-600",
          )}>
            <div className="text-sm font-semibold">{t.title}</div>
            {t.description && <div className="text-xs/relaxed opacity-90">{t.description}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(){
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
