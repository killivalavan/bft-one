"use client";

import React, { useState, useEffect, useRef } from "react";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import { WifiOff, X, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/Toast";

export function OfflineBanner() {
  const { isOnline: syncEngineOnline, pendingCount, syncState, triggerSync } = useOfflineSync();
  const { toast } = useToast();

  const [browserOnline, setBrowserOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("offline_banner_dismissed") === "true";
    }
    return false;
  });
  const [isChecking, setIsChecking] = useState(false);

  // Directly track browser network state with event listeners & 1s polling
  useEffect(() => {
    function handleOnlineEvent() {
      setBrowserOnline(true);
      setDismissed(true);
    }

    function handleOfflineEvent() {
      setBrowserOnline(false);
      setDismissed(false);
      sessionStorage.removeItem("offline_banner_dismissed");
    }

    window.addEventListener("online", handleOnlineEvent);
    window.addEventListener("offline", handleOfflineEvent);

    // Fast 1s polling to catch DevTools throttling changes immediately without reload
    const timer = setInterval(() => {
      if (typeof navigator !== "undefined") {
        const currentOnline = navigator.onLine;
        setBrowserOnline(currentOnline);
        if (currentOnline && !dismissed) {
          setDismissed(true);
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener("online", handleOnlineEvent);
      window.removeEventListener("offline", handleOfflineEvent);
      clearInterval(timer);
    };
  }, [dismissed]);

  // Exactly one toast per genuine transition. Ref starts at the load-time value,
  // so a page refresh never produces a toast.
  const prevOnlineRef = useRef<boolean>(browserOnline);
  useEffect(() => {
    if (prevOnlineRef.current === browserOnline) return;
    prevOnlineRef.current = browserOnline;
    toast(
      browserOnline
        ? {
            title: "Back Online 🟢",
            description: "Internet connection restored. Synchronizing pending operations...",
            variant: "success",
          }
        : {
            title: "Working Offline 🟠",
            description: "Your work is saved locally and will sync automatically.",
            variant: "info",
          }
    );
  }, [browserOnline, toast]);

  function handleDismiss(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("offline_banner_dismissed", "true");
    }
  }

  async function handleRecheck(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsChecking(true);
    try {
      const isNowOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (isNowOnline) {
        setBrowserOnline(true);
        handleDismiss();
      }
      await triggerSync().catch(() => {});
    } finally {
      setIsChecking(false);
    }
  }

  // If online by either hook or navigator, or user dismissed, DO NOT RENDER
  if (browserOnline || syncEngineOnline || dismissed) {
    return null;
  }

  return (
    <aside
      aria-label="Offline Mode Notification"
      className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium shadow-sm transition-all animate-in slide-in-from-top duration-200 sticky top-0 z-[60]"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="truncate">
            <span className="font-bold">You are offline.</span> SeyalPro will continue saving your work locally and sync automatically when internet returns.
            {pendingCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-black/20 text-white font-bold text-xs">
                {pendingCount} saved {pendingCount === 1 ? "operation" : "operations"}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRecheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition-all cursor-pointer select-none active:scale-95"
          >
            <RefreshCw className={cn("w-3 h-3", (isChecking || syncState === "syncing") && "animate-spin")} />
            <span>{isChecking ? "Checking..." : "Recheck"}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-white/25 text-white hover:text-white transition-all cursor-pointer select-none active:scale-95"
            title="Dismiss banner"
            aria-label="Close offline banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
