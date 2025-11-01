import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cx(...i:any[]){ return twMerge(clsx(i)); }

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-zinc-200 bg-white shadow-sm", className)} {...props} />
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-4 border-b", className)} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-4", className)} {...props} />
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-4 border-t", className)} {...props} />
}
