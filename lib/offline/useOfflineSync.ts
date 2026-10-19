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

  const businessId = business?.id;

  // Master data warmup & periodic sync heartbeat
  useEffect(() => {
    if (businessId && typeof navigator !== "undefined" && navigator.onLine) {
      pullCloudMasterData(businessId);
    }

    const interval = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine && businessId) {
        checkServerReachability().then((reachable) => {
          if (reachable && report.pendingCount > 0) {
            processSyncQueue(businessId);
          }
        });
      }
    }, 45000);

    return () => {
      clearInterval(interval);
    };
  }, [businessId, report.pendingCount]);

  const triggerSync = useCallback(async () => {
    if (!businessId) return;
    return await processSyncQueue(businessId);
  }, [businessId]);

  const warmupData = useCallback(async () => {
    if (!businessId) return;
    return await pullCloudMasterData(businessId);
  }, [businessId]);

  return {
    ...report,
    triggerSync,
    warmupData,
  };
}
