import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UserPlus, UserX, Shield, Briefcase, Key, Clock, CreditCard, Phone, Heart } from "lucide-react";
import SalaryManager from "@/app/(protected)/admin/SalaryManager"; // Import existing logic
import { cn } from "@/lib/utils/cn";

// We re-declare types or import if available. Assuming Profile type is standard.
type Profile = { id: string; email: string; is_admin: boolean; is_stock_manager?: boolean | null; in_time?: string | null; base_salary_cents?: number | null; per_day_salary_cents?: number | null; age?: number | null; contact_number?: string | null; emergency_contact_number?: string | null };

interface UserListProps {
    users: Profile[];
    onAddUser: (e: string, p: string) => Promise<void>;
    onRemoveUser: (id: string) => Promise<void>;
    onUpdatePass: (email: string, pass: string) => Promise<void>;
    onToggleStockManager: (id: string, current: boolean) => Promise<void>;
    onUpdateMeta: (id: string, field: string, val: any) => Promise<void>;
}

export function UserList({ users, onAddUser, onRemoveUser, onUpdatePass, onToggleStockManager, onUpdateMeta }: UserListProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("123456");
    const [pwByUser, setPwByUser] = useState<Record<string, string>>({});

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-500">
            {/* Create User Block */}
            <Card className="border-indigo-100 bg-indigo-50/30">
                <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                    <div className="flex-1 w-full space-y-1">
                        <label className="text-xs font-semibold text-indigo-900 uppercase">Create New User</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Email address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="bg-white"
                            />
                            <Input
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="bg-white w-32 shrink-0"
                            />
                        </div>
                    </div>
                    <Button onClick={() => onAddUser(email, password)} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto">
                        <UserPlus size={16} className="mr-2" /> Add User
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {users.map(u => (
                    <div key={u.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                        {/* User Header */}
                        <div className="px-4 py-3 bg-zinc-50/50 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold text-lg">
                                    {u.email[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-semibold text-zinc-900">{u.email}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {u.is_admin && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                                <Shield size={10} fill="currentColor" /> Admin
                                            </span>
                                        )}
                                        {u.is_stock_manager && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">
                                                <Briefcase size={10} /> Stock Mgr
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {!u.is_admin && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className={cn("text-xs h-8", u.is_stock_manager ? "border-amber-200 text-amber-700 bg-amber-50" : "bg-white text-zinc-600")}
                                        onClick={() => onToggleStockManager(u.id, !!u.is_stock_manager)}
                                    >
                                        {u.is_stock_manager ? "Revoke Stock Mgr" : "Grant Stock Mgr"}
                                    </Button>
                                )}
                                <div className="flex items-center bg-zinc-100 rounded-lg p-1">
                                    <Input
                                        type="text"
                                        placeholder="New pass"
                                        className="h-7 text-xs w-24 border-0 bg-transparent focus:ring-0 px-2"
                                        value={pwByUser[u.id] || ""}
                                        onChange={e => setPwByUser(prev => ({ ...prev, [u.id]: e.target.value }))}
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onUpdatePass(u.email, pwByUser[u.id] || "")}>
                                        <Key size={12} />
                                    </Button>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600 hover:bg-red-50" onClick={() => onRemoveUser(u.id)}>
                                    <UserX size={16} />
                                </Button>
                            </div>
                        </div>

                        {/* Metadata Fields */}
                        {!u.is_admin && (
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Clock size={10} /> In Time</label>
                                        <Input defaultValue={u.in_time ?? ''} onBlur={e => onUpdateMeta(u.id, 'in_time', e.target.value || null)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><CreditCard size={10} /> Base Salary (₹)</label>
                                        <Input type="number" defaultValue={u.base_salary_cents ? (u.base_salary_cents / 100).toString() : ''} onBlur={e => onUpdateMeta(u.id, 'base_salary_cents', e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><CreditCard size={10} /> Per-Day (₹)</label>
                                        <Input type="number" defaultValue={u.per_day_salary_cents ? (u.per_day_salary_cents / 100).toString() : ''} onBlur={e => onUpdateMeta(u.id, 'per_day_salary_cents', e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1">Age</label>
                                        <Input type="number" defaultValue={u.age ?? ''} onBlur={e => onUpdateMeta(u.id, 'age', e.target.value ? parseInt(e.target.value) : null)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Phone size={10} /> Contact</label>
                                        <Input defaultValue={u.contact_number ?? ''} onBlur={e => onUpdateMeta(u.id, 'contact_number', e.target.value || null)} className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-zinc-400 uppercase flex items-center gap-1"><Heart size={10} /> Emergency</label>
                                        <Input defaultValue={u.emergency_contact_number ?? ''} onBlur={e => onUpdateMeta(u.id, 'emergency_contact_number', e.target.value || null)} className="h-9 text-sm" />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-zinc-100">
                                    <SalaryManager userId={u.id} />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
