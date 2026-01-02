"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { ChevronLeft, Phone, ShieldAlert, User, Store, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Employee = {
    id: string;
    email: string;
    full_name?: string | null;
    contact_number?: string | null;
    is_admin?: boolean;
    is_manual?: boolean;
};

type ExternalContact = {
    id: string;
    name: string;
    role: string;
    phone: string;
};

export default function ContactsPage() {
    const { user } = useUser();
    const { toast } = useToast();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [others, setOthers] = useState<ExternalContact[]>([]);
    const [emergencyContacts, setEmergencyContacts] = useState<ExternalContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"employees" | "emergency" | "vendors">("employees");

    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (user) loadData();
    }, [user]);

    async function loadData() {
        setLoading(true);
        try {
            // 1. Fetch System Employees (Profiles)
            const { data: empData, error: empError } = await supabaseClient
                .from("profiles")
                .select("id, email, full_name, contact_number, is_admin")
                .order("email");

            if (empError) throw empError;

            // Filter out admins from the system employee list
            const systemEmps = ((empData || []) as Employee[]).filter(e => !e.is_admin);

            // 2. Fetch External Contacts
            const { data: extData, error: extError } = await supabaseClient
                .from("external_contacts")
                .select("*")
                .order("role", { ascending: true });

            if (extError) {
                console.warn("Could not fetch external contacts", extError);
            }

            const allExt = extData || [];

            // Separate External Contacts
            const manualEmps = allExt.filter(c => c.role.trim().toLowerCase() === 'employee');
            const emergency = allExt.filter(c => c.role.trim().toLowerCase() === 'emergency');
            const otherContacts = allExt.filter(c =>
                c.role.trim().toLowerCase() !== 'employee' &&
                c.role.trim().toLowerCase() !== 'owner' &&
                c.role.trim().toLowerCase() !== 'emergency'
            );

            // Merge System + Manual Employees
            const mergedEmps: Employee[] = [
                ...systemEmps,
                ...manualEmps.map(me => ({
                    id: me.id,
                    email: "Manual Entry", // Placeholder or hidden
                    full_name: me.name,
                    contact_number: me.phone,
                    is_admin: false,
                    is_manual: true // Flag to distinguish if needed
                }))
            ];

            setEmployees(mergedEmps);
            setOthers(otherContacts);
            setEmergencyContacts(emergency);

        } catch (e: any) {
            toast({ title: "Error loading contacts", description: e.message, variant: "error" });
        } finally {
            setLoading(false);
        }
    }

    // --- Search Logic ---
    const allSearchable = [
        ...employees.map(e => ({
            id: e.id,
            name: e.full_name || e.email.split('@')[0],
            role: 'Employee' as const,
            phone: e.contact_number || "",
            type: 'employee' as const
        })),
        ...emergencyContacts.map(c => ({
            id: c.id,
            name: c.name,
            role: 'Emergency' as const,
            phone: c.phone,
            type: 'emergency' as const
        })),
        ...others.map(c => ({
            id: c.id,
            name: c.name,
            role: c.role,
            phone: c.phone,
            type: 'vendor' as const
        }))
    ];

    const searchResults = searchQuery.trim() === "" ? [] : allSearchable.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.phone.includes(searchQuery)
    );

    function getCardStyle(type: 'employee' | 'emergency' | 'vendor', role: string) {
        if (type === 'employee') return { border: 'border-sky-100', hover: 'hover:border-sky-300', bg: 'bg-sky-50', text: 'text-sky-700', grad: 'from-sky-50' };
        if (type === 'emergency') return { border: 'border-red-100', hover: 'hover:border-red-300', bg: 'bg-red-50', text: 'text-red-700', grad: 'from-red-50' };
        return { border: 'border-yellow-100', hover: 'hover:border-yellow-300', bg: 'bg-yellow-50', text: 'text-yellow-700', grad: 'from-yellow-50' };
    }

    return (
        <div className="min-h-screen bg-neutral-50/50 pb-20">
            <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-sky-700 transition-colors text-sm font-medium">
                        <ChevronLeft size={16} />
                        Back to Dashboard
                    </Link>
                </div>

                <div className="space-y-4">
                    <h1 className="text-2xl font-bold text-zinc-900">Contacts Directory</h1>

                    {/* --- Owner Contacts (Static Section) --- */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex items-center justify-between gap-3 group relative">
                                <div className="font-semibold text-zinc-900 text-lg">Owner</div>
                                <div className="flex items-center gap-2">
                                    <a href="tel:8148321017" className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition shadow-sm">
                                        <Phone size={16} />
                                        <span>Call</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative max-w-lg mt-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                        <Input
                            placeholder="Search contacts by name, role (e.g. Gas), or phone..."
                            className="pl-10 bg-white h-11 shadow-sm border-zinc-200 focus:border-sky-500 transition-all font-medium"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Tabs (Hidden if searching) */}
                    {!searchQuery && (
                        <div className="flex bg-zinc-100 p-1 rounded-xl w-full max-w-lg border border-zinc-200 mt-6">
                            <button
                                onClick={() => setTab("employees")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    tab === "employees" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                <User size={16} />
                                Employees
                            </button>
                            <button
                                onClick={() => setTab("emergency")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    tab === "emergency" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                <ShieldAlert size={16} />
                                Emergency
                            </button>
                            <button
                                onClick={() => setTab("vendors")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    tab === "vendors" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                <Store size={16} />
                                <span>Vendors</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* --- Content --- */}
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 min-h-[400px]">

                    {/* Search Results Grid */}
                    {searchQuery ? (
                        <div className="space-y-4">
                            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                                Found {searchResults.length} results for "{searchQuery}"
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {searchResults.map(item => {
                                    const style = getCardStyle(item.type, item.role);
                                    return (
                                        <div key={item.id + item.role} className={cn("bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3 relative overflow-hidden group transition-colors", style.border, style.hover)}>
                                            <div className={cn("absolute top-0 right-0 w-20 h-20 bg-gradient-to-br to-transparent rounded-bl-full -mr-6 -mt-6 z-0", style.grad)}></div>
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className={cn("inline-block px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide mb-1 border", style.bg, style.text, style.border)}>
                                                        {item.role}
                                                    </span>
                                                    <div className={cn("font-semibold text-zinc-900 truncate text-lg transition-colors capitalize group-hover:text-zinc-700")}>{item.name}</div>
                                                </div>
                                            </div>
                                            <div className="mt-auto relative z-10">
                                                {item.phone ? (
                                                    <a href={`tel:${item.phone}`} className={cn("flex items-center justify-center gap-2 w-full py-2 rounded-lg font-medium transition-all border relative z-10", style.bg, style.text, style.border)}>
                                                        <Phone size={16} />
                                                        {item.phone}
                                                    </a>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-zinc-50 text-zinc-400 border border-zinc-100 italic text-sm">
                                                        <span>No Number</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {searchResults.length === 0 && (
                                    <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                                        <Search size={32} className="mb-2 opacity-50" />
                                        <p>No contacts found.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {tab === "employees" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {employees.map(emp => (
                                        <div key={emp.id} className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm flex flex-col gap-3 relative overflow-hidden group hover:border-sky-300 transition-colors">
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-sky-50 to-transparent rounded-bl-full -mr-6 -mt-6 z-0"></div>
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className="inline-block px-2 py-1 rounded-md bg-sky-50 text-sky-700 text-xs font-bold uppercase tracking-wide mb-1 border border-sky-100">
                                                        Employee
                                                    </span>
                                                    <div className="font-semibold text-zinc-900 truncate text-lg group-hover:text-sky-700 transition-colors capitalize">{emp.full_name || emp.email.split('@')[0]}</div>
                                                </div>
                                            </div>
                                            <div className="mt-auto relative z-10">
                                                {emp.contact_number ? (
                                                    <a href={`tel:${emp.contact_number}`} className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white font-medium transition-all border border-sky-100 hover:border-sky-600">
                                                        <Phone size={16} />
                                                        {emp.contact_number}
                                                    </a>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-zinc-50 text-zinc-400 border border-zinc-100 italic text-sm">
                                                        <span>No Number</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {tab === "emergency" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {emergencyContacts.map(contact => (
                                        <div key={contact.id} className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex flex-col gap-3 relative group hover:border-red-300 transition-colors overflow-hidden">
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-red-50 to-transparent rounded-bl-full -mr-6 -mt-6 z-0"></div>
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className="inline-block px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wide mb-1 border border-red-100">
                                                        Emergency
                                                    </span>
                                                    <div className="font-semibold text-zinc-900 text-lg group-hover:text-red-700 transition-colors capitalize">{contact.name}</div>
                                                </div>
                                            </div>
                                            <a href={`tel:${contact.phone}`} className="mt-auto flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-600 hover:text-white font-medium transition-all border border-red-100 hover:border-red-600 relative z-10">
                                                <Phone size={16} />
                                                {contact.phone}
                                            </a>
                                        </div>
                                    ))}
                                    {emergencyContacts.length === 0 && !loading && (
                                        <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                                            <ShieldAlert size={32} className="mb-2 opacity-50" />
                                            <p>No emergency contacts listed.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {tab === "vendors" && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {others.map(contact => (
                                            <div key={contact.id} className="bg-white p-4 rounded-xl border border-yellow-100 shadow-sm flex flex-col gap-3 relative group hover:border-yellow-300 transition-colors overflow-hidden">
                                                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-yellow-50 to-transparent rounded-bl-full -mr-6 -mt-6 z-0"></div>
                                                <div className="flex justify-between items-start relative z-10">
                                                    <div>
                                                        <span className="inline-block px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 text-xs font-bold uppercase tracking-wide mb-1 border border-yellow-100">
                                                            {contact.role}
                                                        </span>
                                                        <div className="font-semibold text-zinc-900 text-lg group-hover:text-yellow-700 transition-colors capitalize">{contact.name}</div>
                                                    </div>
                                                </div>
                                                <a href={`tel:${contact.phone}`} className="mt-auto flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-zinc-50 text-zinc-600 hover:bg-yellow-600 hover:text-white font-medium transition-all border border-zinc-100 hover:border-yellow-600 relative z-10">
                                                    <Phone size={16} />
                                                    {contact.phone}
                                                </a>
                                            </div>
                                        ))}
                                        {others.length === 0 && !loading && (
                                            <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                                                <ShieldAlert size={32} className="mb-2 opacity-50" />
                                                <p>No vendors listed.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

            </div>
        </div>
    );
}
