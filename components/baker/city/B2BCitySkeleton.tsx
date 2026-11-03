"use client";

import React from "react";
import { Truck, Cpu, Loader2 } from "lucide-react";

/**
 * 1. Initial Load Skeleton: Rich Isometric Grid, Telemetry Scanner & Loading 3D View
 */
export function B2BCitySkeleton() {
  return (
    <div
      className="relative w-full h-[560px] sm:h-[620px] rounded-3xl border border-slate-200/90 bg-gradient-to-b from-[#0B1120] via-[#0F172A] to-[#070D18] overflow-hidden shadow-sm flex flex-col justify-between p-4 sm:p-6 select-none"
      aria-label="Loading 3D View..."
      role="status"
    >
      {/* 1. Animated Isometric Grid Lines Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.25) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.25) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
            transform: "perspective(600px) rotateX(48deg) scale(1.4)",
            transformOrigin: "center 75%",
          }}
        />
      </div>

      {/* 2. Ambient Shimmer Glow Effects */}
      <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-blue-600/15 blur-3xl pointer-events-none animate-pulse" />
      <div
        className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none animate-pulse"
        style={{ animationDelay: "1s" }}
      />

      {/* 3. Top HUD Skeleton Bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 animate-pulse">
          <div className="w-7 h-7 rounded-xl bg-blue-500/30" />
          <div className="w-28 h-3.5 rounded bg-white/20" />
          <div className="w-14 h-3.5 rounded bg-white/10 hidden xs:block" />
        </div>

        <div className="flex items-center gap-2">
          <div className="w-28 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 animate-pulse hidden md:block" />
          <div className="w-24 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 animate-pulse" />
        </div>
      </div>

      {/* 4. Center High-Tech Loading Card */}
      <div className="relative z-10 my-auto flex flex-col items-center text-center">
        <div className="relative rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-blue-500/25 p-6 sm:p-8 shadow-2xl max-w-sm w-full mx-auto space-y-4">
          {/* Animated Icon Avatar */}
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Truck size={26} className="text-white drop-shadow-md" />
            <div className="absolute -inset-1 rounded-2xl border-2 border-cyan-400/50 border-t-transparent animate-spin" />
          </div>

          {/* Heading & Status Text */}
          <div className="space-y-1.5">
            <h3 className="text-white text-base sm:text-lg font-black tracking-tight">
              Loading 3D View
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              Generating isometric buildings, fleet paths &amp; live store telemetry...
            </p>
          </div>

          {/* Shimmering Progress Scanner Bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-[shimmer_1.4s_infinite]" />
          </div>

          {/* Performance Badge */}
          <div className="pt-1 flex items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-500/30 text-[11px] font-bold text-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <Cpu size={12} className="text-cyan-400" />
              <span>High-Performance WebGL Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Status / Hint Skeleton */}
      <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-500 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700 animate-pulse" />
          <span className="text-slate-400 font-semibold">Initializing scene graphics</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">WebGL 2.0 · Orbit Controls</span>
      </div>
    </div>
  );
}

/**
 * 2. Day/Night Toggle Shimmer: Smooth 400ms Atmospheric Transition Overlay
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
