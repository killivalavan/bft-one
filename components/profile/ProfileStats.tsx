import { Clock, Phone, Heart, Hash } from "lucide-react";

interface ProfileStatsProps {
    inTime: string;
    phone: string;
    emergency: string;
}

export function ProfileStats({ inTime, phone, emergency }: ProfileStatsProps) {
    const items = [
        { label: "Check-in Time", value: inTime || "Not set", icon: Clock, color: "text-indigo-600", bg: "bg-indigo-50" },
        { label: "Phone Number", value: phone || "Not set", icon: Phone, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Emergency Contact", value: emergency || "Not set", icon: Heart, color: "text-rose-600", bg: "bg-rose-50" },
    ];

    return (
        <div className="p-4 md:p-6 grid gap-4 animate-in fade-in slide-in-from-bottom-4 delay-100 duration-500">
            <div className="grid sm:grid-cols-3 gap-4">
                {items.map((item, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-zinc-100 shadow-sm flex items-start gap-3 hover:border-zinc-200 hover:shadow-md transition-all">
                        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}>
                            <item.icon size={20} />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{item.label}</div>
                            <div className="font-medium text-zinc-900 mt-0.5">{item.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-center mt-8">
                <p className="text-xs text-zinc-400">
                    To update these details, please contact your administrator.
                </p>
            </div>
        </div>
    );
}
