"use client";
import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cx(...i:any[]){ return twMerge(clsx(i)); }

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref)=>{
  return <input ref={ref} className={cx("h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shadow-2xs", className)} {...props}/>;
});
Input.displayName = "Input";
