import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Bell, Box, Info, Radio, Megaphone, Store, Trash2, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Notification {
    id: string;
    message: string;
    kind: string;
    created_at: string;
    product_id?: string | null;
    meta?: {
        sender_name?: string;
        category?: string;
        title?: string;
        read_by?: string[];
        [key: string]: any;
    } | null;
}

interface NotificationItemProps {
    notification: Notification;
    currentUserId?: string;
    onMarkAsRead?: (id: string) => void;
    onDelete?: (id: string) => void;
    canDelete?: boolean;
}

function getSenderName(notification: Notification): string {
    if (notification.meta?.sender_name) {
        return notification.meta.sender_name;
    }
    const match = notification.message.match(/\(From:\s*([^)]+)\)/i) || 
                  notification.message.match(/from\s+([A-Za-z0-9\s]+?)(?:,|$|:|\!|\.)/i);
    if (match && match[1]) {
        return match[1].trim().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    return "Kitchen Dispatch";
}

export function NotificationItem({ notification, currentUserId, onMarkAsRead, onDelete, canDelete = false }: NotificationItemProps) {
    const isStock = notification.kind === 'stock';
    const isBaker = notification.kind === 'baker_broadcast' || notification.kind?.includes('baker');
    const Icon = isStock ? Box : isBaker ? Radio : Info;
    const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });
    const senderName = getSenderName(notification);

    const readBy = Array.isArray(notification.meta?.read_by) ? notification.meta.read_by : [];
    const isRead = currentUserId ? readBy.includes(currentUserId) : false;

    return (
        <div className={cn(
            "group relative flex gap-3.5 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border transition-all duration-300",
            !isRead
                ? isBaker
                    ? "bg-blue-50/80 border-blue-300/90 shadow-2xs ring-1 ring-blue-500/10"
                    : "bg-amber-50/70 border-amber-300/90 shadow-2xs ring-1 ring-amber-500/10"
                : "bg-white/80 border-slate-200/90 hover:border-slate-300 opacity-80"
        )}>
            <div className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border",
                !isRead
                    ? isBaker
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-[#FFFBEB] text-[#D97706] border-[#FEF3C7]"
                    : "bg-slate-100 text-slate-500 border-slate-200"
            )}>
                <Icon size={20} className={!isRead && isBaker ? "animate-pulse" : ""} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {isBaker && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200/90 flex items-center gap-1 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 animate-pulse" />
                            From: {senderName}
                        </span>
                    )}

                    {!isRead ? (
                        <span className="text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-2xs animate-pulse">
                            Unread
                        </span>
                    ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                            Read
                        </span>
                    )}
                </div>

                <p className={cn(
                    "text-sm leading-snug",
                    !isRead ? "font-bold text-slate-900" : "font-medium text-slate-700"
                )}>
                    {notification.message}
                </p>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 font-medium">{timeAgo}</span>
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

            {/* Action buttons on card */}
            <div className="flex items-center gap-1.5 shrink-0 self-start">
                {!isRead && onMarkAsRead && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onMarkAsRead(notification.id);
                        }}
                        title="Mark as Read"
                        className="px-2.5 py-1 rounded-xl text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 shadow-2xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                    >
                        <Check size={13} className="text-blue-600" />
                        <span className="hidden xs:inline">Mark Read</span>
                    </button>
                )}

                {isRead && (
                    <span
                        className="text-[10px] font-bold text-slate-400 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 whitespace-nowrap"
                        title="Marked as read by you"
                    >
                        <CheckCheck size={13} className="text-emerald-500" />
                        <span className="hidden xs:inline">Read</span>
                    </span>
                )}

                {canDelete && onDelete && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(notification.id);
                        }}
                        title="Clear / Dismiss this notification"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
                    >
                        <Trash2 size={15} />
                    </button>
                )}
            </div>
        </div>
    );
}
