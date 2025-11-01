"use client";
import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cx(...i:any[]){ return twMerge(clsx(i)); }

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref)=>{
  return <input ref={ref} className={cx("h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-[15px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-600", className)} {...props}/>;
});
Input.displayName = "Input";
