"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Phone, ShieldAlert, User, Store, Search, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTenant } from "@/lib/context/TenantContext";
import { SyncStatusBadge } from "@/components/offline/SyncStatusBadge";
import { ContactManager } from "@/components/admin/ContactManager";
import {
    STORES,
    getItemsByTenant,
    bulkPutItems,
    LocalCustomer,
} from "@/lib/offline/db";

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
    const { flags } = useProfile();
    const { business } = useTenant();
    const { toast } = useToast();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [others, setOthers] = useState<ExternalContact[]>([]);
    const [emergencyContacts, setEmergencyContacts] = useState<ExternalContact[]>([]);
    const [rawSystemUsers, setRawSystemUsers] = useState<any[]>([]);
    const [rawExternalContacts, setRawExternalContacts] = useState<ExternalContact[]>([]);
    const [isManageMode, setIsManageMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"employees" | "emergency" | "vendors">("employees");

    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (user) loadData();
    }, [user, business?.id]);

    async function loadData() {
        setLoading(true);
        const bizId = business?.id || "default";

        // 1. Instant Warm Start from IndexedDB
        try {
            const localContacts = await getItemsByTenant<LocalCustomer>(STORES.customers, bizId);
            if (localContacts.length > 0) {
                const manualEmps = localContacts.filter(c => (c.role || "").trim().toLowerCase() === 'employee');
                const emergency = localContacts.filter(c => (c.role || "").trim().toLowerCase() === 'emergency');
                const otherContacts = localContacts.filter(c =>
                    (c.role || "").trim().toLowerCase() !== 'employee' &&
                    (c.role || "").trim().toLowerCase() !== 'owner' &&
                    (c.role || "").trim().toLowerCase() !== 'emergency'
                );

                setOthers(otherContacts.map(c => ({ id: c.id, name: c.name, role: c.role || "Vendor", phone: c.phone || "" })));
                setEmergencyContacts(emergency.map(c => ({ id: c.id, name: c.name, role: c.role || "Emergency", phone: c.phone || "" })));
            }
        } catch {}

        try {
            // 1. Fetch System Employees (Profiles)
            let empQuery = supabaseClient
                .from("profiles")
                .select("id, email, full_name, contact_number, is_admin")
                .order("email");
            if (business?.id) empQuery = empQuery.eq("business_id", business.id);

            const { data: empData, error: empError } = await empQuery;
            if (empError) throw empError;

            // Filter out admins from the system employee list
            const systemEmps = ((empData || []) as Employee[]).filter(e => !e.is_admin && !e.email?.toLowerCase().includes('admin'));

            // 2. Fetch External Contacts
            let extQuery = supabaseClient
                .from("external_contacts")
                .select("*")
                .order("role", { ascending: true });
            if (business?.id) extQuery = extQuery.eq("business_id", business.id);

            const { data: extData, error: extError } = await extQuery;
            if (extError) {
                console.warn("Could not fetch external contacts", extError);
            }

            const allExt = extData || [];

            // Separate External Contacts
            const manualEmps = allExt.filter(c => c.role?.trim().toLowerCase() === 'employee');
            const emergency = allExt.filter(c => c.role?.trim().toLowerCase() === 'emergency');
            const otherContacts = allExt.filter(c =>
                c.role?.trim().toLowerCase() !== 'employee' &&
                c.role?.trim().toLowerCase() !== 'owner' &&
                c.role?.trim().toLowerCase() !== 'emergency'
            );

            // Merge System + Manual Employees
            const mergedEmps: Employee[] = [
                ...systemEmps,
                ...manualEmps.map(me => ({
                    id: me.id,
                    email: "Manual Entry",
                    full_name: me.name,
                    contact_number: me.phone,
                    is_admin: false,
                    is_manual: true
                }))
            ];

            setEmployees(mergedEmps);
            setOthers(otherContacts);
            setEmergencyContacts(emergency);
            setRawSystemUsers(empData || []);
            setRawExternalContacts(allExt);

            // Save to IndexedDB
            const localCusts: LocalCustomer[] = allExt.map(c => ({
                id: c.id,
                business_id: bizId,
                name: c.name,
                phone: c.phone,
                role: c.role,
                updated_at: c.updated_at,
            }));
            bulkPutItems(STORES.customers, localCusts).catch(() => {});

        } catch (e: any) {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                // Keep local cached contacts when offline
            } else {
                toast({ title: "Error loading contacts", description: e.message, variant: "error" });
            }
        } finally {
            setLoading(false);
        }
    }

    // Contact CRUD Actions for Admins
    async function addContact(contact: Omit<ExternalContact, "id">) {
        const { error } = await supabaseClient.from("external_contacts").insert([{ ...contact, business_id: business?.id }]);
        if (error) { toast({ title: "Failed to add contact", description: error.message, variant: "error" }); return; }
        await loadData();
        toast({ title: "Contact added", variant: "success" });
    }

    async function updateContact(contact: ExternalContact) {
        const { error } = await supabaseClient.from("external_contacts").update(contact).eq('id', contact.id);
        if (error) { toast({ title: "Failed to update contact", description: error.message, variant: "error" }); return; }
        await loadData();
        toast({ title: "Contact updated", variant: "success" });
    }

    async function deleteContact(id: string) {
        const { error } = await supabaseClient.from("external_contacts").delete().eq('id', id);
        if (error) { toast({ title: "Failed to delete contact", description: error.message, variant: "error" }); return; }
        await loadData();
        toast({ title: "Contact deleted", variant: "success" });
    }

    async function updateSystemUser(id: string, updates: any) {
        const { error } = await supabaseClient.from('profiles').update(updates).eq('id', id);
        if (error) { toast({ title: "Update failed", description: error.message, variant: "error" }); return; }
        await loadData();
        toast({ title: "Profile updated", variant: "success" });
    }

    async function deleteSystemUser(userId: string) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const token = session?.access_token;
            const res = await fetch("/api/admin-users", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ userId })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast({ title: "Failed to remove user", description: data?.error || "Unknown error", variant: "error" });
                return;
            }
            await loadData();
            toast({ title: "User removed", variant: "success" });
        } catch (e: any) {
            toast({ title: "Failed to remove user", description: e?.message || "Unknown error", variant: "error" });
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
        if (type === 'employee') return { border: 'border-[#E2E8F0]', hover: 'hover:border-blue-300', bg: 'bg-[#EFF6FF]', text: 'text-[#1E40AF]', bdr: 'border-[#BFDBFE]' };
        if (type === 'emergency') return { border: 'border-[#E2E8F0]', hover: 'hover:border-red-300', bg: 'bg-[#FEF2F2]', text: 'text-[#B91C1C]', bdr: 'border-[#FECACA]' };
        return { border: 'border-[#E2E8F0]', hover: 'hover:border-amber-300', bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', bdr: 'border-[#FDE68A]' };
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20">
            <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Contacts Directory</h1>
                        <SyncStatusBadge />
                    </div>

                    {flags?.isAdmin && (
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                            <button
                                onClick={() => setIsManageMode(false)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                                    !isManageMode ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                                )}
                            >
                                Directory Cards
                            </button>
                            <button
                                onClick={() => setIsManageMode(true)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                                    isManageMode ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                                )}
                            >
                                <Shield size={13} className="text-blue-500" />
                                <span>Manage Directory</span>
                                <span className="text-[9px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200">
                                    Admin Only
                                </span>
                            </button>
                        </div>
                    )}
                </div>

                {isManageMode ? (
                    <div className="pt-2">
                        <ContactManager
                            contacts={rawExternalContacts}
                            systemUsers={rawSystemUsers}
                            onAddContact={addContact}
                            onUpdateContact={updateContact}
                            onDeleteContact={deleteContact}
                            onUpdateSystemUser={updateSystemUser}
                            onDeleteSystemUser={deleteSystemUser}
                        />
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            {/* --- Owner Contacts (Static Section) --- */}
                            <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-center justify-between gap-3 group relative">
                                <div className="font-semibold text-[#0F172A] text-lg">Owner</div>
                                <div className="flex items-center gap-2">
                                    <a href="tel:8148321017" className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] transition shadow-xs">
                                        <Phone size={16} />
                                        <span>Call</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative max-w-lg mt-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <Input
                            placeholder="Search contacts by name, role, or phone..."
                            className="pl-10 bg-white h-11 shadow-xs border-[#E2E8F0] focus:border-[#2563EB] focus:ring-[#2563EB]/20 transition-all font-medium text-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Tabs (Hidden if searching) */}
                    {!searchQuery && (
                        <div className="flex bg-slate-100 p-1 rounded-xl w-full max-w-lg border border-[#E2E8F0] mt-6">
                            <button
                                onClick={() => setTab("employees")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all",
                                    tab === "employees" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B] hover:text-[#0F172A]"
                                )}
                            >
                                <User size={16} />
                                Employees
                            </button>
                            <button
                                onClick={() => setTab("emergency")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all",
                                    tab === "emergency" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B] hover:text-[#0F172A]"
                                )}
                            >
                                <ShieldAlert size={16} />
                                Emergency
                            </button>
                            <button
                                onClick={() => setTab("vendors")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all",
                                    tab === "vendors" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B] hover:text-[#0F172A]"
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
                            <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                                Found {searchResults.length} results for "{searchQuery}"
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {searchResults.map(item => {
                                    const style = getCardStyle(item.type, item.role);
                                    return (
                                        <div key={item.id + item.role} className={cn("bg-white p-4 rounded-xl border shadow-xs flex flex-col gap-3 relative overflow-hidden group transition-all", style.border, style.hover)}>
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className={cn("inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider mb-1.5 border", style.bg, style.text, style.bdr)}>
                                                        {item.role}
                                                    </span>
                                                    <div className="font-semibold text-[#0F172A] truncate text-lg transition-colors capitalize group-hover:text-[#2563EB]">{item.name}</div>
                                                </div>
                                            </div>
                                            <div className="mt-auto relative z-10">
                                                {item.phone ? (
                                                    <a href={`tel:${item.phone}`} className="flex items-center justify-center gap-2 w-full py-2 rounded-lg font-medium transition-all bg-slate-50 text-slate-700 hover:bg-[#2563EB] hover:text-white border border-[#E2E8F0] hover:border-[#2563EB] text-sm">
                                                        <Phone size={16} />
                                                        {item.phone}
                                                    </a>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-400 border border-[#E2E8F0] italic text-sm">
                                                        <span>No Number</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {searchResults.length === 0 && (
                                    <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed border-[#E2E8F0]">
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
                                        <div key={emp.id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col gap-3 relative overflow-hidden group hover:border-blue-300 transition-all">
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] text-xs font-semibold uppercase tracking-wider mb-1.5 border border-[#BFDBFE]">
                                                        Employee
                                                    </span>
                                                    <div className="font-semibold text-[#0F172A] truncate text-lg group-hover:text-[#2563EB] transition-colors capitalize">{emp.full_name || emp.email.split('@')[0]}</div>
                                                </div>
                                            </div>
                                            <div className="mt-auto relative z-10">
                                                {emp.contact_number ? (
                                                    <a href={`tel:${emp.contact_number}`} className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-700 hover:bg-[#2563EB] hover:text-white font-medium transition-all border border-[#E2E8F0] hover:border-[#2563EB] text-sm">
                                                        <Phone size={16} />
                                                        {emp.contact_number}
                                                    </a>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-400 border border-[#E2E8F0] italic text-sm">
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
                                        <div key={contact.id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col gap-3 relative group hover:border-red-300 transition-all overflow-hidden">
                                            <div className="flex justify-between items-start relative z-10">
                                                <div>
                                                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#FEF2F2] text-[#B91C1C] text-xs font-semibold uppercase tracking-wider mb-1.5 border border-[#FECACA]">
                                                        Emergency
                                                    </span>
                                                    <div className="font-semibold text-[#0F172A] text-lg group-hover:text-[#DC2626] transition-colors capitalize">{contact.name}</div>
                                                </div>
                                            </div>
                                            <a href={`tel:${contact.phone}`} className="mt-auto flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-700 hover:bg-[#DC2626] hover:text-white font-medium transition-all border border-[#E2E8F0] hover:border-[#DC2626] text-sm relative z-10">
                                                <Phone size={16} />
                                                {contact.phone}
                                            </a>
                                        </div>
                                    ))}
                                    {emergencyContacts.length === 0 && !loading && (
                                        <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed border-[#E2E8F0]">
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
                                            <div key={contact.id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col gap-3 relative group hover:border-amber-300 transition-all overflow-hidden">
                                                <div className="flex justify-between items-start relative z-10">
                                                    <div>
                                                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#FFFBEB] text-[#B45309] text-xs font-semibold uppercase tracking-wider mb-1.5 border border-[#FDE68A]">
                                                            {contact.role}
                                                        </span>
                                                        <div className="font-semibold text-[#0F172A] text-lg group-hover:text-[#D97706] transition-colors capitalize">{contact.name}</div>
                                                    </div>
                                                </div>
                                                <a href={`tel:${contact.phone}`} className="mt-auto flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-700 hover:bg-[#D97706] hover:text-white font-medium transition-all border border-[#E2E8F0] hover:border-[#D97706] text-sm relative z-10">
                                                    <Phone size={16} />
                                                    {contact.phone}
                                                </a>
                                            </div>
                                        ))}
                                        {others.length === 0 && !loading && (
                                            <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed border-[#E2E8F0]">
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
                    </>
                )}

            </div>
        </div>
    );
}
