"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/lib/context/TenantContext";
import {
  subscribeToSyncEngine,
  processSyncQueue,
  pullCloudMasterData,
  checkServerReachability,
  SyncStatusReport,
  getSyncReport,
} from "./syncEngine";

export function useOfflineSync() {
  const { business } = useTenant();
  const [report, setReport] = useState<SyncStatusReport>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncState: "idle",
    pendingCount: 0,
    failedCount: 0,
    lastSyncTime: null,
    lastError: null,
  });

  // Subscribe to sync engine state changes (single source of truth)
  useEffect(() => {
    const unsubscribe = subscribeToSyncEngine((newReport) => {
      setReport(newReport);
    });

    if (business?.id) {
      getSyncReport(business.id).then(setReport);
    }

    return () => {
      unsubscribe();
    };
  }, [business?.id]);

  // Master data warmup & periodic sync heartbeat
  useEffect(() => {
    if (business?.id && typeof navigator !== "undefined" && navigator.onLine) {
      pullCloudMasterData(business.id);
    }

    const interval = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine && business?.id) {
        checkServerReachability().then((reachable) => {
          if (reachable && report.pendingCount > 0) {
            processSyncQueue(business.id);
          }
        });
      }
    }, 45000);

    return () => {
      clearInterval(interval);
    };
  }, [business?.id, report.pendingCount]);

  const triggerSync = useCallback(async () => {
    if (!business?.id) return;
    return await processSyncQueue(business.id);
  }, [business?.id]);

  const warmupData = useCallback(async () => {
    if (!business?.id) return;
    return await pullCloudMasterData(business.id);
  }, [business?.id]);

  return {
    ...report,
    triggerSync,
    warmupData,
  };
}
