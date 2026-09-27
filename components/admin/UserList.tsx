"use client";

import { useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  UserPlus, UserX, Shield, Briefcase, Key, Clock, CreditCard, Phone, Heart, Save,
  Calendar, Search, ChevronDown, ChevronUp, FileText, Check, X, ShieldAlert, Mail,
  UserCheck, AlertCircle, Settings, User
} from "lucide-react";
import SalaryManager from "@/app/(protected)/admin/SalaryManager";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";
import { validatePasswordPolicy, validateEmailFormat } from "@/lib/utils/passwordPolicy";

export type Profile = {
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
  onAddUser: (email: string, pass: string, isAdmin?: boolean, sendInvite?: boolean) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  onUpdatePass: (email: string, pass: string) => Promise<void>;
  onToggleStockManager: (id: string, current: boolean) => Promise<void>;
  onUpdateMeta?: (id: string, field: string, val: any) => Promise<void>;
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
  if (!match) return time12h;

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

// ============================================================================
// ADMIN USER CARD (CLEAN, NON-ACCORDION, NO SALARY)
// ============================================================================
function AdminUserCard({
  user,
  onUpdatePass,
}: {
  user: Profile;
  onUpdatePass: (email: string, pass: string) => Promise<void>;
}) {
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [password, setPassword] = useState("");
  const [isSavingPass, setIsSavingPass] = useState(false);

  const displayName = user.email.split("@")[0].replace(/[._-]/g, " ");

  async function handleUpdatePassword() {
    if (!password) return;
    setIsSavingPass(true);
    try {
      await onUpdatePass(user.email, password);
      setPassword("");
      setIsChangingPass(false);
    } finally {
      setIsSavingPass(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-50/70 via-white to-blue-50/40 rounded-xl border border-blue-200/80 p-3.5 sm:p-4 mb-2.5 shadow-sm transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <Shield size={16} fill="currentColor" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-900 text-sm capitalize">{displayName}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md">
                <Shield size={10} fill="currentColor" /> Store Administrator
              </span>
            </div>
            <div className="text-xs text-zinc-500 truncate mt-0.5" title={user.email}>
              {user.email}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-100">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsChangingPass(!isChangingPass)}
            className="bg-white hover:bg-blue-50 text-blue-700 border-blue-200 font-semibold h-8.5 text-xs gap-1.5 shadow-xs"
          >
            <Key size={13} />
            <span>{isChangingPass ? "Cancel" : "Change Password"}</span>
          </Button>
        </div>
      </div>

      {isChangingPass && (
        <div className="mt-3 pt-3 border-t border-blue-100/80 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="bg-white rounded-lg border border-blue-200 p-3 max-w-md space-y-2">
            <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Key size={13} className="text-blue-600" /> New Admin Password (8+ characters)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Enter new admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white h-9 text-xs border-zinc-200 focus:border-blue-500"
              />
              <Button
                size="sm"
                onClick={handleUpdatePassword}
                disabled={isSavingPass || !password}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-9 px-3 text-xs shrink-0"
              >
                {isSavingPass ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SINGLE STAFF USER ACCORDION ROW COMPONENT
// ============================================================================
function UserAccordionRow({
  user,
  isExpanded,
  onToggle,
  onRemoveUser,
  onUpdatePass,
  onToggleStockManager,
  onUpdateFullProfile,
  onDownloadPayslip,
}: {
  user: Profile;
  isExpanded: boolean;
  onToggle: () => void;
  onRemoveUser: (id: string) => Promise<void>;
  onUpdatePass: (email: string, pass: string) => Promise<void>;
  onToggleStockManager: (id: string, current: boolean) => Promise<void>;
  onUpdateFullProfile: (id: string, updates: any) => Promise<void>;
  onDownloadPayslip: (userId: string, date: Date) => Promise<void>;
}) {
  if (user.is_admin) {
    return <AdminUserCard user={user} onUpdatePass={onUpdatePass} />;
  }

  const [activeTab, setActiveTab] = useState<"profile" | "salary" | "security">("salary");
  const [password, setPassword] = useState("");
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [salaryRefreshKey, setSalaryRefreshKey] = useState(0);

  const [formData, setFormData] = useState({
    in_time: user.in_time || "",
    base_salary_cents: user.base_salary_cents ? (user.base_salary_cents / 100).toString() : "",
    fixed_allowance_cents: user.fixed_allowance_cents ? (user.fixed_allowance_cents / 100).toString() : "",
    per_day_salary_cents: user.per_day_salary_cents ? (user.per_day_salary_cents / 100).toString() : "",
    dob: user.dob || "",
    contact_number: user.contact_number || "",
    emergency_contact_number: user.emergency_contact_number || "",
  });

  const age = formData.dob ? calculateAge(formData.dob) : user.age;
  const initial = user.email ? user.email[0].toUpperCase() : "U";
  const displayName = user.email.split("@")[0].replace(/[._-]/g, " ");

  async function handleSaveProfile() {
    setIsSavingProfile(true);
    try {
      const calculatedAge = formData.dob ? calculateAge(formData.dob) : user.age;
      const updates = {
        in_time: formData.in_time || null,
        base_salary_cents: formData.base_salary_cents
          ? Math.round(parseFloat(formData.base_salary_cents) * 100)
          : null,
        fixed_allowance_cents: formData.fixed_allowance_cents
          ? Math.round(parseFloat(formData.fixed_allowance_cents) * 100)
          : null,
        per_day_salary_cents: formData.per_day_salary_cents
          ? Math.round(parseFloat(formData.per_day_salary_cents) * 100)
          : null,
        dob: formData.dob || null,
        age: typeof calculatedAge === "number" ? calculatedAge : null,
        contact_number: formData.contact_number || null,
        emergency_contact_number: formData.emergency_contact_number || null,
      };

      if (updates.per_day_salary_cents) {
        const now = new Date();
        const startOfPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const y = startOfPeriod.getFullYear();
        const m = String(startOfPeriod.getMonth() + 1).padStart(2, "0");
        const d = String(startOfPeriod.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;

        await supabaseClient
          .from("salary_entries")
          .update({ amount_cents: updates.per_day_salary_cents })
          .eq("user_id", user.id)
          .eq("kind", "deduction")
          .ilike("reason", "%leave%")
          .gte("entry_date", dateStr)
          .neq("amount_cents", updates.per_day_salary_cents);
      }

      await onUpdateFullProfile(user.id, updates);
      setSalaryRefreshKey((k) => k + 1);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleUpdatePassword() {
    if (!password) return;
    setIsSavingPass(true);
    try {
      await onUpdatePass(user.email, password);
      setPassword("");
    } finally {
      setIsSavingPass(false);
    }
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl border transition-all duration-200 overflow-hidden mb-2.5 shadow-sm",
        isExpanded
          ? "border-blue-300 ring-2 ring-blue-500/10 shadow-md"
          : "border-zinc-200 hover:border-blue-200 hover:bg-blue-50/20"
      )}
    >
      {/* ------------------------------------------------------------- */}
      {/* HIGH-DENSITY ACCORDION HEADER (ALL USERS VIEWABLE AT A GLANCE) */}
      {/* ------------------------------------------------------------- */}
      <div
        onClick={onToggle}
        className={cn(
          "px-3.5 py-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",
          isExpanded ? "bg-blue-50/50 border-b border-blue-100" : "bg-white"
        )}
      >
        {/* User Avatar + Email & Role */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 transition-colors",
              user.is_admin
                ? "bg-blue-600 text-white"
                : user.is_stock_manager
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-blue-50 text-blue-700 border border-blue-100"
            )}
          >
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-900 text-sm truncate capitalize">
                {displayName}
              </span>

              {/* Role Badges */}
              {user.is_admin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded-md">
                  <Shield size={10} fill="currentColor" /> Admin
                </span>
              )}
              {user.is_stock_manager && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md">
                  <Briefcase size={10} /> Stock Mgr
                </span>
              )}
              {!user.is_admin && !user.is_stock_manager && (
                <span className="inline-flex items-center text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                  Staff
                </span>
              )}
            </div>

            <div className="text-xs text-zinc-500 truncate" title={user.email}>
              {user.email}
            </div>
          </div>
        </div>

        {/* Quick Glance Key Metrics */}
        <div className="hidden md:flex items-center gap-6 text-xs text-zinc-600 px-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-[90px]" title="Shift In-Time">
            <Clock size={13} className="text-blue-600 shrink-0" />
            <span className="font-medium truncate">{user.in_time || "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-[95px]" title="Base Salary">
            <CreditCard size={13} className="text-blue-600 shrink-0" />
            <span className="font-medium truncate">
              {user.base_salary_cents ? `₹ ${(user.base_salary_cents / 100).toLocaleString("en-IN")}` : "—"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 min-w-[105px]" title="Phone Contact">
            <Phone size={13} className="text-blue-600 shrink-0" />
            <span className="font-medium truncate">{user.contact_number || "—"}</span>
          </div>
        </div>

        {/* Accordion Expand / Collapse Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all",
              isExpanded
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-600 hover:bg-blue-50 hover:text-blue-700"
            )}
          >
            <span className="hidden sm:inline">{isExpanded ? "Close" : "Manage"}</span>
            <ChevronDown
              size={14}
              className={cn("transition-transform duration-200", isExpanded && "rotate-180")}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* EXPANDED ACCORDION CONTENT (STAFF ONLY)                       */}
      {/* ------------------------------------------------------------- */}
      {isExpanded && (
        <div className="p-4 sm:p-5 bg-white space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Sub-Tabs Navigation (Salary Ledger first for staff by default) */}
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab("salary")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap",
                activeTab === "salary"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              <FileText size={13} />
              <span>Salary Ledger & Payslips</span>
            </button>

                <button
                  onClick={() => setActiveTab("profile")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap",
                    activeTab === "profile"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  <Settings size={13} />
                  <span>Profile & Shifts</span>
                </button>

                <button
                  onClick={() => setActiveTab("security")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap",
                    activeTab === "security"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  <Key size={13} />
                  <span>Roles & Security</span>
                </button>
              </div>

          {/* TAB 1: PROFILE & SHIFTS */}
          {activeTab === "profile" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* Expected In-Time */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Clock size={11} className="text-blue-600" /> Expected In-Time
                  </label>
                  <Input
                    type="time"
                    value={convertTime12to24(formData.in_time)}
                    onChange={(e) =>
                      setFormData({ ...formData, in_time: convertTime24to12(e.target.value) })
                    }
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-400">Current: {formData.in_time || "Not configured"}</span>
                </div>

                {/* Base Salary */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard size={11} className="text-blue-600" /> Base Salary (₹ / mo)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 18000"
                    value={formData.base_salary_cents}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = parseFloat(val);
                      const perDay = !isNaN(num) ? (num / 30).toFixed(2) : "";
                      setFormData({
                        ...formData,
                        base_salary_cents: val,
                        per_day_salary_cents: perDay,
                      });
                    }}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Per-Day Salary Rate */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard size={11} className="text-blue-600" /> Per-Day Rate (₹ / day)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 600"
                    value={formData.per_day_salary_cents}
                    onChange={(e) =>
                      setFormData({ ...formData, per_day_salary_cents: e.target.value })
                    }
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* DOB */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar size={11} className="text-blue-600" /> Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Calculated Age */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <User size={11} className="text-blue-600" /> Age
                  </label>
                  <Input
                    disabled
                    value={formData.dob ? `${calculateAge(formData.dob)} yrs` : "N/A"}
                    className="h-9.5 text-sm bg-zinc-100 text-zinc-500 cursor-not-allowed border-zinc-200"
                  />
                </div>

                {/* Contact Phone */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Phone size={11} className="text-blue-600" /> Primary Contact
                  </label>
                  <Input
                    type="tel"
                    placeholder="+91 9876543210"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Emergency Contact */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Heart size={11} className="text-blue-600" /> Emergency Contact
                  </label>
                  <Input
                    type="tel"
                    placeholder="+91 9876543210"
                    value={formData.emergency_contact_number}
                    onChange={(e) =>
                      setFormData({ ...formData, emergency_contact_number: e.target.value })
                    }
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Save Button Bar */}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                <span className="text-[11px] text-zinc-400 hidden sm:inline">
                  Per-day rate automatically computes leave deductions when absent.
                </span>

                <Button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold h-9.5 px-5 gap-1.5 shadow-sm"
                >
                  <Save size={15} />
                  <span>{isSavingProfile ? "Saving..." : "Save Profile Details"}</span>
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: SALARY LEDGER & PAYSLIPS */}
          {activeTab === "salary" && !user.is_admin && (
            <div className="animate-in fade-in duration-150 pt-1">
              <SalaryManager
                key={salaryRefreshKey}
                userId={user.id}
                perDaySalary={parseFloat(formData.per_day_salary_cents || "0") * 100}
                onDownloadPayslip={onDownloadPayslip}
              />
            </div>
          )}

          {/* TAB 3: ROLES & SECURITY */}
          {activeTab === "security" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Role Permissions Card */}
              {!user.is_admin && (
                <div className="bg-zinc-50 rounded-xl border border-zinc-200/80 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Briefcase size={14} className="text-amber-600" /> Stock Manager Role
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Grants access to inventory tracking, stock adjustments, and product alerts.
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onToggleStockManager(user.id, !!user.is_stock_manager)}
                      className={cn(
                        "h-9 text-xs font-semibold whitespace-nowrap",
                        user.is_stock_manager
                          ? "border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                          : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      )}
                    >
                      {user.is_stock_manager ? "Revoke Stock Manager" : "Grant Stock Manager"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Password Reset Card */}
              <div className="bg-zinc-50 rounded-xl border border-zinc-200/80 p-4 space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={14} className="text-blue-600" /> Update Password
                </h4>
                <p className="text-xs text-zinc-500">
                  Set a new direct login password for this team member.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-2.5 max-w-md">
                  <Input
                    type="text"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white h-9.5 text-sm border-zinc-200 focus:border-blue-500"
                  />
                  <Button
                    onClick={handleUpdatePassword}
                    disabled={isSavingPass || !password}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold h-9.5 px-4 shrink-0"
                  >
                    {isSavingPass ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </div>

              {/* Danger Zone: Remove User */}
              <div className="bg-red-50/50 rounded-xl border border-red-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                    <UserX size={14} className="text-red-600" /> Danger Zone: Remove Member
                  </h4>
                  <p className="text-xs text-red-600/80 mt-0.5">
                    Permanently delete this staff profile and revoke all portal access.
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-white hover:bg-red-50 text-red-600 border-red-200 hover:border-red-300 font-semibold h-9 shrink-0"
                >
                  <UserX size={14} className="mr-1.5" /> Remove User
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Remove Team Member?"
        description={`Are you sure you want to remove ${user.email}? This will delete their account profile and revoke portal access.`}
        confirmLabel="Remove Member"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          await onRemoveUser(user.id);
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ============================================================================
// MAIN USER LIST CONTAINER
// ============================================================================
export function UserList({
  users,
  onAddUser,
  onRemoveUser,
  onUpdatePass,
  onToggleStockManager,
  onUpdateFullProfile,
  onDownloadPayslip,
}: UserListProps) {
  // New User Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "stock_manager" | "staff">("all");

  // Accordion State: Track expanded row ID (allows smooth 1-at-a-time or multi)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const policy = validatePasswordPolicy(password, isAdminRole ? "admin" : "staff");

  const isAdminUser = (u: Profile) => !!u.is_admin || u.email?.toLowerCase().startsWith("admin") || u.email?.toLowerCase().includes("admin@");

  // Keep strictly the first primary store admin
  const primaryAdmin = useMemo(() => {
    return users.find((u) => isAdminUser(u)) || null;
  }, [users]);

  // Genuine staff members (all non-admin accounts)
  const staffMembers = useMemo(() => {
    return users.filter((u) => !isAdminUser(u));
  }, [users]);

  const matchesSearch = (u: Profile) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.contact_number && u.contact_number.includes(q));
  };

  const showAdminCard = primaryAdmin && matchesSearch(primaryAdmin) && (roleFilter === "all" || roleFilter === "admin");

  const filteredStaff = useMemo(() => {
    if (roleFilter === "admin") return [];
    return staffMembers.filter((u) => {
      if (!matchesSearch(u)) return false;
      if (roleFilter === "stock_manager") return !!u.is_stock_manager;
      if (roleFilter === "staff") return !u.is_stock_manager;
      return true;
    });
  }, [staffMembers, searchQuery, roleFilter]);

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: (primaryAdmin ? 1 : 0) + staffMembers.length,
      admin: primaryAdmin ? 1 : 0,
      stock_manager: staffMembers.filter((u) => u.is_stock_manager).length,
      staff: staffMembers.filter((u) => !u.is_stock_manager).length,
    };
  }, [primaryAdmin, staffMembers]);

  async function handleAddUser() {
    if (!validateEmailFormat(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (!sendInvite && !policy.valid) {
      alert(policy.errors.join("\n"));
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddUser(email, password, isAdminRole, sendInvite);
      setEmail("");
      setPassword("");
      setIsAdminRole(false);
      setSendInvite(false);
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleExpand(id: string) {
    setExpandedUserId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* ------------------------------------------------------------- */}
      {/* TOP CONTROL BAR: SEARCH, ROLE PILLS & ADD MEMBER TRIGGER      */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <UserCheck className="text-blue-600" size={20} />
              Users & Roles Management
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Click any team member below to configure shifts, salary rates, or manage payslips.
            </p>
          </div>

          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className={cn(
              "shrink-0 font-semibold gap-2 transition-all h-9.5 text-xs sm:text-sm",
              showAddForm
                ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            )}
          >
            {showAddForm ? (
              <>
                <X size={16} /> Cancel
              </>
            ) : (
              <>
                <UserPlus size={16} /> Add Team Member
              </>
            )}
          </Button>
        </div>

        {/* Collapsible Add User Card */}
        {showAddForm && (
          <div className="pt-4 border-t border-zinc-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus size={14} className="text-blue-600" /> New Member Details
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendInvite}
                      onChange={(e) => setSendInvite(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <Mail size={13} className="text-blue-600" />
                    <span>Send Email Invite</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAdminRole}
                      onChange={(e) => setIsAdminRole(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <Shield size={13} className="text-blue-600" />
                    <span>Store Admin</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className={sendInvite ? "sm:col-span-9" : "sm:col-span-6"}>
                  <Input
                    type="email"
                    placeholder="staff@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white h-10 text-sm border-zinc-200 focus:border-blue-500"
                  />
                </div>

                {!sendInvite && (
                  <div className="sm:col-span-3">
                    <Input
                      type="text"
                      placeholder={isAdminRole ? "Admin pass (8+ chars)" : "Password (e.g. DOB)"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white h-10 text-sm border-zinc-200 focus:border-blue-500"
                    />
                  </div>
                )}

                <div className="sm:col-span-3">
                  <Button
                    onClick={handleAddUser}
                    disabled={isSubmitting || !email}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full h-10 font-semibold"
                  >
                    <UserPlus size={16} className="mr-1.5" />
                    <span>{isSubmitting ? "Creating..." : sendInvite ? "Send Invite" : "Create User"}</span>
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-blue-500 shrink-0" />
                {sendInvite
                  ? "An onboarding invitation email with a secure setup link will be sent to the employee."
                  : isAdminRole
                  ? "Store Admins require at least 8 characters with uppercase and number/symbol."
                  : "Staff passwords can be flexible (e.g. DOB 12092026 or PIN), editable anytime in their profile."}
              </p>
            </div>
          </div>
        )}

        {/* Live Search & Role Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={15} />
            <Input
              type="text"
              placeholder="Search by email or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9.5 text-xs sm:text-sm bg-zinc-50/60 border-zinc-200 focus:bg-white focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Role Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setRoleFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                roleFilter === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => setRoleFilter("admin")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                roleFilter === "admin"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              Admins ({counts.admin})
            </button>
            <button
              onClick={() => setRoleFilter("stock_manager")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                roleFilter === "stock_manager"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              Stock Mgrs ({counts.stock_manager})
            </button>
            <button
              onClick={() => setRoleFilter("staff")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                roleFilter === "staff"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              Staff ({counts.staff})
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* USER LIST (SINGLE ADMIN CARD + STAFF ACCORDIONS)               */}
      {/* ------------------------------------------------------------- */}
      {!showAdminCard && filteredStaff.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
          <UserX className="mx-auto text-zinc-300 mb-2" size={32} />
          <p className="text-sm font-semibold text-zinc-700">No team members found</p>
          <p className="text-xs text-zinc-400 mt-1">Try adjusting your search query or filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Primary Store Admin Card (Only the single first admin, non-accordion) */}
          {showAdminCard && (
            <AdminUserCard user={primaryAdmin!} onUpdatePass={onUpdatePass} />
          )}

          {/* Staff Accordion Rows */}
          {filteredStaff.map((u) => (
            <UserAccordionRow
              key={u.id}
              user={u}
              isExpanded={expandedUserId === u.id}
              onToggle={() => handleToggleExpand(u.id)}
              onRemoveUser={onRemoveUser}
              onUpdatePass={onUpdatePass}
              onToggleStockManager={onToggleStockManager}
              onUpdateFullProfile={onUpdateFullProfile}
              onDownloadPayslip={onDownloadPayslip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
