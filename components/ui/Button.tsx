"use client";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import React from "react";

function cx(...inputs: any[]) { return twMerge(clsx(inputs)); }

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", block=false, ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none";
    const variants: Record<string,string> = {
      primary: "bg-[#2563EB] text-white hover:bg-[#1D4ED8] focus-visible:ring-[#2563EB] shadow-xs font-semibold",
      secondary: "bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50 focus-visible:ring-slate-300 shadow-xs font-semibold",
      outline: "bg-white border border-[#E2E8F0] text-[#2563EB] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] focus-visible:ring-[#2563EB] font-medium",
      ghost: "text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A] font-medium",
      danger: "bg-[#DC2626] text-white hover:bg-[#B91C1C] focus-visible:ring-[#DC2626] shadow-xs font-semibold",
      success: "bg-[#16A34A] text-white hover:bg-[#15803D] focus-visible:ring-[#16A34A] shadow-xs font-semibold",
    };
    const sizes: Record<string,string> = {
      sm: "h-8.5 px-3 text-xs sm:text-sm gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-11 px-5 text-base gap-2.5",
    };
    return (
      <button ref={ref}
        className={cx(base, variants[variant], sizes[size], block && "w-full", className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
