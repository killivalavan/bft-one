"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import { WifiOff, X, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/Toast";

export function OfflineBanner() {
  const pathname = usePathname();
  const isBillingPage = pathname === "/billing" || pathname?.startsWith("/billing");

  const { isOnline: syncEngineOnline, pendingCount, syncState, triggerSync } = useOfflineSync();
  const { toast } = useToast();

  const [browserOnline, setBrowserOnline] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("offline_banner_dismissed") === "true";
    }
    return false;
  });
  const [isChecking, setIsChecking] = useState(false);

  // Debounce mount to prevent false-positives during initial page load & resource fetching
  useEffect(() => {
    if (!isBillingPage) return;

    const mountTimer = setTimeout(() => {
      setMounted(true);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        fetch(`/api/health?t=${Date.now()}`, { method: "HEAD", cache: "no-store" })
          .then((res) => {
            if (res.ok) setBrowserOnline(true);
            else setBrowserOnline(false);
          })
          .catch(() => setBrowserOnline(false));
      }
    }, 1500);

    return () => clearTimeout(mountTimer);
  }, [isBillingPage]);

  // Directly track browser network state with event listeners & polling (only on billing)
  useEffect(() => {
    if (!isBillingPage) return;

    function handleOnlineEvent() {
      setBrowserOnline(true);
      setDismissed(true);
    }

    function handleOfflineEvent() {
      // Confirm with health check first to avoid false positives during tab switches or refresh
      fetch(`/api/health?t=${Date.now()}`, { method: "HEAD", cache: "no-store" })
        .then((res) => {
          if (res.ok) {
            setBrowserOnline(true);
          } else {
            setBrowserOnline(false);
            setDismissed(false);
          }
        })
        .catch(() => {
          // Double-check after 1.5s before showing offline banner
          setTimeout(() => {
            fetch(`/api/health?t=${Date.now()}`, { method: "HEAD", cache: "no-store" })
              .then((res) => {
                if (res.ok) setBrowserOnline(true);
                else {
                  setBrowserOnline(false);
                  setDismissed(false);
                }
              })
              .catch(() => {
                setBrowserOnline(false);
                setDismissed(false);
              });
          }, 1500);
        });
    }

    window.addEventListener("online", handleOnlineEvent);
    window.addEventListener("offline", handleOfflineEvent);

    const timer = setInterval(() => {
      if (typeof navigator !== "undefined") {
        const currentOnline = navigator.onLine;
        if (currentOnline) {
          setBrowserOnline(true);
        } else {
          // Verify with quick health check
          fetch(`/api/health?t=${Date.now()}`, { method: "HEAD", cache: "no-store" })
            .then((res) => {
              if (res.ok) {
                setBrowserOnline(true);
              } else {
                setBrowserOnline(false);
              }
            })
            .catch(() => {
              setBrowserOnline(false);
            });
        }
      }
    }, 4000);

    return () => {
      window.removeEventListener("online", handleOnlineEvent);
      window.removeEventListener("offline", handleOfflineEvent);
      clearInterval(timer);
    };
  }, [isBillingPage]);

  // Exactly one toast per genuine transition once mounted on billing
  const prevOnlineRef = useRef<boolean>(true);
  useEffect(() => {
    if (!isBillingPage || !mounted) return;
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
            description: "Your offline billing orders are saved locally and will sync automatically.",
            variant: "info",
          }
    );
  }, [browserOnline, isBillingPage, mounted, toast]);

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
      } else {
        const res = await fetch(`/api/health?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
        if (res.ok) {
          setBrowserOnline(true);
          handleDismiss();
        }
      }
      await triggerSync().catch(() => {});
    } finally {
      setIsChecking(false);
    }
  }

  // Strictly gate to billing pages, mounted state, and verified offline state
  if (!isBillingPage || !mounted || browserOnline || syncEngineOnline || dismissed) {
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
