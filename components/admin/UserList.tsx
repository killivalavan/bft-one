import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UserPlus, UserX, Shield, Briefcase, Key, Clock, CreditCard, Phone, Heart, Save, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import SalaryManager from "@/app/(protected)/admin/SalaryManager";
import { cn } from "@/lib/utils/cn";

type Profile = {
    id: string;
    email: string;
    is_admin: boolean;
    is_stock_manager?: boolean | null;
    in_time?: string | null;
    base_salary_cents?: number | null;
    fixed_allowance_cents?: number | null;
    per_day_salary_cents?: number | null;
    age?: number | null;
    dob?: string | null;
    contact_number?: string | null;
    emergency_contact_number?: string | null;
};

interface UserListProps {
    users: Profile[];
    onAddUser: (e: string, p: string) => Promise<void>;
    onRemoveUser: (id: string) => Promise<void>;
    onUpdatePass: (email: string, pass: string) => Promise<void>;
    onToggleStockManager: (id: string, current: boolean) => Promise<void>;
    onUpdateMeta?: (id: string, field: string, val: any) => Promise<void>; // Deprecated but kept for compatibility if needed
    onUpdateFullProfile: (id: string, updates: any) => Promise<void>;
    onDownloadPayslip: (userId: string, date: Date) => Promise<void>;
}

function calculateAge(dob: string) {
    if (!dob) return 0;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function convertTime12to24(time12h: string | null | undefined): string {
    if (!time12h) return "";
    const match = time12h.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
    if (!match) return time12h; // Assume already 24h or invalid

    let [_, h, m, ap] = match;
    let hh = parseInt(h, 10);
    if (ap.toUpperCase() === 'PM' && hh < 12) hh += 12;
    if (ap.toUpperCase() === 'AM' && hh === 12) hh = 0;

    return `${hh.toString().padStart(2, '0')}:${m}`;
}

function convertTime24to12(time24h: string): string {
    if (!time24h) return "";
    const [h, m] = time24h.split(':');
    let hh = parseInt(h, 10);
    const ap = hh >= 12 ? 'PM' : 'AM';
    if (hh > 12) hh -= 12;
    if (hh === 0) hh = 12;
    return `${hh}:${m} ${ap}`;
}

function UserRow({ user, onRemoveUser, onUpdatePass, onToggleStockManager, onUpdateFullProfile, onDownloadPayslip }: {
    user: Profile;
    onRemoveUser: (id: string) => Promise<void>;
    onUpdatePass: (email: string, pass: string) => Promise<void>;
    onToggleStockManager: (id: string, current: boolean) => Promise<void>;
    onUpdateFullProfile: (id: string, updates: any) => Promise<void>;
    onDownloadPayslip: (userId: string, date: Date) => Promise<void>;
}) {
    const [password, setPassword] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);

    // Editable State
    const [formData, setFormData] = useState({
        in_time: user.in_time || "",
        base_salary_cents: user.base_salary_cents ? (user.base_salary_cents / 100).toString() : "",
        fixed_allowance_cents: user.fixed_allowance_cents ? (user.fixed_allowance_cents / 100).toString() : "",
        per_day_salary_cents: user.per_day_salary_cents ? (user.per_day_salary_cents / 100).toString() : "",
        dob: user.dob || "",
        contact_number: user.contact_number || "",
        emergency_contact_number: user.emergency_contact_number || ""
    });

    const age = formData.dob ? calculateAge(formData.dob) : (user.age || "N/A");
    const [isSaving, setIsSaving] = useState(false);

    async function handleSave() {
        setIsSaving(true);
        const updates = {
            in_time: formData.in_time || null,
            base_salary_cents: formData.base_salary_cents ? Math.round(parseFloat(formData.base_salary_cents) * 100) : null,
            fixed_allowance_cents: formData.fixed_allowance_cents ? Math.round(parseFloat(formData.fixed_allowance_cents) * 100) : null,
            per_day_salary_cents: formData.per_day_salary_cents ? Math.round(parseFloat(formData.per_day_salary_cents) * 100) : null,
            dob: formData.dob || null,
            age: typeof age === 'number' ? age : null,
            contact_number: formData.contact_number || null,
            emergency_contact_number: formData.emergency_contact_number || null,
        };
        await onUpdateFullProfile(user.id, updates);
        setIsSaving(false);
    }

    return (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden mb-4">
            {/* Header */}
            <div
                className="px-4 py-3 bg-zinc-50/50 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50 transition-colors"
                onClick={() => !user.is_admin && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold text-lg">
                        {user.email[0].toUpperCase()}
                    </div>
                    <div>
                        <div className="font-semibold text-zinc-900">{user.email}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                            {user.is_admin && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                    <Shield size={10} fill="currentColor" /> Admin
                                </span>
                            )}
                            {user.is_stock_manager && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">
                                    <Briefcase size={10} /> Stock Mgr
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>


                    {!user.is_admin && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-600 mr-2"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <ChevronDown size={16} className={cn("transition-transform", isExpanded && "rotate-180")} />
                        </Button>
                    )}

                    {!user.is_admin && (
                        <Button
                            size="sm"
                            variant="outline"
                            className={cn("text-xs h-8 whitespace-nowrap", user.is_stock_manager ? "border-amber-200 text-amber-700 bg-amber-50" : "bg-white text-zinc-600")}
                            onClick={() => onToggleStockManager(user.id, !!user.is_stock_manager)}
                        >
                            {user.is_stock_manager ? "Revoke Stock Mgr" : "Grant Stock Mgr"}
                        </Button>
                    )}
                    <div className="flex items-center bg-zinc-100 rounded-lg p-1">
                        <Input
                            type="text"
                            placeholder="New pass"
                            className="h-7 text-xs w-24 border-0 bg-transparent focus:ring-0 px-2"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onUpdatePass(user.email, password)}>
                            <Key size={12} />
                        </Button>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600 hover:bg-red-50" onClick={() => onRemoveUser(user.id)}>
                        <UserX size={16} />
                    </Button>
                </div>
            </div>

            {/* Editable Fields */}
            {!user.is_admin && isExpanded && (
                <div className="p-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Clock size={10} /> In Time</label>
                            <Input
                                type="time"
                                value={convertTime12to24(formData.in_time)}
                                onChange={e => setFormData({ ...formData, in_time: convertTime24to12(e.target.value) })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><CreditCard size={10} /> Base Salary (₹)</label>
                            <Input
                                type="number"
                                value={formData.base_salary_cents}
                                onChange={e => {
                                    const val = e.target.value;
                                    const num = parseFloat(val);
                                    const perDay = !isNaN(num) ? (num / 30).toFixed(2) : "";
                                    setFormData({ ...formData, base_salary_cents: val, per_day_salary_cents: perDay });
                                }}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><CreditCard size={10} /> Extra Allowance (₹)</label>
                            <Input
                                type="number"
                                value={formData.fixed_allowance_cents}
                                onChange={e => setFormData({ ...formData, fixed_allowance_cents: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><CreditCard size={10} /> Per-Day (₹)</label>
                            <Input
                                type="number"
                                value={formData.per_day_salary_cents}
                                onChange={e => setFormData({ ...formData, per_day_salary_cents: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Calendar size={10} /> Date of Birth</label>
                            <Input
                                type="date"
                                value={formData.dob}
                                onChange={e => setFormData({ ...formData, dob: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1">Age</label>
                            <Input
                                disabled
                                value={age}
                                className="h-9 text-sm bg-zinc-50 text-zinc-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Phone size={10} /> Contact</label>
                            <Input
                                value={formData.contact_number}
                                onChange={e => setFormData({ ...formData, contact_number: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Heart size={10} /> Emergency</label>
                            <Input
                                value={formData.emergency_contact_number}
                                onChange={e => setFormData({ ...formData, emergency_contact_number: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>

                        <div className="col-span-1 lg:col-span-2 flex items-end justify-end">
                            <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto bg-zinc-900 text-white hover:bg-zinc-800">
                                <Save size={16} className="mr-2" /> {isSaving ? "Saving..." : "Save Details"}
                            </Button>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-100">
                        <SalaryManager userId={user.id} onDownloadPayslip={onDownloadPayslip} />
                    </div>
                </div>
            )}
        </div>
    );
}

export function UserList({ users, onAddUser, onRemoveUser, onUpdatePass, onToggleStockManager, onUpdateFullProfile, onDownloadPayslip }: UserListProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("123456");

    async function handleAddUser() {
        await onAddUser(email, password);
        setEmail("");
        setPassword("");
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-500">
            {/* Create User Block */}
            <Card className="border-indigo-100 bg-indigo-50/30">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                    <div className="flex-1 w-full space-y-1">
                        <label className="text-xs font-semibold text-indigo-900 uppercase">Create New User</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Email address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="bg-white h-9"
                            />
                            <Input
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="bg-white w-32 shrink-0 h-9"
                            />
                        </div>
                    </div>
                    <Button onClick={handleAddUser} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto h-9">
                        <UserPlus size={16} className="mr-2" /> Add User
                    </Button>
                </CardContent>
            </Card>

            <div className="">
                {users.map(u => (
                    <UserRow
                        key={u.id}
                        user={u}
                        onRemoveUser={onRemoveUser}
                        onUpdatePass={onUpdatePass}
                        onToggleStockManager={onToggleStockManager}
                        onUpdateFullProfile={onUpdateFullProfile}
                        onDownloadPayslip={onDownloadPayslip}
                    />
                ))}
            </div>
        </div>
    );
}
