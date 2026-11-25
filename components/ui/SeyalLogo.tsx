"use client";

import React from "react";
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

export type CounterCubLogoProps = SeyalLogoProps;

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 30,
  md: 36,
  lg: 44,
  xl: 56,
};

/** CounterCub paw mark (vector trace of /public/countercub-logo.png). Uses currentColor. */
export function CounterCubMark({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="180" cy="63" r="62" />
      <circle cx="332" cy="63" r="62" />
      <circle cx="75" cy="166" r="63" />
      <circle cx="437" cy="166" r="63" />
      <path d="M256 165C218 165 186 182 166 216L82 360C52 412 80 485 162 485H350C432 485 460 412 430 360L346 216C326 182 294 165 256 165Z" />
    </svg>
  );
}

export function SeyalLogo({
  size = "md",
  className,
  showWordmark = false,
  wordmarkClassName,
  theme = "auto",
  onClick,
}: SeyalLogoProps) {
  const pxSize = typeof size === "number" ? size : SIZE_MAP[size] || 36;
  // Next to the wordmark the paw sits at text scale; standalone it fills the requested size.
  const markSize = showWordmark ? Math.round(pxSize * 0.6) : pxSize;
  const markColor = theme === "light" ? "text-[#2563EB]" : "text-[#3B82F6]";

  const markSvg = (
    <CounterCubMark
      size={markSize}
      className={cn(markColor, className)}
      title={showWordmark ? undefined : "CounterCub"}
    />
  );

  if (!showWordmark) {
    return markSvg;
  }

  const textColorClass = theme === "light" ? "text-[#0F172A]" : "text-white";

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 min-w-0 select-none",
        onClick && "cursor-pointer",
        wordmarkClassName
      )}
    >
      {markSvg}
      <h2 className={cn("font-extrabold tracking-tight truncate leading-none text-base", textColorClass)}>
        Counter<span className="text-blue-400 font-black">Cub</span>
      </h2>
    </div>
  );
}

export const CounterCubLogo = SeyalLogo;
export default SeyalLogo;
