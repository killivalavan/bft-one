"use client";

import React, { useState } from "react";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import { cn } from "@/lib/utils/cn";
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SyncDetailsModal } from "./SyncDetailsModal";

interface SyncStatusBadgeProps {
  className?: string;
  showText?: boolean;
}

export function SyncStatusBadge({ className, showText = true }: SyncStatusBadgeProps) {
  const { isOnline, syncState, pendingCount, failedCount, triggerSync } = useOfflineSync();
  const [modalOpen, setModalOpen] = useState(false);

  // Status computation
  let bgClass = "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/80";
  let dotClass = "bg-emerald-500 animate-pulse";
  let icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  let label = "Synced";
  let detail = "Cloud Active";

  if (!isOnline) {
    bgClass = "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100";
    dotClass = "bg-amber-500";
    icon = <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
    label = "Offline";
    detail = pendingCount > 0 ? `${pendingCount} pending` : "Local Mode";
  } else if (syncState === "syncing") {
    bgClass = "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100";
    dotClass = "bg-blue-500 animate-ping";
    icon = <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />;
    label = "Syncing...";
    detail = pendingCount > 0 ? `${pendingCount} items` : "";
  } else if (syncState === "error" || failedCount > 0) {
    bgClass = "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100";
    dotClass = "bg-rose-500";
    icon = <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    label = "Sync Issue";
    detail = `${failedCount} failed`;
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs select-none active:scale-95",
          bgClass,
          className
        )}
        title={
          !isOnline
            ? `Offline mode: ${pendingCount} changes stored safely locally`
            : syncState === "syncing"
            ? "Synchronizing local transactions with cloud..."
            : failedCount > 0
            ? `${failedCount} operations need retry`
            : "All operations safely synchronized"
        }
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
        {icon}
        {showText && (
          <span className="hidden sm:inline font-bold tracking-tight">
            {label}
            {detail ? <span className="opacity-80 font-medium ml-1">({detail})</span> : null}
          </span>
        )}
      </button>

      <SyncDetailsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSyncNow={triggerSync} />
    </>
  );
}
