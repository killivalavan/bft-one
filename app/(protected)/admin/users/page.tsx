"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { UserList } from "@/components/admin/UserList";
import { generatePayslipPdf } from "@/lib/utils/payslip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTenant } from "@/lib/context/TenantContext";
import { Users, Loader2, AlertTriangle, Copy, Check, ExternalLink, Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  aadhaar_number?: string | null;
  employee_id?: string | null;
  designation?: string | null;
  department?: string | null;
  date_of_joining?: string | null;
  joining_salary_cents?: number | null;
  increment_amount_cents?: number | null;
  increment_frequency_months?: number | null;
  next_increment_date?: string | null;
  increment_policy_note?: string | null;
  blood_group?: string | null;
};

export default function UsersAndRolesPage() {
  const { toast } = useToast();
  const { business } = useTenant();

  const [users, setUsers] = useState<Profile[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [totalNetPayroll, setTotalNetPayroll] = useState(0);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    desc: string;
    action?: () => Promise<void>;
  }>({ open: false, title: "", desc: "" });

  async function load() {
    setLoading(true);
    const bizId = business?.id;

    // Fetch profiles scoped to business
    let profileQuery = supabaseClient
      .from("profiles")
      .select("id,email,first_name,last_name,full_name,aadhaar_number,is_admin,is_stock_manager,in_time,base_salary_cents,fixed_allowance_cents,per_day_salary_cents,age,dob,contact_number,emergency_contact_number,employee_id,designation,department,date_of_joining,joining_salary_cents,increment_amount_cents,increment_frequency_months,next_increment_date,increment_policy_note,blood_group")
      .order("email");
    if (bizId) {
      profileQuery = profileQuery.eq("business_id", bizId);
    }
    let { data: us, error } = await profileQuery;

    if (error) {
      console.warn("Full fetch failed (missing columns in profiles table), using safe fallback...", error);
      setMigrationNeeded(true);
      let fbQuery = supabaseClient
        .from("profiles")
        .select("id,email,full_name,is_admin,is_stock_manager,in_time,base_salary_cents,fixed_allowance_cents,per_day_salary_cents,age,dob,contact_number,emergency_contact_number")
        .order("email");
      if (bizId) {
        fbQuery = fbQuery.eq("business_id", bizId);
      }
      const { data: usFallback, error: errFallback } = await fbQuery;

      if (errFallback) {
        console.error("Fallback fetch failed", errFallback);
        toast({ title: "Error loading users", description: errFallback.message, variant: "error" });
        setUsers([]);
      } else {
        us = usFallback as any;
      }
    } else {
      setMigrationNeeded(false);
    }

    const allUsers = us || [];
    setUsers(allUsers);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const startStr = monthStart.toISOString().slice(0, 10);
    const endStr = monthEnd.toISOString().slice(0, 10);

    let salaryQuery = supabaseClient
      .from("salary_entries")
      .select("user_id, amount_cents, kind")
      .gte("entry_date", startStr)
      .lte("entry_date", endStr);
    if (bizId) {
      salaryQuery = salaryQuery.eq("business_id", bizId);
    }
    const { data: salaryEntries } = await salaryQuery;

    const salaryTotals = new Map<string, { base: number; allowance: number; additions: number; deductions: number }>();

    allUsers.forEach((user: any) => {
      if (user.is_admin || user.email?.toLowerCase().includes('admin')) return;
      salaryTotals.set(user.id, {
        base: Number(user.base_salary_cents || 0),
        allowance: Number(user.fixed_allowance_cents || 0),
        additions: 0,
        deductions: 0,
      });
    });

    (salaryEntries || []).forEach((entry: any) => {
      const userId = entry.user_id;
      const totals = salaryTotals.get(userId);
      if (!totals) return;

      const amount = Number(entry.amount_cents || 0);
      const kind = String(entry.kind || "").toLowerCase();

      if (["allowance", "bonus", "addition"].includes(kind)) {
        totals.additions += amount;
      } else {
        totals.deductions += amount;
      }
    });

    let payrollTotal = 0;
    let netPayrollTotal = 0;

    salaryTotals.forEach((totals) => {
      const structureSalary = totals.base + totals.allowance;
      payrollTotal += structureSalary;
      netPayrollTotal += structureSalary + totals.additions - totals.deductions;
    });

    setTotalPayroll(payrollTotal);
    setTotalNetPayroll(netPayrollTotal);

    // Keep fixed monthly expenses Staff Salary overhead auto-synced with Total Salary Structure
    if (payrollTotal > 0 && bizId) {
      try {
        let monthlyQuery = supabaseClient
          .from("monthly_expenses")
          .select("id, amount_cents")
          .eq("business_id", bizId)
          .or("category.eq.Salary,item_name.ilike.%salary%");

        const { data: salaryRows } = await monthlyQuery;
        if (salaryRows && salaryRows.length > 0) {
          const sRow = salaryRows[0];
          if (sRow.amount_cents !== payrollTotal) {
            await supabaseClient
              .from("monthly_expenses")
              .update({
                amount_cents: payrollTotal,
                previous_amount_cents: sRow.amount_cents,
                notes: `Auto-updated from employee salary structure in Users & Roles`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sRow.id);
          }
        }
      } catch (err) {
        console.warn("Failed to sync monthly expense salary overhead:", err);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [business?.id]);

  // User Actions
  async function createUser(email: string, password?: string, isAdmin: boolean = false, sendInvite: boolean = false) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/seed-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email, password, isAdmin, sendInvite, businessId: business?.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Failed to create user", description: data?.error || "Unknown error", variant: "error" });
        return;
      }
      await load();
      toast({ title: sendInvite ? "Invitation sent" : "User created", variant: "success" });
    } catch (e: any) {
      toast({ title: "Failed to create user", description: e?.message, variant: "error" });
    }
  }

  async function updatePasswordFor(email: string, newPassword: string) {
    if (!newPassword) { toast({ title: "Enter a password", variant: "error" }); return; }
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/seed-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email, password: newPassword, isAdmin: false, businessId: business?.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Failed to update password", description: data?.error || "Unknown error", variant: "error" });
        return;
      }
      toast({ title: "Password updated", variant: "success" });
    } catch (e: any) {
      toast({ title: "Failed to update password", description: e?.message, variant: "error" });
    }
  }

  async function removeUser(userId: string) {
    setConfirmState({
      open: true,
      title: "Remove User?",
      desc: "This will permanently remove the user from the system. This action cannot be undone.",
      action: async () => {
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
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { 
            toast({ title: "Failed to remove user", description: data?.error || "Unknown error", variant: "error" });
            return; 
          }
          await load();
          toast({ title: "User removed", variant: "success" });
        } catch (e: any) {
          toast({ title: "Failed to remove user", description: e?.message || "Unknown error", variant: "error" });
        }
      }
    });
  }

  async function toggleStockManager(userId: string, current: boolean) {
    await supabaseClient.from('profiles').update({ is_stock_manager: !current }).eq('id', userId);
    await load();
    toast({ title: !current ? "Granted Stock Manager" : "Revoked Stock Manager", variant: "success" });
  }

  async function updateFullProfile(id: string, updates: any) {
    const bizId = business?.id;

    // Multi-tenant check: ensure employee_id is unique within this store
    if (updates.employee_id && typeof updates.employee_id === "string" && updates.employee_id.trim()) {
      const empIdTrimmed = updates.employee_id.trim();
      let dupQuery = supabaseClient
        .from("profiles")
        .select("id, email, first_name, full_name")
        .neq("id", id)
        .ilike("employee_id", empIdTrimmed);

      if (bizId) {
        dupQuery = dupQuery.eq("business_id", bizId);
      }

      const { data: existingDup } = await dupQuery.maybeSingle();
      if (existingDup) {
        const dupName = existingDup.first_name || existingDup.full_name || existingDup.email;
        toast({
          title: "Duplicate Employee ID",
          description: `Employee ID "${empIdTrimmed}" is already assigned to ${dupName} in this store. Each staff member in your store must have a unique ID.`,
          variant: "error",
        });
        return;
      }
    }

    const { error } = await supabaseClient.from('profiles').update(updates).eq('id', id);
    if (error) {
      if (
        error.code === "23505" ||
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.toLowerCase().includes("unique")
      ) {
        toast({
          title: "Duplicate Employee ID Conflict",
          description: `Employee ID "${updates.employee_id}" is already in use by another user in this store. Please enter a unique Employee ID.`,
          variant: "error",
        });
        return;
      }

      console.warn("Update failed (likely unmigrated columns), trying safe fallback...", error.message);
      // Strip columns that might not exist in profiles table yet
      const unmigratedCols = [
        'first_name',
        'last_name',
        'aadhaar_number',
        'blood_group',
        'employee_id',
        'designation',
        'department',
        'date_of_joining',
        'joining_salary_cents',
        'increment_amount_cents',
        'increment_frequency_months',
        'next_increment_date',
        'increment_policy_note',
        'dob',
        'age',
      ];
      const safeUpdates = { ...updates };
      unmigratedCols.forEach((col) => delete safeUpdates[col]);

      const { error: errFallback } = await supabaseClient.from('profiles').update(safeUpdates).eq('id', id);

      if (errFallback) {
        toast({ title: "Update failed", description: errFallback.message, variant: "error" });
      } else {
        setMigrationNeeded(true);
        toast({
          title: "Base Profile Saved",
          description: "Details saved! To persist 'blood_group' and employee hub data, please run the SQL script in Supabase.",
          variant: "warning",
        });
        await load();
      }
      return;
    }
    toast({ title: "Profile updated successfully", variant: "success" });
    await load();
  }

  async function handleDownloadPayslip(userId: string, targetDate: Date) {
    try {
      const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

      const toDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const startStr = toDateStr(start);
      const endStr = toDateStr(end);
      const monthLabel = start.toLocaleString(undefined, { month: 'long', year: 'numeric' });

      const { data: prof, error: profErr } = await supabaseClient.from('profiles').select('email, base_salary_cents').eq('id', userId).single();
      if (profErr || !prof) throw new Error("Profile not found");

      const { data: ents, error: entsErr } = await supabaseClient.from('salary_entries').select('entry_date, amount_cents, reason, kind').eq('user_id', userId).gte('entry_date', startStr).lte('entry_date', endStr).order('entry_date', { ascending: false });
      if (entsErr) throw new Error("Failed to load entries");

      const entries = ents || [];

      let totalDeductions = 0;
      let totalAdditions = 0;

      entries.forEach((e: any) => {
        let isDeduction = false;
        if (e.kind === 'deduction') isDeduction = true;
        else if (e.kind === 'addition') isDeduction = false;
        else {
          const r = (e.reason || '').toLowerCase();
          if (r.includes('deduction') || r.includes('advance') || r.includes('leave') || r.includes('late') || r.includes('half day')) {
            isDeduction = true;
          }
        }

        if (isDeduction) totalDeductions += (e.amount_cents || 0);
        else totalAdditions += (e.amount_cents || 0);
      });

      const [{ count: leaveCount }, { data: weekOffs }] = await Promise.all([
        supabaseClient.from('leaves').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('leave_date', startStr).lte('leave_date', endStr),
        supabaseClient.from('leaves').select('leave_date, reason').eq('user_id', userId).eq('reason', 'Weekly Off').gte('leave_date', startStr).lte('leave_date', endStr)
      ]);

      const weekOffEntries = (weekOffs || []).map((w: any) => ({
        entry_date: w.leave_date,
        reason: 'Weekly Off',
        amount_cents: 0,
        kind: 'info'
      }));

      const finalEntries = [...entries, ...weekOffEntries].sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());

      const baseSalary = prof.base_salary_cents || 0;
      const netPay = baseSalary + totalAdditions - totalDeductions;

      const result = await generatePayslipPdf({
        userEmail: prof.email,
        monthLabel,
        baseSalary,
        totalDeductions,
        totalAdditions,
        netPay,
        entries: finalEntries as any,
        leaveDays: leaveCount || 0,
        businessName: business?.name || "BFT Navalur",
        logoUrl: business?.logo_url || "/logo_payslip.jpg",
      });
      toast({ title: `Payslip downloaded for ${prof.email}`, variant: "success" });
      return result;
    } catch (e: any) {
      console.error(e);
      toast({ title: "Payslip failed", description: e.message, variant: "error" });
      return null;
    }
  }

  return (
    <div className="min-h-screen pb-20 bg-[#F8FAFC]">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Users & Roles</h1>
              <p className="text-xs text-zinc-500 mt-0.5">{business?.name || "Store Operations"} — Staff accounts, permissions & salary structure</p>
            </div>
          </div>

          <Link
            href="/notice-board"
            className="inline-flex items-center bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-xs gap-1.5 shadow-2xs self-start sm:self-auto h-9 px-3 rounded-lg transition-colors"
          >
            <Bell size={14} className="text-blue-600" />
            <span>📢 Manage Notice Board</span>
          </Link>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-zinc-500">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <span>Loading staff directory...</span>
          </div>
        ) : (
          <>
            {/* Database Migration Alert Banner */}
            {migrationNeeded && (
              <div className="bg-gradient-to-r from-amber-50 via-white to-orange-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-amber-950">
                        Supabase Database Migration Required
                      </span>
                      <span className="text-[10px] font-semibold bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full">
                        Action Required
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1 max-w-2xl leading-relaxed">
                      The <strong>blood_group</strong> and Employee Hub columns have not been added to your Supabase <code>profiles</code> table yet. Run the SQL script in your Supabase Dashboard to enable saving blood groups, employee IDs, and increments.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const sql = `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT, ADD COLUMN IF NOT EXISTS last_name TEXT, ADD COLUMN IF NOT EXISTS aadhaar_number TEXT, ADD COLUMN IF NOT EXISTS blood_group TEXT, ADD COLUMN IF NOT EXISTS employee_id TEXT, ADD COLUMN IF NOT EXISTS designation TEXT, ADD COLUMN IF NOT EXISTS department TEXT, ADD COLUMN IF NOT EXISTS date_of_joining DATE, ADD COLUMN IF NOT EXISTS joining_salary_cents BIGINT;\nCREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_business_employee_id ON public.profiles(business_id, employee_id) WHERE employee_id IS NOT NULL AND employee_id != '';`;
                      navigator.clipboard.writeText(sql);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 3000);
                      toast({
                        title: "SQL Copied to Clipboard!",
                        description: "Paste it into the Supabase SQL editor and click Run.",
                        variant: "success",
                      });
                    }}
                    className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs h-8.5 gap-1.5 shadow-2xs"
                  >
                    {copiedSql ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{copiedSql ? "Copied!" : "Copy SQL"}</span>
                  </Button>

                  <a
                    href="https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-8.5 px-3 rounded-lg shadow-2xs transition-colors"
                  >
                    <span>Open SQL Editor</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-5">
                <div className="text-sm font-medium text-zinc-500">Total Salary Structure</div>
                <div className="mt-2 text-3xl font-bold text-zinc-900">₹ {(totalPayroll / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                <div className="mt-2 text-xs text-zinc-500">Current base + allowance for all employees</div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-5">
                <div className="text-sm font-medium text-zinc-500">Current Net Payroll</div>
                <div className="mt-2 text-3xl font-bold text-emerald-600">₹ {(totalNetPayroll / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                <div className="mt-2 text-xs text-zinc-500">Base + allowance + additions - deductions this month</div>
              </div>
            </div>

            <UserList
              users={users}
              onAddUser={createUser}
              onRemoveUser={removeUser}
              onUpdatePass={updatePasswordFor}
              onToggleStockManager={toggleStockManager}
              onUpdateFullProfile={updateFullProfile}
              onDownloadPayslip={handleDownloadPayslip}
            />
          </>
        )}

        <ConfirmDialog
          open={!!confirmState.open}
          title={confirmState.title}
          description={confirmState.desc}
          onConfirm={async () => {
            if (confirmState.action) await confirmState.action();
            setConfirmState({ open: false, title: "", desc: "", action: undefined });
          }}
          onCancel={() => setConfirmState({ open: false, title: "", desc: "", action: undefined })}
          confirmLabel="Delete User"
        />
      </div>
    </div>
  );
}
