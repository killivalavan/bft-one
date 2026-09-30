import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Bell, Box, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Notification {
    id: string;
    message: string;
    kind: string;
    created_at: string;
    product_id?: string | null;
}

interface NotificationItemProps {
    notification: Notification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
    const isStock = notification.kind === 'stock';
    const Icon = isStock ? Box : Info;
    const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

    return (
        <div className={cn(
            "group relative flex gap-4 p-4 rounded-xl border transition-all duration-300",
            isStock
                ? "bg-amber-50/50 border-amber-200 hover:border-amber-300"
                : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
        )}>
            <div className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border",
                isStock ? "bg-[#FFFBEB] text-[#D97706] border-[#FEF3C7]" : "bg-[#EFF6FF] text-[#2563EB] border-[#DBEAFE]"
            )}>
                <Icon size={20} />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 leading-snug">
                    {notification.message}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-slate-500 font-medium">{timeAgo}</span>
                    {notification.product_id && (
                        <Link
                            href={`/billing?pid=${notification.product_id}`}
                            className="text-[10px] font-bold uppercase tracking-wide text-[#2563EB] hover:text-[#1D4ED8] hover:underline"
                        >
                            View Product
                        </Link>
                    )}
                </div>
            </div>

            {/* Status tag */}
            <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
                {notification.kind}
            </div>
        </div>
    );
}
