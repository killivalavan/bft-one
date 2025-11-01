"use client";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import React from "react";

function cx(...inputs: any[]) { return twMerge(clsx(inputs)); }

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", block=false, ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[.99] disabled:opacity-60 disabled:cursor-not-allowed";
    const variants: Record<string,string> = {
      primary: "bg-sky-600 text-white hover:bg-sky-700 focus-visible:ring-sky-600",
      secondary: "bg-sky-700 text-white hover:bg-sky-800 focus-visible:ring-sky-700",
      outline: "border border-sky-300 text-sky-700 hover:bg-sky-50",
      ghost: "hover:bg-zinc-100",
    };
    const sizes: Record<string,string> = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-4 text-base",
      lg: "h-12 px-5 text-base",
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
