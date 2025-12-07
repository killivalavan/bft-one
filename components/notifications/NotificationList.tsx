import { NotificationItem, Notification } from "./NotificationItem";
import { BellOff } from "lucide-react";

interface NotificationListProps {
    notifications: Notification[];
    loading?: boolean;
}

export function NotificationList({ notifications, loading }: NotificationListProps) {
    if (loading) {
        return (
            <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-zinc-100 rounded-xl border border-zinc-200" />
                ))}
            </div>
        );
    }

    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300 mb-4">
                    <BellOff size={32} />
                </div>
                <h3 className="text-lg font-medium text-zinc-900">No new notifications</h3>
                <p className="text-sm text-zinc-500 max-w-xs mt-1">
                    You are all caught up! Check back later for updates.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} />
            ))}
        </div>
    );
}
