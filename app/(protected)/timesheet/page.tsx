"use client";
import { format, addDays, isAfter, isBefore, addMonths, startOfDay } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { TimesheetCalendar } from "@/components/timesheet/TimesheetCalendar";
import { ActionTabs } from "@/components/timesheet/ActionTabs";
import { LogForm } from "@/components/timesheet/LogForm";
import { PresentStaffModal } from "@/components/timesheet/PresentStaffModal";
import { Button } from "@/components/ui/Button";
import { Users, MapPin, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";
import { useTenant } from "@/lib/context/TenantContext";
import { SyncStatusBadge } from "@/components/offline/SyncStatusBadge";
import { isWithinGeofence, metersBetween, getShopGeofence } from "@/lib/geofence";
import { cn } from "@/lib/utils/cn";
import {
  STORES,
  getItemsByTenant,
  putItem,
  LocalTimesheet,
  LocalLeave,
} from "@/lib/offline/db";
import { enqueueSyncOperation } from "@/lib/offline/syncEngine";

export default function TimesheetPage() {
  const { toast } = useToast();
  const { business } = useTenant();
  const [tab, setTab] = useState<"timesheet" | "leave">("timesheet");
  const [filledDates, setFilledDates] = useState<Set<string>>(new Set());
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const [today] = useState(new Date());
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday">("today");
  const [leaveDate, setLeaveDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPresentModal, setShowPresentModal] = useState(false);

  // Geofence status for employees
  const [geoStatus, setGeoStatus] = useState<"idle" | "checking" | "inside" | "outside" | "denied">("idle");
  const [geoDistance, setGeoDistance] = useState<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropdownDate = useMemo(() => dateChoice === "today" ? new Date() : addDays(new Date(), -1), [dateChoice]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabaseClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      const userIsAdmin = !!prof?.is_admin;
      setIsAdmin(userIsAdmin);

      const start = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-01");
      const end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd");
      const { data: ts } = await supabaseClient
        .from("timesheets")
        .select("work_date")
        .eq("user_id", user.id)
        .gte("work_date", start)
        .lte("work_date", end);
      setFilledDates(new Set((ts || []).map((t: any) => t.work_date)));
      const { data: lv } = await supabaseClient
        .from("leaves")
        .select("leave_date")
        .eq("user_id", user.id)
        .gte("leave_date", start)
        .lte("leave_date", end);
      setLeaveDates(new Set((lv || []).map((l: any) => l.leave_date)));

      // If non-admin employee, check shop geofence on load
      if (!userIsAdmin && business?.geofence_enabled !== false) {
        verifyLocation(true).catch(() => {});
      }
    })();
  }, [today, business]);

  useEffect(() => {
    function handleLocUpdate() {
      if (!isAdmin && business?.geofence_enabled !== false) {
        verifyLocation(true).catch(() => {});
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("bftone_shop_location_updated", handleLocUpdate);
      return () => window.removeEventListener("bftone_shop_location_updated", handleLocUpdate);
    }
  }, [isAdmin, business]);

  async function verifyLocation(silent = false): Promise<boolean> {
    if (isAdmin || business?.geofence_enabled === false) {
      setGeoStatus("inside");
      return true;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      if (!silent) {
        toast({
          title: "Location Access Required 📍",
          description: "GPS is not supported on this device/browser.",
          variant: "error",
        });
      }
      return false;
    }

    setGeoStatus("checking");

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const shop = getShopGeofence(business);
          const targetLat = shop.lat;
          const targetLng = shop.lng;
          const radius = shop.radius;

          const ok = isWithinGeofence(lat, lng, targetLat, targetLng, radius);
          const dist = metersBetween(lat, lng, targetLat, targetLng);
          setGeoDistance(Math.round(dist));

          if (ok) {
            setGeoStatus("inside");
            if (!silent) {
              toast({
                title: "Location Verified 📍",
                description: `You are inside ${business?.name || "the shop"}. Ready to mark attendance!`,
                variant: "success",
              });
            }
            resolve(true);
          } else {
            setGeoStatus("outside");
            if (!silent) {
              toast({
                title: "Outside Shop Geofence 📍",
                description: `You are ~${Math.round(dist)}m away from ${business?.name || "the shop"} (Allowed: ${radius}m). Only employees inside the shop can mark attendance.`,
                variant: "error",
              });
            }
            resolve(false);
          }
        },
        (err) => {
          setGeoStatus("denied");
          let msg = "Location permission denied. Please allow GPS location in your browser settings to mark attendance.";
          if (err.code === err.TIMEOUT) {
            msg = "Location request timed out. Please ensure GPS is active and try again.";
          }
          if (!silent) {
            toast({
              title: "GPS Permission Required 📍",
              description: msg,
              variant: "error",
            });
          }
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function submitTimesheet() {
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;

    // 1. Enforce location check for employees: only employees in the shop can put attendance
    if (!isAdmin && business?.geofence_enabled !== false) {
      const isInsideShop = await verifyLocation(false);
      if (!isInsideShop) return;
    }

    // 2. Date window verification
    const twoDaysAgo = addDays(startOfDay(new Date()), -2);
    const targetDate = dateChoice === 'today' ? new Date() : addDays(new Date(), -1);

    if (isBefore(targetDate, twoDaysAgo)) {
      toast({ title: "Only Today/Yesterday allowed", variant: "error" });
      return;
    }

    // 3. Mark Present directly: No time checking, just present is enough!
    const check_in = new Date();
    const minutes_late = 0;
    const dateKey = format(targetDate, "yyyy-MM-dd");
    const bizId = business?.id || "default";
    const tsId = crypto.randomUUID();

    const localTs: LocalTimesheet = {
      id: tsId,
      business_id: bizId,
      user_id: user.id,
      work_date: dateKey,
      check_in: check_in.toISOString(),
      minutes_late: 0,
      created_at: new Date().toISOString(),
    };

    // 1. Save to IndexedDB
    await putItem<LocalTimesheet>(STORES.timesheets, localTs);
    setFilledDates((prev) => { const next = new Set(prev); next.add(dateKey); return next; });

    // 2. Enqueue sync mutation
    await enqueueSyncOperation({
      businessId: bizId,
      tableName: "timesheets",
      action: "INSERT",
      payload: {
        id: localTs.id,
        user_id: localTs.user_id,
        work_date: localTs.work_date,
        check_in: localTs.check_in,
        minutes_late: 0,
        business_id: localTs.business_id,
      },
      customId: tsId,
    });

    toast({
      title: "Attendance marked: Present! ✅",
      description: `Marked present for ${dateChoice === 'today' ? "today" : "yesterday"}. Saved locally and queued for sync.`,
      variant: "success",
    });
  }

  async function submitLeave() {
    const d = new Date(leaveDate);
    const max = addMonths(new Date(), 5);
    if (isAfter(d, max)) { toast({ title: "Max 5 months ahead", variant: "error" }); return; }
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;
    const leaveKey = format(d, "yyyy-MM-dd");
    const bizId = business?.id || "default";
    const lvId = crypto.randomUUID();

    const localLv: LocalLeave = {
      id: lvId,
      business_id: bizId,
      user_id: user.id,
      leave_date: leaveKey,
      reason,
      created_at: new Date().toISOString(),
    };

    // 1. Save to IndexedDB
    await putItem<LocalLeave>(STORES.leaves, localLv);
    setLeaveDates((prev) => { const next = new Set(prev); next.add(leaveKey); return next; });

    // 2. Enqueue sync mutation
    await enqueueSyncOperation({
      businessId: bizId,
      tableName: "leaves",
      action: "INSERT",
      payload: {
        id: localLv.id,
        user_id: localLv.user_id,
        leave_date: localLv.leave_date,
        reason: localLv.reason,
        business_id: localLv.business_id,
      },
      customId: lvId,
    });

    toast({ title: "Leave applied! 🌴", description: "Saved locally and queued for sync", variant: "success" });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 md:pb-10">
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timesheet</h1>
            <SyncStatusBadge />
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowPresentModal(true)} className="gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs">
              <Users size={16} />
              <span className="hidden sm:inline">Present Staff</span>
            </Button>
          )}
        </div>

        {/* Components */}
        <div className="space-y-6">
          <TimesheetCalendar
            value={selectedDate}
            onChange={(d) => { setSelectedDate(d); if (tab === 'leave') setLeaveDate(format(d, 'yyyy-MM-dd')); }}
            filledDates={filledDates}
            leaveDates={leaveDates}
          />

          <ActionTabs activeTab={tab} onChange={setTab} />

          {/* Employee Geofence Location Verification Card */}
          {tab === "timesheet" && !isAdmin && business?.geofence_enabled !== false && (
            <div
              className={cn(
                "p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 text-xs shadow-2xs",
                geoStatus === "inside"
                  ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
                  : geoStatus === "outside"
                  ? "bg-rose-50/90 border-rose-200 text-rose-950"
                  : geoStatus === "denied"
                  ? "bg-amber-50/90 border-amber-200 text-amber-950"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold",
                    geoStatus === "inside"
                      ? "bg-emerald-100 text-emerald-700"
                      : geoStatus === "outside"
                      ? "bg-rose-100 text-rose-700"
                      : geoStatus === "denied"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-200 text-slate-600"
                  )}
                >
                  <MapPin size={16} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold leading-tight truncate">
                    {geoStatus === "inside"
                      ? `Inside Shop (${business?.name || "Verified"})`
                      : geoStatus === "outside"
                      ? `Outside Shop (~${geoDistance ?? "?"}m away)`
                      : geoStatus === "denied"
                      ? "GPS Permission Required"
                      : "Verifying Shop Location..."}
                  </p>
                  <p className="text-[11px] opacity-80 leading-tight truncate mt-0.5">
                    {geoStatus === "inside"
                      ? "Shop location verified. You can submit attendance."
                      : geoStatus === "outside"
                      ? `Must be within ${business?.geofence_radius_meters || 150}m of shop to mark attendance.`
                      : geoStatus === "denied"
                      ? "Enable GPS location in browser settings to submit attendance."
                      : "Checking your distance to the store..."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => verifyLocation(false)}
                disabled={geoStatus === "checking"}
                className="px-2.5 py-1.5 rounded-lg bg-white shadow-2xs border border-slate-200/80 font-semibold text-[11px] hover:bg-slate-50 active:scale-95 transition-all shrink-0 flex items-center gap-1 cursor-pointer text-slate-700"
                title="Verify Shop Location"
              >
                <RefreshCw size={12} className={cn(geoStatus === "checking" && "animate-spin")} />
                <span>{geoStatus === "inside" ? "Recheck" : "Verify GPS"}</span>
              </button>
            </div>
          )}

          <LogForm
            mode={tab}
            // Timesheet
            dateChoice={dateChoice}
            onDateChoiceChange={(v) => {
              setDateChoice(v);
              setSelectedDate(v === "today" ? new Date() : addDays(new Date(), -1));
            }}
            onSubmitTimesheet={submitTimesheet}
            // Leave
            leaveDate={leaveDate}
            onLeaveDateChange={setLeaveDate}
            reason={reason}
            onReasonChange={setReason}
            onSubmitLeave={submitLeave}
          />

          <PresentStaffModal
            open={showPresentModal}
            onClose={() => setShowPresentModal(false)}
            date={selectedDate}
          />
        </div>
      </div>
    </div>
  );
}

