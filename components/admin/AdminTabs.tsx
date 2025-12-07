import { cn } from "@/lib/utils/cn";
import { Users, Package, FileText } from "lucide-react";

interface AdminTabsProps {
    activeTab: "users" | "products" | "reports";
    onChange: (tab: "users" | "products" | "reports") => void;
}

export function AdminTabs({ activeTab, onChange }: AdminTabsProps) {
    const tabs = [
        { id: "users", label: "Users & Roles", icon: Users },
        { id: "products", label: "Product Catalog", icon: Package },
        { id: "reports", label: "Sales Reports", icon: FileText },
    ] as const;

    return (
        <div className="flex p-1 bg-zinc-100 rounded-xl mb-6">
            {tabs.map(t => {
                const active = activeTab === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => onChange(t.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all",
                            active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        <t.icon size={16} className={cn(active ? "text-indigo-600" : "text-zinc-400")} />
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
