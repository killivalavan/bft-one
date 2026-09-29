import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Users, Package, FileText, Contact, Banknote, BarChart3, Store } from "lucide-react";

interface AdminTabsProps {
    activeTab: "users" | "products" | "reports" | "contacts" | "sales" | "store";
    onChange: (tab: "users" | "products" | "reports" | "contacts" | "sales" | "store") => void;
}

export function AdminTabs({ activeTab, onChange }: AdminTabsProps) {
    const tabs = [
        { id: "sales", label: "Daily Sales", icon: Banknote },
        // External entry points
        { id: "spending", label: "Spending Overview", icon: BarChart3, href: "/expenses?tab=overview" },
        { id: "invoices", label: "Invoice Generator", icon: FileText, href: "/invoices" },
        { id: "users", label: "Users & Roles", icon: Users },
        { id: "products", label: "Product Catalog", icon: Package },
        { id: "reports", label: "Order Reports", icon: FileText },
        { id: "contacts", label: "Contacts", icon: Contact },
        { id: "store", label: "Store & Logo", icon: Store },
    ] as const;

    return (
        <div className="flex p-1 bg-zinc-100 rounded-xl mb-6">
            {tabs.map(t => {
                const active = activeTab === t.id;
                const className = cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all",
                    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                );

                if ("href" in t && t.href) {
                    return (
                        <Link key={t.id} href={t.href} className={className}>
                            <t.icon size={16} className="text-zinc-400" />
                            <span className="hidden sm:inline">{t.label}</span>
                        </Link>
                    );
                }

                return (
                    <button
                        key={t.id}
                        onClick={() => onChange(t.id as AdminTabsProps["activeTab"])}
                        className={className}
                    >
                        <t.icon size={16} className={cn(active ? "text-indigo-600" : "text-zinc-400")} />
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
