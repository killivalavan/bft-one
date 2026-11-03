"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  useCityDashboardData,
  CityReportingPeriod,
} from "@/lib/hooks/useCityDashboardData";
import { computeCityLayout } from "./cityLayoutEngine";
import { B2BCityCanvas, SelectedCityObject } from "./B2BCityCanvas";
import { B2BCitySkeleton, B2BAtmosphereSwitchSkeleton } from "./B2BCitySkeleton";
import {
  fetchLiveClientWeather,
  getLocalFallbackWeather,
  type CityLiveWeather,
  type CityWeatherSeason,
} from "./cityWeatherEngine";
import { saveB2BClient } from "@/lib/services/b2bClients";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import {
  Play,
  Pause,
  RefreshCw,
  RotateCcw,
  Sun,
  Moon,
  CloudRain,
  CloudLightning,
  Snowflake,
  SunMedium,
  Cloud,
  Sparkles,
  Building2,
  Package,
  CreditCard,
  Truck,
  Store,
  UtensilsCrossed,
  Send,
  X,
} from "lucide-react";

/**
 * Smoothly animates between previous and current numerical values whenever live data updates.
 */
function LiveAnimatedMetric({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const [displayVal, setDisplayVal] = useState<number>(value);
  const prevValRef = useRef<number>(value);

  useEffect(() => {
    const startVal = prevValRef.current;
    const endVal = Number.isFinite(value) ? value : 0;
    prevValRef.current = endVal;

    if (Math.abs(endVal - startVal) < 0.001) {
      setDisplayVal(endVal);
      return;
    }

    const duration = 650;
    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayVal(startVal + (endVal - startVal) * ease);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  const formatted =
    decimals > 0
      ? displayVal.toFixed(decimals)
      : Math.round(displayVal).toLocaleString("en-IN");

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export interface B2BCityDashboardProps {
  bizId: string;
  businessName?: string;
  reportingPeriod?: CityReportingPeriod;
  onReportingPeriodChange?: (period: CityReportingPeriod) => void;
  isFullScreenPage?: boolean;
  isVisible?: boolean;
  initialPlaying?: boolean;
}

export function B2BCityDashboard({
  bizId,
  businessName = "B2B Supply Hub",
  reportingPeriod: externalPeriod,
  onReportingPeriodChange,
  isFullScreenPage = false,
  isVisible = true,
  initialPlaying = true,
}: B2BCityDashboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [internalPeriod, setInternalPeriod] = useState<CityReportingPeriod>("this_month");
  const activePeriod = externalPeriod ?? internalPeriod;

  // Viewport & Play/Stop State: 3D only performs when in viewport AND Play is active!
  const [isPlaying, setIsPlaying] = useState<boolean>(initialPlaying);
  const [isInViewport, setIsInViewport] = useState<boolean>(true);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(true);

  useEffect(() => {
    const checkVisibility = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // In viewport if at least 60px of the 3D card is visible on screen
      const inView = rect.bottom > 60 && rect.top < vh - 60;
      setIsInViewport(inView);
    };

    checkVisibility();

    let rafId = 0;
    const handleScrollOrResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        checkVisibility();
        rafId = 0;
      });
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    document.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });

    let observer: IntersectionObserver | null = null;
    if (containerRef.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.05) {
            setIsInViewport(false);
          } else {
            checkVisibility();
          }
        },
        {
          threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0],
          rootMargin: "-40px 0px -40px 0px",
        }
      );
      observer.observe(containerRef.current);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("scroll", handleScrollOrResize, { capture: true });
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVisChange = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  const isSimulating = isPlaying && isInViewport && isTabVisible && isVisible;

  const handlePeriodChange = (p: CityReportingPeriod) => {
    setInternalPeriod(p);
    onReportingPeriodChange?.(p);
  };

  // 1. Live Data Engine (60s auto-polling + instant client creation event listener)
  const {
    hqStats,
    warehouseStats,
    financeStats,
    storeNodes,
    fleetStats,
    syncMeta,
  } = useCityDashboardData(bizId, businessName, activePeriod);

  // 2. Deterministic 3D City Layout (HQ building named with the user's Store Name)
  const cityLayout = useMemo(
    () => computeCityLayout(storeNodes, hqStats.businessName),
    [storeNodes, hqStats.businessName]
  );

  // 3. Interactive Scene State
  const [selectedObj, setSelectedObj] = useState<SelectedCityObject | null>(null);
  const [isNightMode, setIsNightMode] = useState<boolean>(false);
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0);
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [isCanvasMounted, setIsCanvasMounted] = useState<boolean>(false);
  const [isSceneReady, setIsSceneReady] = useState<boolean>(false);

  // Existing shimmer overlay during Day/Night toggle
  const [isSwitchingAtmosphere, setIsSwitchingAtmosphere] = useState<boolean>(false);
  const [targetNightMode, setTargetNightMode] = useState<boolean>(false);
  const switchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleToggleDayNight = useCallback(() => {
    const nextNight = !isNightMode;
    setTargetNightMode(nextNight);
    // 1. Immediately show the existing shimmer
    setIsSwitchingAtmosphere(true);

    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);

    // 2. Allow the browser to immediately paint the shimmer before running the mode update
    setTimeout(() => {
      setIsNightMode(nextNight);

      // 3. Keep the existing shimmer visible for ~400ms for a smooth, visible transition
      switchTimerRef.current = setTimeout(() => {
        setIsSwitchingAtmosphere(false);
      }, 400);
    }, 50);
  }, [isNightMode]);

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, []);

  // Weather & Seasonal Climate State (100% Live based on Client Location)
  const [liveWeather, setLiveWeather] = useState<CityLiveWeather>(() =>
    getLocalFallbackWeather(businessName)
  );

  useEffect(() => {
    let isMounted = true;
    fetchLiveClientWeather(businessName).then((w) => {
      if (isMounted) {
        setLiveWeather(w);
        // Automatic night view if local climate reports night
        if (w.isNight) {
          setIsNightMode(true);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [businessName]);

  const activeSeason: CityWeatherSeason = liveWeather.season;

  // Mount canvas after browser paints the initial page skeleton to eliminate navigation lag
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setIsCanvasMounted(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Keep selected object synchronized with latest live metrics without closing the open card
  const activeSelectedPlacement = useMemo(() => {
    if (!selectedObj) return null;
    if (selectedObj.id === "building-hq") return cityLayout.hqPlacement;
    if (selectedObj.id === "building-warehouse") return cityLayout.warehousePlacement;
    if (selectedObj.id === "building-finance") return cityLayout.financePlacement;
    if (selectedObj.id.startsWith("store-")) {
      return (
        cityLayout.storePlacements.find((s) => s.id === selectedObj.id) ||
        selectedObj.placement
      );
    }
    return selectedObj.placement;
  }, [selectedObj, cityLayout]);

  // Close card on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedObj(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate z-0 w-full overflow-hidden rounded-3xl border border-slate-200/90 bg-slate-900 shadow-sm",
        isFullScreenPage ? "h-[calc(100vh-5.5rem)] min-h-[600px]" : "h-[560px] sm:h-[620px]"
      )}
    >
      {/* ================================================================= */}
      {/* 1. THREE.JS 3D ISOMETRIC WORLD CANVAS                             */}
      {/* ================================================================= */}
      {isCanvasMounted && (
        <B2BCityCanvas
          layout={cityLayout}
          recentDispatches={fleetStats.recentDispatches}
          selectedId={selectedObj?.id || null}
          onSelectObject={setSelectedObj}
          isNightMode={isNightMode}
          season={activeSeason}
          cameraResetTrigger={cameraResetTrigger}
          focusTargetId={focusTargetId}
          isSimulating={isSimulating}
          onLoaded={() => {
            setIsSceneReady(true);
          }}
        />
      )}

      {/* 1. Initial Load: Rich Isometric 3D View Skeleton */}
      {!isSceneReady && (
        <div className="absolute inset-0 z-50 transition-opacity duration-300">
          <B2BCitySkeleton />
        </div>
      )}

      {/* 2. Day/Night Toggle Shimmer (Smooth 400ms transition) */}
      {isSwitchingAtmosphere && (
        <div className="absolute inset-0 z-50 transition-opacity duration-300">
          <B2BAtmosphereSwitchSkeleton isNight={targetNightMode} />
        </div>
      )}

      {/* Interactive Play Overlay when 3D Simulation is Paused / Stopped */}
      {!isPlaying && (
        <div className="pointer-events-auto absolute inset-0 z-25 flex items-center justify-center bg-slate-950/25 backdrop-blur-[2px] transition-opacity">
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            className="group flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-2xl ring-4 ring-white/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Play size={16} className="fill-white text-white ml-0.5" />
            </span>
            <div className="text-left">
              <span className="block leading-tight">Play Live 3D View</span>
              <span className="block text-[10px] font-semibold text-blue-100">
                Click to start 3D dispatch animation (auto-pauses out of view)
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. TOP FLOATING HUD: LIVE SYNC STATUS, PERIOD & SCENE CONTROLS    */}
      {/* ================================================================= */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-nowrap pb-0.5">
        {/* Left HUD Pill: Title + LIVE Sync Status */}
        <div className="pointer-events-auto inline-flex items-center flex-nowrap gap-2 sm:gap-2.5 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs shrink-0">
              <Building2 size={13} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                3D View
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-extrabold shrink-0">
                {storeNodes.length} {storeNodes.length === 1 ? "Store" : "Stores"}
              </span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-slate-200 shrink-0" />

          {/* LIVE Dot Indicator (Grey if > 30 mins old, Emerald if fresh, Amber if Paused/Off-screen) */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                !isSimulating
                  ? "bg-amber-400 ring-4 ring-amber-400/20"
                  : syncMeta.isStale
                  ? "bg-slate-400"
                  : "bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20"
              )}
            />
            <span
              className={
                !isSimulating
                  ? "text-amber-700 font-extrabold"
                  : syncMeta.isStale
                  ? "text-slate-500"
                  : "text-emerald-700 font-extrabold"
              }
            >
              {!isSimulating ? (!isInViewport ? "AUTO-PAUSED" : "PAUSED") : "LIVE"}
            </span>
            {!isInViewport && (
              <span className="hidden sm:inline px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 font-bold text-[9.5px] border border-amber-200">
                Off-Screen
              </span>
            )}
            <span className="text-slate-500 font-medium">
              ·{" "}
              {syncMeta.minutesAgo === 0
                ? "updated just now"
                : `updated ${syncMeta.minutesAgo} min ago`}
            </span>
            <button
              type="button"
              onClick={() => syncMeta.refreshNow()}
              title="Sync latest live numbers now"
              className="ml-0.5 p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer shrink-0"
            >
              <RefreshCw size={11} className={syncMeta.isSyncing ? "animate-spin text-blue-600" : ""} />
            </button>
          </div>
        </div>

        {/* Right HUD Controls: Period Filter, Quick Jump, Scene Controls */}
        <div className="pointer-events-auto flex items-center flex-nowrap gap-1.5 shrink-0 whitespace-nowrap">
          {/* Period Switcher (Specifically for 3D City) */}
          <div className="inline-flex items-center p-0.5 sm:p-1 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm text-[11px] font-bold text-slate-600 shrink-0">
            {(
              [
                { id: "this_month", label: "Month" },
                { id: "last_30_days", label: "30d" },
                { id: "last_7_days", label: "7d" },
                { id: "all_time", label: "All" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handlePeriodChange(tab.id)}
                className={cn(
                  "px-2 sm:px-2.5 py-1 rounded-lg transition cursor-pointer",
                  activePeriod === tab.id
                    ? "bg-blue-600 text-white font-extrabold shadow-2xs"
                    : "hover:text-slate-900"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Store Quick-Jump Selector */}
          <div className="relative shrink-0">
            <select
              aria-label="Fly to building or client store"
              value={selectedObj?.id || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedObj(null);
                  setCameraResetTrigger((c) => c + 1);
                } else {
                  setFocusTargetId(val);
                }
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[170px] sm:max-w-[210px] truncate"
            >
              <option value="">Fly to Building ({storeNodes.length} Stores)...</option>
              <optgroup label="Core Command Buildings">
                <option value="building-hq">🏢 {hqStats.businessName} (₹{hqStats.grossSales.toLocaleString("en-IN")})</option>
                <option value="building-warehouse">🏭 Catalog Warehouse ({warehouseStats.activeProductsCount} items)</option>
                <option value="building-finance">🏦 Finance Vault (₹{financeStats.pendingDues.toLocaleString("en-IN")} due)</option>
                <option value="van-0">🚚 Delivery Truck (Blue)</option>
                <option value="van-1">🚚 Delivery Truck (Gold)</option>
              </optgroup>
              <optgroup label="Partner Client Stores">
                {cityLayout.storePlacements.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    🏪 {sp.label} ({sp.subLabel})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Play / Stop 3D Simulation Button */}
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer border shrink-0",
              isSimulating
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                : "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
            )}
            title={isSimulating ? "Pause 3D live animation" : "Start 3D live animation"}
          >
            {isSimulating ? <Pause size={13} /> : <Play size={13} className="fill-white" />}
            <span>{isSimulating ? "Pause 3D" : "Play 3D"}</span>
          </button>

          {/* Live Climate & Temperature Status (100% Real-Time based on Client Location) */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs font-bold text-slate-800 select-none shrink-0"
            title={`Live Client Location Climate: ${liveWeather.cityName} (${liveWeather.conditionLabel})`}
          >
            {liveWeather.season === "thunderstorm" && (
              <CloudLightning size={14} className="text-amber-500 animate-pulse" />
            )}
            {liveWeather.season === "monsoon" && (
              <CloudRain size={14} className="text-blue-600" />
            )}
            {liveWeather.season === "rain" && (
              <CloudRain size={14} className="text-sky-500" />
            )}
            {liveWeather.season === "snow" && (
              <Snowflake size={14} className="text-sky-400" />
            )}
            {liveWeather.season === "hot" && (
              <SunMedium size={14} className="text-amber-500" />
            )}
            {liveWeather.season === "cloudy" && (
              <Cloud size={14} className="text-slate-500" />
            )}
            {liveWeather.season === "clear" && (
              <Sparkles size={14} className="text-amber-500" />
            )}
            <span className="tracking-tight">
              {liveWeather.temperatureC}°C ·{" "}
              {liveWeather.season === "thunderstorm"
                ? "Thunderstorm"
                : liveWeather.season === "monsoon"
                ? "Monsoon"
                : liveWeather.season === "rain"
                ? "Rain"
                : liveWeather.season === "snow"
                ? "Snow"
                : liveWeather.season === "hot"
                ? "Hot"
                : liveWeather.season === "cloudy"
                ? "Cloudy"
                : "Clear"}
            </span>
          </div>

          {/* Camera Reset & Day/Night */}
          <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedObj(null);
                setFocusTargetId(null);
                setCameraResetTrigger((c) => c + 1);
              }}
              title="Reset 3D camera view"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={handleToggleDayNight}
              title={isNightMode ? "Switch to Daylight mode" : "Switch to Night City mode"}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            >
              {isNightMode ? <Sun size={13} className="text-amber-500" /> : <Moon size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. FROSTED-GLASS LIVE STATS CARD OVERLAY (ON OBJECT CLICK)        */}
      {/* ================================================================= */}
      {activeSelectedPlacement && (
        <div className="pointer-events-auto absolute top-20 right-3 sm:right-4 z-30 w-[calc(100%-1.5rem)] sm:w-88 rounded-3xl bg-white/88 backdrop-blur-xl border border-white/90 shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          {/* Card Header */}
          <div className="flex items-start justify-between gap-2.5 border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-xs",
                  activeSelectedPlacement.kind === "hq"
                    ? "bg-blue-600"
                    : activeSelectedPlacement.kind === "warehouse"
                    ? "bg-emerald-600"
                    : activeSelectedPlacement.kind === "finance"
                    ? "bg-amber-600"
                    : activeSelectedPlacement.kind === "van"
                    ? "bg-indigo-600"
                    : activeSelectedPlacement.kind === "tree_cafe"
                    ? "bg-amber-500 shadow-amber-500/20"
                    : activeSelectedPlacement.storeNode?.healthStatus === "urgent"
                    ? "bg-rose-600"
                    : activeSelectedPlacement.storeNode?.healthStatus === "warning"
                    ? "bg-amber-500"
                    : "bg-emerald-600"
                )}
              >
                {activeSelectedPlacement.kind === "hq" && <Building2 size={20} />}
                {activeSelectedPlacement.kind === "warehouse" && <Package size={20} />}
                {activeSelectedPlacement.kind === "finance" && <CreditCard size={20} />}
                {activeSelectedPlacement.kind === "van" && <Truck size={20} />}
                {activeSelectedPlacement.kind === "store" && <Store size={20} />}
                {activeSelectedPlacement.kind === "tree_cafe" && <UtensilsCrossed size={20} />}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 block">
                  {activeSelectedPlacement.kind === "hq" && "Central Command HQ"}
                  {activeSelectedPlacement.kind === "warehouse" && "Production & Stock"}
                  {activeSelectedPlacement.kind === "finance" && "Receivables & Ledger"}
                  {activeSelectedPlacement.kind === "van" && "Live Dispatch Fleet"}
                  {activeSelectedPlacement.kind === "store" && "Partner Client Store"}
                  {activeSelectedPlacement.kind === "tree_cafe" && "Top-Selling Bestseller"}
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {activeSelectedPlacement.label}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedObj(null)}
              className="p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 transition cursor-pointer"
              aria-label="Close stats card"
            >
              <X size={15} />
            </button>
          </div>

          {/* 3A. CENTRAL SUPPLY HUB HQ STATS */}
          {activeSelectedPlacement.kind === "hq" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Gross Sales ({hqStats.periodLabel})
                  </span>
                  <LiveAnimatedMetric
                    value={hqStats.grossSales}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-blue-600">
                    Today: ₹{hqStats.todaySales.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/70">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                    Take-Home Profit
                  </span>
                  <LiveAnimatedMetric
                    value={hqStats.netProfit}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-emerald-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-bold text-emerald-700">
                    {hqStats.profitMarginPct}% Net Margin
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Dispatched Volume
                  </span>
                  <LiveAnimatedMetric
                    value={hqStats.totalPiecesDispatched}
                    suffix=" pcs"
                    className="text-sm sm:text-base font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Across {hqStats.totalSlips} slips
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/70">
                  <span className="text-[10px] font-bold text-blue-800 uppercase block">
                    Partner Network
                  </span>
                  <LiveAnimatedMetric
                    value={hqStats.activeStoresCount}
                    suffix=" Stores"
                    className="text-sm sm:text-base font-black text-blue-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-blue-600 font-semibold">
                    Active in 3D View
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/b2b/dispatch"
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold text-center transition"
                >
                  + New Dispatch Slip
                </Link>
                <Link
                  href="/b2b/reports"
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
                >
                  Reports →
                </Link>
              </div>
            </div>
          )}

          {/* 3B. CATALOG & STOCK WAREHOUSE STATS */}
          {activeSelectedPlacement.kind === "warehouse" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Active Products
                  </span>
                  <LiveAnimatedMetric
                    value={warehouseStats.activeProductsCount}
                    suffix=" items"
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Wholesale Catalog
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/70">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                    Avg Unit Margin
                  </span>
                  <LiveAnimatedMetric
                    value={warehouseStats.avgMarginPct}
                    suffix="%"
                    decimals={1}
                    className="text-base sm:text-lg font-black text-emerald-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    Across catalog
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Available Stock
                  </span>
                  <LiveAnimatedMetric
                    value={warehouseStats.totalStockUnits}
                    suffix=" units"
                    className="text-sm sm:text-base font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Ready for dispatch
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/70">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">
                    Top Seller
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 truncate block mt-0.5">
                    {warehouseStats.topProductName}
                  </span>
                  <span className="text-[10px] text-amber-700 font-bold">
                    {warehouseStats.topProductUnits} pcs (₹{warehouseStats.topProductRevenue.toLocaleString("en-IN")})
                  </span>
                </div>
              </div>

              <Link
                href="/b2b/products"
                className="block w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold text-center transition"
              >
                Manage Product Catalog &amp; Pricing →
              </Link>
            </div>
          )}

          {/* 3C. FINANCE & RECEIVABLES VAULT STATS */}
          {activeSelectedPlacement.kind === "finance" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/70">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                    Collected Revenue
                  </span>
                  <LiveAnimatedMetric
                    value={financeStats.collectedPayments}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-emerald-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-bold text-emerald-700">
                    {financeStats.collectionRatePct}% Collection Rate
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-rose-50/80 border border-rose-200/70">
                  <span className="text-[10px] font-bold text-rose-800 uppercase block">
                    Pending Client Dues
                  </span>
                  <LiveAnimatedMetric
                    value={financeStats.pendingDues}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-rose-600 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-bold text-rose-700">
                    {financeStats.storesWithDuesCount} stores with dues
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Operating Expenses
                  </span>
                  <LiveAnimatedMetric
                    value={financeStats.operatingExpenses}
                    prefix="₹"
                    className="text-sm sm:text-base font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Raw materials &amp; ops
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/70">
                  <span className="text-[10px] font-bold text-blue-800 uppercase block">
                    Net Cash Flow
                  </span>
                  <LiveAnimatedMetric
                    value={financeStats.netCashFlow}
                    prefix="₹"
                    className="text-sm sm:text-base font-black text-blue-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] text-blue-600 font-semibold">
                    Collected minus Cost
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/b2b/payments"
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold text-center transition"
                >
                  Record Payment
                </Link>
                <Link
                  href="/b2b/expenses"
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
                >
                  Expenses →
                </Link>
              </div>
            </div>
          )}

          {/* 3D. FLEET DELIVERY VAN STATS */}
          {activeSelectedPlacement.kind === "van" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/70">
                  <span className="text-[10px] font-bold text-blue-800 uppercase block">
                    Today&apos;s Dispatches
                  </span>
                  <LiveAnimatedMetric
                    value={fleetStats.todayDispatchedPieces}
                    suffix=" pcs"
                    className="text-base sm:text-lg font-black text-blue-700 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-blue-600">
                    {fleetStats.todaySlipsCount} slips today
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Avg Drop Size
                  </span>
                  <LiveAnimatedMetric
                    value={fleetStats.avgPiecesPerSlip}
                    suffix=" pcs"
                    decimals={1}
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-slate-500">
                    Per delivery slip
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70 text-xs space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Truck Route Queue (Last 3 Dispatches)
                </span>
                {fleetStats.recentDispatches.length > 0 ? (
                  <div className="space-y-1.5">
                    {fleetStats.recentDispatches.map((d) => (
                      <div
                        key={`${d.dispatchRank}-${d.slipNumber}`}
                        className="flex items-center justify-between gap-2 font-bold text-slate-800"
                      >
                        <span className="truncate">
                          #{d.dispatchRank} · {d.displayName}{" "}
                          <span className="text-[10px] text-slate-400 font-semibold">
                            ({d.slipNumber})
                          </span>
                        </span>
                        <span className="text-blue-600 font-black shrink-0">
                          ₹{d.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>{fleetStats.latestSlipNumber} · {fleetStats.latestSlipStore}</span>
                    <span className="text-blue-600 font-black">
                      ₹{fleetStats.latestSlipAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </div>

              <Link
                href="/b2b/dispatch"
                className="block w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold text-center transition"
              >
                Dispatch New Delivery Slip →
              </Link>
            </div>
          )}

          {/* 3E. INDIVIDUAL CLIENT STORE STATS */}
          {activeSelectedPlacement.kind === "store" && activeSelectedPlacement.storeNode && (
            <div className="space-y-3">
              {/* Store Status Banner */}
              <div
                className={cn(
                  "px-3 py-2 rounded-xl border text-xs flex items-center justify-between",
                  activeSelectedPlacement.storeNode.healthStatus === "urgent"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : activeSelectedPlacement.storeNode.healthStatus === "warning"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                )}
              >
                <span className="font-bold truncate">
                  {activeSelectedPlacement.storeNode.explanation}
                </span>
              </div>

              {/* 4 Live Store Metrics */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Total Billed
                  </span>
                  <LiveAnimatedMetric
                    value={activeSelectedPlacement.storeNode.billedAmount}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-slate-500">
                    {activeSelectedPlacement.storeNode.slipsCount} delivery slips
                  </span>
                </div>

                <div
                  className={cn(
                    "p-3 rounded-2xl border",
                    activeSelectedPlacement.storeNode.unpaidDues > 0
                      ? "bg-rose-50/85 border-rose-200/80"
                      : "bg-emerald-50/85 border-emerald-200/80"
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase block",
                      activeSelectedPlacement.storeNode.unpaidDues > 0
                        ? "text-rose-800"
                        : "text-emerald-800"
                    )}
                  >
                    Pending Dues
                  </span>
                  <LiveAnimatedMetric
                    value={activeSelectedPlacement.storeNode.unpaidDues}
                    prefix="₹"
                    className={cn(
                      "text-base sm:text-lg font-black tabular-nums mt-0.5 block",
                      activeSelectedPlacement.storeNode.unpaidDues > 0
                        ? "text-rose-600"
                        : "text-emerald-700"
                    )}
                  />
                  <span className="text-[10px] font-bold text-slate-600">
                    Paid: ₹{activeSelectedPlacement.storeNode.paidAmount.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Units Supplied
                  </span>
                  <LiveAnimatedMetric
                    value={activeSelectedPlacement.storeNode.dispatchedUnits}
                    suffix=" pcs"
                    className="text-sm sm:text-base font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-blue-600 truncate block">
                    Top: {activeSelectedPlacement.storeNode.topProduct}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Last Dispatch
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 block mt-0.5 truncate">
                    {activeSelectedPlacement.storeNode.lastOrderDateStr}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 block truncate">
                    {activeSelectedPlacement.storeNode.daysSinceLastOrder !== null
                      ? `${activeSelectedPlacement.storeNode.daysSinceLastOrder}d ago`
                      : "Ready for 1st order"}
                  </span>
                </div>
              </div>

              {/* Quick Actions for this Store */}
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href={`/b2b/dispatch?client=${encodeURIComponent(activeSelectedPlacement.storeNode.name)}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold text-center transition flex items-center justify-center gap-1.5"
                >
                  <Send size={12} />
                  <span>New Slip</span>
                </Link>
                {activeSelectedPlacement.storeNode.unpaidDues > 0 && (
                  <Link
                    href={`/b2b/payments?store=${encodeURIComponent(activeSelectedPlacement.storeNode.name)}`}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition"
                  >
                    Collect Due
                  </Link>
                )}
                <Link
                  href="/b2b/customers"
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  Ledger
                </Link>
              </div>
            </div>
          )}

          {/* 3F. TOP-SELLING BAKERY PRODUCT STATS (TREE CAFE PATRON) */}
          {activeSelectedPlacement.kind === "tree_cafe" && (
            <div className="space-y-3">
              {/* Product Highlight Banner */}
              <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800 block">
                    Verified Top-Selling Bake
                  </span>
                  <span className="text-xs font-bold text-amber-900 block mt-0.5">
                    Sold at {activeSelectedPlacement.topProductMeta?.storeName || "Partner Store"}
                  </span>
                </div>
                <span className="px-2 py-1 rounded-lg bg-amber-200/80 text-amber-900 text-[10.5px] font-black border border-amber-300">
                  Top #1 Volume
                </span>
              </div>

              {/* 4-Box Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Dispatched Units
                  </span>
                  <LiveAnimatedMetric
                    value={activeSelectedPlacement.topProductMeta?.units || 32}
                    suffix=" pcs"
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-emerald-600">
                    High consumer demand
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Product Revenue
                  </span>
                  <LiveAnimatedMetric
                    value={activeSelectedPlacement.topProductMeta?.revenue || 1440}
                    prefix="₹"
                    className="text-base sm:text-lg font-black text-slate-900 tabular-nums mt-0.5 block"
                  />
                  <span className="text-[10px] font-semibold text-slate-500">
                    Gross sales volume
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Wholesale Price
                  </span>
                  <span className="text-sm sm:text-base font-black text-slate-900 block mt-0.5">
                    ₹{activeSelectedPlacement.topProductMeta?.wholesaleRate || 45} / pc
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    Standard supply tier
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Profit Margin
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-700 block mt-0.5">
                    {activeSelectedPlacement.topProductMeta?.marginPct || 58.4}%
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600">
                    Strong margin item
                  </span>
                </div>
              </div>

              {/* Delivery Origin Note */}
              <div className="px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200/70 text-[11px] text-blue-900 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Truck size={13} className="text-blue-600 shrink-0" />
                  <span className="truncate">
                    Delivered from <b>{hqStats.businessName}</b>
                  </span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                  Fresh Batch
                </span>
              </div>

              {/* Quick Action Links */}
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href={`/b2b/dispatch?client=${encodeURIComponent(
                    activeSelectedPlacement.topProductMeta?.storeName || ""
                  )}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold text-center transition flex items-center justify-center gap-1.5"
                >
                  <Send size={12} />
                  <span>Dispatch More</span>
                </Link>
                <Link
                  href="/b2b/products"
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  Catalog Specs
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. BOTTOM LEGEND & QUICK INTERACTION BAR                          */}
      {/* ================================================================= */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/85 backdrop-blur-md border border-slate-200/80 shadow-xs text-[11px] font-bold text-slate-700">
          <button
            type="button"
            onClick={() => setFocusTargetId("building-hq")}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-blue-50 text-blue-700 transition cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>Central HQ</span>
          </button>
          <button
            type="button"
            onClick={() => setFocusTargetId("building-warehouse")}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-slate-100 text-slate-700 transition cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            <span>Warehouse</span>
          </button>
          <button
            type="button"
            onClick={() => setFocusTargetId("building-finance")}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-emerald-50 text-emerald-800 transition cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Finance Vault</span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy Store
          </span>
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Reduced Orders
          </span>
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Overdue / High Dues
          </span>
        </div>

        <div className="pointer-events-auto hidden md:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-semibold">
          <span>Drag to rotate · Scroll to zoom · Click any building or van for live stats</span>
        </div>
      </div>
    </div>
  );
}

