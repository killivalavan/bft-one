"use client";

import React from "react";
import { Building2, Loader2 } from "lucide-react";

/**
 * 1. Clean & Simple Initial Load Shimmer matching the B2B Dashboard Theme
 */
export function B2BCitySkeleton() {
  return (
    <div
      className="relative w-full h-[560px] sm:h-[620px] rounded-3xl border border-slate-200/90 bg-slate-100/70 overflow-hidden shadow-xs flex flex-col justify-between p-3 sm:p-4 select-none animate-in fade-in duration-150"
      aria-label="Loading 3D View..."
      role="status"
    >
      {/* 1. Top HUD Skeleton Bar (mirrors the actual HUD pill layout) */}
      <div className="flex items-center justify-between gap-2 w-full pointer-events-none">
        {/* Left HUD Pill Skeleton */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-2xs">
          <div className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-600 flex items-center justify-center">
            <Building2 size={13} className="text-blue-600 opacity-60" />
          </div>
          <div className="w-16 h-3 rounded-md bg-slate-200/80 animate-pulse" />
          <div className="w-12 h-4 rounded-md bg-blue-50 border border-blue-100 animate-pulse" />
        </div>

        {/* Right HUD Controls Skeleton */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="w-32 h-7 rounded-xl bg-white/90 border border-slate-200/90 shadow-2xs animate-pulse" />
          <div className="w-20 h-7 rounded-xl bg-white/90 border border-slate-200/90 shadow-2xs animate-pulse" />
        </div>
      </div>

      {/* 2. Center Clean Loading Card */}
      <div className="my-auto flex flex-col items-center justify-center text-center px-4">
        <div className="rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm p-6 sm:p-7 max-w-xs w-full flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
            <Loader2 size={20} className="animate-spin text-blue-600" />
          </div>

          <div className="space-y-1">
            <span className="text-sm font-bold text-slate-900 block tracking-tight">
              Loading 3D View...
            </span>
            <span className="text-[11px] font-medium text-slate-500 block">
              Preparing atmosphere and live stores
            </span>
          </div>

          {/* Clean Subtle Shimmer Bar */}
          <div className="w-32 h-1 rounded-full bg-slate-100 overflow-hidden relative mt-1">
            <div className="w-full h-full bg-blue-600/70 rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* 3. Bottom Minimal Status Note */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="font-semibold text-slate-500">Interactive 3D Dispatch Map</span>
        <span className="hidden sm:inline">Orbit Controls · WebGL</span>
      </div>
    </div>
  );
}

/**
 * 2. Day/Night Toggle Shimmer: Smooth 400ms Atmospheric Transition Overlay (Untouched)
 */
export function B2BAtmosphereSwitchSkeleton({ isNight = false }: { isNight?: boolean }) {
  const title = isNight ? "Switching to Night View..." : "Switching to Daylight...";

  return (
    <div
      className={`relative isolate z-0 w-full h-full rounded-3xl border ${
        isNight
          ? "border-slate-800 bg-slate-950/90 text-white"
          : "border-slate-200/90 bg-white/90 text-slate-800"
      } backdrop-blur-md shadow-2xs flex flex-col items-center justify-center gap-3 text-center select-none animate-in fade-in duration-150`}
      role="status"
      aria-label={title}
    >
      <div
        className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-2xs ${
          isNight
            ? "bg-slate-900 border border-slate-700"
            : "bg-blue-50 border border-blue-100"
        }`}
      >
        <Loader2
          size={22}
          className={`animate-spin ${isNight ? "text-amber-400" : "text-blue-600"}`}
        />
      </div>
      <div className="space-y-0.5">
        <span
          className={`text-xs sm:text-sm font-bold tracking-tight block ${
            isNight ? "text-slate-100" : "text-slate-800"
          }`}
        >
          {title}
        </span>
        <span
          className={`text-[11px] font-medium block ${
            isNight ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Rendering atmosphere and lighting
        </span>
      </div>
    </div>
  );
}
