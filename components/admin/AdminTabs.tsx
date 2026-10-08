import { cn } from "@/lib/utils/cn";
import { Users, Package, FileText, Store } from "lucide-react";

export type AdminTab = "users" | "products" | "reports" | "store";

interface AdminTabsProps {
    activeTab: AdminTab;
    onChange: (tab: AdminTab) => void;
}

export function AdminTabs({ activeTab, onChange }: AdminTabsProps) {
    const tabs: { id: AdminTab; label: string; icon: any }[] = [
        { id: "users", label: "Users & Roles", icon: Users },
        { id: "products", label: "Product Catalog", icon: Package },
        { id: "reports", label: "Order Reports", icon: FileText },
        { id: "store", label: "Business Profile", icon: Store },
    ];

    return (
        <div className="flex p-1 bg-slate-100 rounded-xl mb-6 border border-slate-200/60">
            {tabs.map(t => {
                const active = activeTab === t.id;
                const className = cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all",
                    active ? "bg-white text-slate-900 shadow-xs border border-slate-200/80" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                );

                return (
                    <button
                        key={t.id}
                        onClick={() => onChange(t.id)}
                        className={className}
                    >
                        <t.icon size={16} className={cn(active ? "text-[#2563EB]" : "text-[#64748B]")} />
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

