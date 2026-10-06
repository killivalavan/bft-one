"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils/cn";

export interface SeyalLogoProps {
  size?: number | "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  theme?: "dark" | "light" | "auto";
  variant?: "solid" | "glow" | "minimal";
  onClick?: () => void;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 30,
  md: 36,
  lg: 44,
  xl: 56,
};

export function SeyalLogo({
  size = "md",
  className,
  showWordmark = false,
  wordmarkClassName,
  theme = "auto",
  variant = "solid",
  onClick,
}: SeyalLogoProps) {
  const reactId = useId();
  // Safe ID without colons for SVG defs
  const id = `seyal-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const pxSize = typeof size === "number" ? size : SIZE_MAP[size] || 36;

  const markSvg = (
    <svg
      viewBox="0 0 40 40"
      width={pxSize}
      height={pxSize}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-label="SeyalPro Logo"
    >
      <defs>
        {/* Background Primary Royal to Cyan Gradient */}
        <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="50%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>

        {/* Top Ribbon Arc: Pure White to Electric Sky */}
        <linearGradient id={`${id}-ribbon-top`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#93C5FD" />
        </linearGradient>

        {/* Bottom Ribbon Arc: Cyan to Pure White */}
        <linearGradient id={`${id}-ribbon-bot`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="60%" stopColor="#BAE6FD" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>

        {/* Gloss Overlay on Top Half */}
        <linearGradient id={`${id}-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Soft Ambient Shadow */}
        <filter id={`${id}-drop`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.3" />
        </filter>
      </defs>

      {variant !== "minimal" && (
        <>
          {/* Squircle Base with Glow */}
          <rect
            width="40"
            height="40"
            rx="11"
            fill={`url(#${id}-bg)`}
            filter={variant === "glow" ? `url(#${id}-drop)` : undefined}
          />

          {/* Top-Half Gloss Highlight */}
          <rect x="0.5" y="0.5" width="39" height="19" rx="10.5" fill={`url(#${id}-gloss)`} />

          {/* Glass Inset Rim Border */}
          <rect
            x="0.5"
            y="0.5"
            width="39"
            height="39"
            rx="10.5"
            stroke="#FFFFFF"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
        </>
      )}

      {/* S Upper Kinetic Ribbon Arc (Top-Right -> Top Crest -> Left Arch -> Center Drive) */}
      <path
        d="M 28 12 C 28 8.8 24.8 7 20 7 C 14 7 10.5 10.5 10.5 15.2 C 10.5 19.5 14.2 21.8 19.2 23.4 L 23.5 24.8 C 26 25.6 28 26.8 28 29"
        stroke={`url(#${id}-ribbon-top)`}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* S Lower Kinetic Ribbon Arc (Bottom-Left -> Bottom Base -> Right Arch -> Center Drive) */}
      <path
        d="M 12 28 C 12 31.2 15.2 33 20 33 C 26 33 29.5 29.5 29.5 24.8 C 29.5 20.5 25.8 18.2 20.8 16.6 L 16.5 15.2 C 14 14.4 12 13.2 12 11"
        stroke={`url(#${id}-ribbon-bot)`}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Central Action Nexus (Electric Cyan Halo + Crisp White Spark) */}
      <circle cx="20" cy="20" r="3" fill="#38BDF8" opacity="0.35" />
      <path
        d="M 20 17.5 L 20.8 19.2 L 22.5 20 L 20.8 20.8 L 20 22.5 L 19.2 20.8 L 17.5 20 L 19.2 19.2 Z"
        fill="#FFFFFF"
      />
    </svg>
  );

  if (!showWordmark) {
    return markSvg;
  }

  const textColorClass =
    theme === "light"
      ? "text-[#0F172A]"
      : theme === "dark"
      ? "text-white"
      : "text-white"; // default for dark sidebar

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 min-w-0 select-none",
        onClick && "cursor-pointer",
        wordmarkClassName
      )}
    >
      {markSvg}
      <h2 className={cn("font-extrabold tracking-tight truncate leading-none text-base", textColorClass)}>
        Seyal<span className="text-blue-400 font-black">Pro</span>
      </h2>
    </div>
  );
}

export default SeyalLogo;
