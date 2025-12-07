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
                ? "bg-amber-50/50 border-amber-100 hover:border-amber-200"
                : "bg-white border-zinc-100 hover:border-zinc-200 hover:shadow-sm"
        )}>
            <div className={cn(
                "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                isStock ? "bg-amber-100 text-amber-600" : "bg-sky-50 text-sky-600"
            )}>
                <Icon size={20} />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 leading-snug">
                    {notification.message}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-zinc-500 font-medium">{timeAgo}</span>
                    {notification.product_id && (
                        <Link
                            href={`/billing?pid=${notification.product_id}`}
                            className="text-[10px] font-bold uppercase tracking-wide text-sky-600 hover:text-sky-700 hover:underline"
                        >
                            View Product
                        </Link>
                    )}
                </div>
            </div>

            {/* Status tag */}
            <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400">
                {notification.kind}
            </div>
        </div>
    );
}
