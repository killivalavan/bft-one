import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { useTenant } from "@/lib/context/TenantContext";
import { Users, Package, FileText, Contact, Banknote, BarChart3, Store } from "lucide-react";

interface AdminTabsProps {
    activeTab: "users" | "products" | "reports" | "contacts" | "sales" | "store";
    onChange: (tab: "users" | "products" | "reports" | "contacts" | "sales" | "store") => void;
}

export function AdminTabs({ activeTab, onChange }: AdminTabsProps) {
    const { isModuleEnabled } = useTenant();

    const tabs = [
        ...(isModuleEnabled("sales") ? [{ id: "sales", label: "Daily Sales", icon: Banknote }] : []),
        // External entry points
        ...(isModuleEnabled("expenses") ? [{ id: "spending", label: "Spending Overview", icon: BarChart3, href: "/expenses?tab=overview" }] : []),
        ...(isModuleEnabled("invoices") ? [{ id: "invoices", label: "Invoice Generator", icon: FileText, href: "/invoices" }] : []),
        { id: "users", label: "Users & Roles", icon: Users },
        { id: "products", label: "Product Catalog", icon: Package },
        { id: "reports", label: "Order Reports", icon: FileText },
        ...(isModuleEnabled("contacts") ? [{ id: "contacts", label: "Contacts", icon: Contact }] : []),
        { id: "store", label: "Store & Logo", icon: Store },
    ];

    return (
        <div className="flex p-1 bg-slate-100 rounded-xl mb-6 border border-slate-200/60">
            {tabs.map(t => {
                const active = activeTab === t.id;
                const className = cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all",
                    active ? "bg-white text-slate-900 shadow-xs border border-slate-200/80" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                );

                if ("href" in t && t.href) {
                    return (
                        <Link key={t.id} href={t.href} className={className}>
                            <t.icon size={16} className="text-slate-400" />
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
                        <t.icon size={16} className={cn(active ? "text-[#2563EB]" : "text-[#64748B]")} />
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
