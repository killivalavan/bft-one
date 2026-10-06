"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  isWithinGeofence,
  metersBetween,
  getShopGeofence,
} from "@/lib/geofence";
import { useTenant } from "@/lib/context/TenantContext";
import {
  Store,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Compass,
  CheckCircle2,
  Sparkles,
  Lock,
} from "lucide-react";

export default function GeofenceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { business } = useTenant();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"checking" | "outside" | "denied" | "not_logged_in">("checking");
  const [reason, setReason] = useState<string>("");
  const [userDistance, setUserDistance] = useState<number | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Dynamically resolve exact shop location with multi-tier fallback
  const [shopCoords, setShopCoords] = useState(() => getShopGeofence(business));
  const targetLat = shopCoords.lat;
  const targetLng = shopCoords.lng;
  const radius = shopCoords.radius;
  const storeName = shopCoords.name;

  const evaluateAccess = useCallback(async () => {
    const currentShop = getShopGeofence(business);
    setShopCoords(currentShop);
    const tLat = currentShop.lat;
    const tLng = currentShop.lng;
    const r = currentShop.radius;
    const sName = currentShop.name;

    // If geofence is disabled for this tenant, permit access immediately
    if (business && business.geofence_enabled === false) {
      setAllowed(true);
      return;
    }

    // Non-timesheet pages (profile, salary, notifications, etc.) are open everywhere
    if (pathname !== "/timesheet") {
      setAllowed(true);
      return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      setAllowed(false);
      setStatus("not_logged_in");
      setReason("You need to sign in before accessing the employee timesheet.");
      return;
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("is_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_admin || profile?.is_super_admin) {
      setAllowed(true);
      return;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      setAllowed(false);
      setStatus("denied");
      setReason("Geolocation is not supported by your browser or hardware.");
      return;
    }

    setStatus("checking");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        const dist = Math.round(metersBetween(uLat, uLng, tLat, tLng));

        setUserCoords({ lat: uLat, lng: uLng });
        setUserAccuracy(acc);
        setUserDistance(dist);

        const ok = isWithinGeofence(uLat, uLng, tLat, tLng, r);
        if (ok) {
          setAllowed(true);
        } else {
          setAllowed(false);
          setStatus("outside");
          setReason(`You must be inside ${sName} to access`);
        }
        setIsRetrying(false);
      },
      (err) => {
        setIsRetrying(false);
        setAllowed(false);
        setStatus("denied");
        let msg = "Location permission denied. Please allow GPS location in your browser settings to access.";
        if (err.code === err.TIMEOUT) {
          msg = "GPS request timed out. Please check that location services are active on your device.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "GPS position is unavailable. Please check your network or device location.";
        }
        setReason(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [business, pathname]);

  useEffect(() => {
    evaluateAccess();
  }, [evaluateAccess]);

  // Listen for shop location broadcasts from Store Settings or inline actions
  useEffect(() => {
    function handleUpdate() {
      const updated = getShopGeofence(business);
      setShopCoords(updated);
      evaluateAccess();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("bftone_shop_location_updated", handleUpdate);
      return () => window.removeEventListener("bftone_shop_location_updated", handleUpdate);
    }
  }, [business, evaluateAccess]);

  function handleManualRetry() {
    setIsRetrying(true);
    evaluateAccess();
  }


  // Permitted view
  if (allowed) {
    return <>{children}</>;
  }

  // Checking / Initial verification state
  if (status === "checking" && allowed === null) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 bg-slate-50/60">
        <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-8 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Animated Scanning Radar */}
          <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-blue-500/15 animate-ping duration-1000" />
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-blue-300/80 bg-blue-50/40" />
            <div className="absolute inset-4 rounded-full border border-blue-200 bg-blue-100/30" />
            <div className="absolute inset-8 rounded-full border border-blue-300 bg-white shadow-md flex items-center justify-center">
              <Store className="w-8 h-8 text-[#2563EB]" />
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#2563EB] animate-spin" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
              <Radio className="w-3.5 h-3.5 animate-pulse text-[#2563EB]" /> Verifying Store Proximity
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Checking GPS Location</h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Acquiring high-accuracy satellite fix to verify your physical presence at{" "}
              <strong className="text-slate-700">{storeName}</strong>...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Blocked / Outside Geofence or Denied state
  const isOutside = status === "outside";
  const excessDistance = userDistance !== null && userDistance > radius ? userDistance - radius : 0;

  return (
    <div className="min-h-[82vh] flex items-center justify-center p-4 sm:p-6 bg-radial from-blue-50/40 via-slate-50 to-slate-100/80">
      <div className="w-full max-w-lg bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-400">
        {/* Top Header Banner with Store Details */}
        <div className="bg-slate-50/80 border-b border-slate-200/80 p-6 text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-rose-400/10 blur-2xl pointer-events-none" />

          {/* Radar Visual Container */}
          <div className="relative w-48 h-48 sm:w-52 sm:h-52 mx-auto flex items-center justify-center my-2">
            {/* Outer Pulse */}
            <div className="absolute inset-0 rounded-full bg-blue-400/15 animate-ping duration-1000 pointer-events-none" />

            {/* Outer Dashed Boundary (Current Radar Sweep) */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-blue-200/80 bg-blue-50/30" />

            {/* Middle Perimeter */}
            <div className="absolute inset-5 rounded-full border border-blue-300/60 bg-blue-100/25" />

            {/* Inner Allowed Safe-Zone Ring */}
            <div className="absolute inset-10 rounded-full border-2 border-emerald-400/70 bg-emerald-50/50 flex items-center justify-center">
              <span className="text-[10px] font-black text-emerald-800 tracking-wider uppercase opacity-80 select-none">
                {radius}m Radius
              </span>
            </div>

            {/* Center Store Beacon */}
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-white shadow-lg border border-slate-200 flex flex-col items-center justify-center group">
              <Store className="w-7 h-7 text-[#2563EB]" />
              <span className="text-[9px] font-black text-slate-800 tracking-tight leading-none mt-1">SHOP</span>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs animate-pulse" />
            </div>

            {/* Outside User Pin Marker (Orbital Simulation) */}
            {isOutside && (
              <div className="absolute top-2 right-3 z-20 flex flex-col items-center animate-bounce">
                <div className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shadow-md whitespace-nowrap mb-1">
                  You (~{userDistance ?? "?"}m)
                </div>
                <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-white shadow-md ring-4 ring-rose-200" />
              </div>
            )}

            {isRetrying && (
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#2563EB] animate-spin" />
            )}
          </div>

          {/* Status Badge Chip */}
          <div className="mt-3 flex items-center justify-center gap-2">
            {isOutside ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                <Radio className="w-3.5 h-3.5 animate-pulse text-rose-500" /> Outside Store Perimeter
              </span>
            ) : status === "denied" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> GPS Permission Required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-slate-500" /> Access Restricted
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-3">
            You must be inside {storeName} to access
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
            Staff timesheet punching is restricted to employees on-site. SeyalPro validates your physical
            presence using high-precision GPS geofencing.
          </p>
        </div>

        {/* Middle Body: Metrics & Visual Range Bar */}
        <div className="p-6 space-y-5">
          {/* 3-Column Metrics Strip */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 mb-1">
                <Radio className="w-3 h-3 text-rose-500" /> Current Distance
              </div>
              <div className="text-base sm:text-lg font-black text-rose-600">
                {userDistance !== null ? `~${userDistance}m` : "Unknown"}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">from shop center</p>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100">
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-blue-700 mb-1">
                <MapPin className="w-3 h-3 text-blue-600" /> Store Boundary
              </div>
              <div className="text-base sm:text-lg font-black text-blue-900">
                {radius}m
              </div>
              <p className="text-[10px] text-blue-600/80 mt-0.5">allowed radius</p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 mb-1">
                <Navigation className="w-3 h-3 text-slate-500" /> GPS Fix
              </div>
              <div className="text-base sm:text-lg font-black text-slate-800">
                ±{userAccuracy !== null ? `${userAccuracy}m` : "—"}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">sensor precision</p>
            </div>
          </div>

          {/* Visual Range Indicator Bar */}
          {userDistance !== null && (
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#2563EB]" /> Proximity Meter
                </span>
                <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                  {excessDistance > 0 ? `~${excessDistance}m beyond limit` : "Inside perimeter"}
                </span>
              </div>

              {/* Progress bar container */}
              <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(18, (radius / Math.max(radius * 1.5, userDistance * 1.15)) * 100))}%`
                  }}
                  title="Allowed store perimeter"
                />
                <div className="absolute inset-y-0 right-0 bg-rose-400/60" />
              </div>

              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span className="text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Shop Center (0m)
                </span>
                <span className="text-emerald-700">Safe Boundary: {radius}m</span>
                <span className="text-rose-600">Your Location: ~{userDistance}m</span>
              </div>
            </div>
          )}

          {/* Interactive Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={isRetrying}
              className="w-full py-3 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] text-white text-xs sm:text-sm font-bold rounded-2xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
              <span>{isRetrying ? "Re-checking GPS Location..." : "Re-check Location Now"}</span>
            </button>

            <div className="text-center pt-1">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
              </Link>
            </div>
          </div>

          {/* Interactive Collapsible Troubleshooting Guide */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="w-full py-2 px-3 text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center justify-between rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-[#2563EB]" /> Why is store location required? &amp; GPS Tips
              </span>
              {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showHelp && (
              <div className="mt-2.5 p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-3 text-xs text-slate-600 leading-relaxed animate-in fade-in duration-200">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" /> Attendance Integrity
                  </h4>
                  <p>
                    SeyalPro enforces tamper-proof attendance verification to ensure employee working hours are
                    recorded accurately while physically at the store.
                  </p>
                </div>

                <div className="border-t border-slate-200/60 pt-2.5">
                  <h4 className="font-bold text-slate-800 mb-1">💡 Troubleshooting GPS Accuracy:</h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    <li>Turn on <strong>Wi-Fi</strong> on your phone/laptop (even without logging in, Wi-Fi beacons improve GPS accuracy to ~5 meters).</li>
                    <li>If prompted by your browser, tap <strong>&ldquo;Allow&rdquo;</strong> for Location permissions.</li>
                    <li>Avoid dense basements or deep interior corridors where satellite reception is blocked.</li>
                  </ul>
                </div>

                <div className="border-t border-slate-200/60 pt-2.5 text-[11px] text-slate-500">
                  <span>
                    Having hardware issues? Contact your store manager or administrator to manually log attendance from the Admin Timesheet panel.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

