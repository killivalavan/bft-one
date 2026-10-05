"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTenant } from "@/lib/context/TenantContext";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import {
  getAllItems,
  deleteItem,
  STORES,
  SyncQueueItem,
  getClientDeviceId,
} from "@/lib/offline/db";
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Wifi,
  WifiOff,
  Trash2,
  Layers,
  ShoppingBag,
  Receipt,
  UserCheck,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";

interface SyncDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncNow: () => Promise<any>;
}

export function SyncDetailsModal({ isOpen, onClose, onSyncNow }: SyncDetailsModalProps) {
  const { business } = useTenant();
  const { isOnline, syncState, pendingCount, failedCount, lastSyncTime, lastError } =
    useOfflineSync();

  const [mounted, setMounted] = useState(false);
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      loadQueueData();
      getClientDeviceId().then(setDeviceId);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, business?.id, syncState]);

  async function loadQueueData() {
    setLoading(true);
    try {
      const all = await getAllItems<SyncQueueItem>(STORES.sync_queue);
      const filtered = business?.id
        ? all.filter((o) => o.business_id === business.id || o.business_id === "default" || !o.business_id)
        : all;
      // Sort newest first
      filtered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setQueue(filtered);
    } catch (e) {
      console.error("Failed to load sync queue:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSync() {
    setIsManualSyncing(true);
    try {
      await onSyncNow();
      await loadQueueData();
    } finally {
      setIsManualSyncing(false);
    }
  }

  async function handleClearSynced() {
    const syncedItems = queue.filter((i) => i.status === "synced");
    for (const item of syncedItems) {
      await deleteItem(STORES.sync_queue, item.id);
    }
    await loadQueueData();
  }

  async function handleClearFailed() {
    const failedItems = queue.filter((i) => i.status === "failed");
    for (const item of failedItems) {
      await deleteItem(STORES.sync_queue, item.id);
    }
    await loadQueueData();
  }

  async function handleDeleteItem(id: string) {
    await deleteItem(STORES.sync_queue, id);
    await loadQueueData();
  }

  if (!isOpen || !mounted) return null;

  function getModuleIcon(tableName: string) {
    switch (tableName) {
      case "orders":
      case "order_items":
        return <ShoppingBag className="w-4 h-4 text-blue-600" />;
      case "daily_expenses":
      case "monthly_expenses":
        return <Receipt className="w-4 h-4 text-amber-600" />;
      case "timesheets":
      case "leaves":
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      case "inventory_items":
      case "stock_ledger":
      case "purchase_orders":
        return <Package className="w-4 h-4 text-purple-600" />;
      default:
        return <Layers className="w-4 h-4 text-slate-600" />;
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Offline Sync & Data Operations
              </h2>
              <p className="text-xs text-slate-500">
                Device: <span className="font-mono font-medium">{deviceId || "POS-TERMINAL"}</span> • Shop:{" "}
                <span className="font-semibold text-slate-700">{business?.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Summary Banner */}
        <div className="px-5 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-medium">
              {isOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Internet Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-amber-600" />
                  <span className="text-amber-800 font-bold">Local Mode (Offline)</span>
                </>
              )}
            </div>

            <div className="text-slate-500">
              Pending: <strong className="text-blue-700">{pendingCount}</strong>
            </div>

            {failedCount > 0 && (
              <div className="text-rose-600 font-bold">
                Failed: {failedCount}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                onClick={handleClearFailed}
                className="px-2.5 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 cursor-pointer font-medium text-xs border border-rose-200"
                title="Clear failed operations from local storage"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Failed</span>
              </button>
            )}

            {queue.some((i) => i.status === "synced") && (
              <button
                onClick={handleClearSynced}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer font-medium text-xs"
                title="Clear synced logs from local storage"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Synced</span>
              </button>
            )}

            <button
              onClick={handleManualSync}
              disabled={isManualSyncing || !isOnline}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white transition-all shadow-xs cursor-pointer",
                isOnline
                  ? "bg-blue-600 hover:bg-blue-700 active:scale-95"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed"
              )}
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5",
                  (isManualSyncing || syncState === "syncing") && "animate-spin"
                )}
              />
              <span>{isManualSyncing ? "Syncing..." : "Sync Now"}</span>
            </button>
          </div>
        </div>

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading operations queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">Everything is in sync</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No pending transactions. All orders, inventory movements, and expenses are safely stored in the cloud.
              </p>
            </div>
          ) : (
            queue.map((item) => {
              const isPending = item.status === "pending";
              const isFailed = item.status === "failed";
              const isSynced = item.status === "synced";
              const isSyncing = item.status === "syncing";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all bg-white text-xs flex items-center justify-between gap-3 shadow-2xs",
                    isFailed
                      ? "border-rose-200 bg-rose-50/40"
                      : isPending
                      ? "border-amber-200 bg-amber-50/30"
                      : isSyncing
                      ? "border-blue-200 bg-blue-50/30"
                      : "border-slate-200"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 shrink-0">
                      {getModuleIcon(item.table_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 capitalize">
                          {item.table_name.replace(/_/g, " ")}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          {item.action}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] truncate mt-0.5">
                        ID: <span className="font-mono">{item.id.slice(0, 8)}</span> •{" "}
                        {format(new Date(item.created_at), "hh:mm:ss a, dd MMM")}
                      </p>
                      {item.last_error && (
                        <p className="text-rose-600 font-medium text-[11px] mt-1">
                          ⚠️ {item.last_error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isSynced && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Synced
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Pending
                      </span>
                    )}
                    {isSyncing && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                        Syncing
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        Retry #{item.retry_count}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors cursor-pointer ml-1"
                      title="Delete operation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Last Cloud Sync:{" "}
            <span className="font-semibold text-slate-700">
              {lastSyncTime ? format(lastSyncTime, "hh:mm:ss a, dd MMM yyyy") : "Pending connection"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
