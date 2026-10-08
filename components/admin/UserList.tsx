"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import {
  UserPlus, UserX, Shield, Briefcase, Key, Clock, CreditCard, Phone, Heart, Save,
  Calendar, Search, ChevronDown, ChevronUp, FileText, Check, CheckCircle, X, ShieldAlert, Mail,
  UserCheck, AlertCircle, Settings, User, Award, Eye, TrendingUp, Sparkles, Building2, Plus,
  Droplets, Trash2, History, ArrowRight
} from "lucide-react";
import SalaryManager from "@/app/(protected)/admin/SalaryManager";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { validatePasswordPolicy, validateEmailFormat } from "@/lib/utils/passwordPolicy";
import { EmployeeAchievementsModal } from "./EmployeeAchievementsModal";

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

export function generateNextEmployeeId(usersList: Profile[], currentId?: string | null): string {
  if (currentId && currentId.trim()) return currentId.trim();

  let maxNum = 0;
  const usedNumbers = new Set<number>();
  (usersList || []).forEach((u) => {
    if (u.employee_id) {
      const match = u.employee_id.match(/EMP-(\d+)/i) || u.employee_id.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          usedNumbers.add(num);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  });

  // Find lowest unused positive integer starting from 1
  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }

  return `EMP-${String(nextNum).padStart(3, "0")}`;
}

interface UserListProps {
  users: Profile[];
  onAddUser: (email: string, pass: string, isAdmin?: boolean, sendInvite?: boolean) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  onUpdatePass: (email: string, pass: string) => Promise<void>;
  onToggleStockManager: (id: string, current: boolean) => Promise<void>;
  onUpdateMeta?: (id: string, field: string, val: any) => Promise<void>;
  onUpdateFullProfile: (id: string, updates: any) => Promise<void>;
  onDownloadPayslip: (userId: string, date: Date) => Promise<any>;
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
  allUsers = [],
  isExpanded,
  onToggle,
  onRemoveUser,
  onUpdatePass,
  onToggleStockManager,
  onUpdateFullProfile,
  onDownloadPayslip,
  isPrevMonthPaid,
  prevMonthLabel,
  onSettlementChange,
}: {
  user: Profile;
  allUsers?: Profile[];
  isExpanded: boolean;
  onToggle: () => void;
  onRemoveUser: (id: string) => Promise<void>;
  onUpdatePass: (email: string, pass: string) => Promise<void>;
  onToggleStockManager: (id: string, current: boolean) => Promise<void>;
  onUpdateFullProfile: (id: string, updates: any) => Promise<void>;
  onDownloadPayslip: (userId: string, date: Date) => Promise<any>;
  isPrevMonthPaid?: boolean;
  prevMonthLabel?: { short: string; long: string };
  onSettlementChange?: (monthKey: string, isSettled: boolean) => void;
}) {
  if (user.is_admin) {
    return <AdminUserCard user={user} onUpdatePass={onUpdatePass} />;
  }

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"profile" | "salary" | "security">("salary");
  const [password, setPassword] = useState("");
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [salaryRefreshKey, setSalaryRefreshKey] = useState(0);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);

  // Manual Salary Increments & Audit Trail States
  const [incrementsList, setIncrementsList] = useState<any[]>([]);
  const [isLoadingIncrements, setIsLoadingIncrements] = useState(false);
  const [isSubmittingIncrement, setIsSubmittingIncrement] = useState(false);
  const [deletingIncrementId, setDeletingIncrementId] = useState<string | null>(null);
  const [isLoggingIncrement, setIsLoggingIncrement] = useState(false);
  const [isIncrementsSectionExpanded, setIsIncrementsSectionExpanded] = useState(false);

  const initialCurrentBase = user.base_salary_cents ? user.base_salary_cents / 100 : 0;
  const [incLogForm, setIncLogForm] = useState({
    effectiveDate: new Date().toISOString().slice(0, 10),
    incrementAmount: "2000",
    newSalary: (initialCurrentBase + 2000).toString(),
    reason: "Performance Appraisal & Salary Hike",
  });

  const initialFirstName = user.first_name || (user.full_name ? user.full_name.trim().split(" ")[0] : "");
  const initialLastName = user.last_name || (user.full_name ? user.full_name.trim().split(" ").slice(1).join(" ") : "");

  const [formData, setFormData] = useState({
    first_name: initialFirstName,
    last_name: initialLastName,
    full_name: user.full_name || "",
    aadhaar_number: user.aadhaar_number || "",
    employee_id: user.employee_id || "",
    designation: user.designation || "",
    department: user.department || "",
    date_of_joining: user.date_of_joining || "",
    joining_salary_cents: user.joining_salary_cents ? (user.joining_salary_cents / 100).toString() : "",
    increment_amount_cents: user.increment_amount_cents ? (user.increment_amount_cents / 100).toString() : "2000",
    increment_frequency_months: user.increment_frequency_months ? user.increment_frequency_months.toString() : "12",
    next_increment_date: user.next_increment_date || "",
    increment_policy_note: user.increment_policy_note || "",
    in_time: user.in_time || "",
    base_salary_cents: user.base_salary_cents ? (user.base_salary_cents / 100).toString() : "",
    fixed_allowance_cents: user.fixed_allowance_cents ? (user.fixed_allowance_cents / 100).toString() : "",
    per_day_salary_cents: user.per_day_salary_cents ? (user.per_day_salary_cents / 100).toString() : "",
    dob: user.dob || "",
    contact_number: user.contact_number || "",
    emergency_contact_number: user.emergency_contact_number || "",
    blood_group: user.blood_group || "",
  });

  const age = formData.dob ? calculateAge(formData.dob) : user.age;
  const initial = (formData.first_name?.[0] || user.first_name?.[0] || user.email?.[0] || "U").toUpperCase();
  const firstName = formData.first_name || user.first_name || (formData.full_name ? formData.full_name.split(" ")[0] : "");
  const displayName = firstName || user.email.split("@")[0].replace(/[._-]/g, " ");

  // Validate Employee ID uniqueness within this store
  const trimmedEmpId = formData.employee_id?.trim();
  const duplicateEmpUser = useMemo(() => {
    if (!trimmedEmpId) return null;
    return allUsers.find(
      (u) =>
        u.id !== user.id &&
        u.employee_id &&
        u.employee_id.trim().toLowerCase() === trimmedEmpId.toLowerCase()
    );
  }, [trimmedEmpId, allUsers, user.id]);

  async function handleSaveProfile() {
    if (duplicateEmpUser) {
      toast({
        title: "Duplicate Employee ID",
        description: `Employee ID "${trimmedEmpId}" is already assigned to ${
          duplicateEmpUser.first_name || duplicateEmpUser.full_name || duplicateEmpUser.email
        } in this store. Each employee in your store must have a unique ID.`,
        variant: "error",
      });
      return;
    }
    setIsSavingProfile(true);
    try {
      const calculatedAge = formData.dob ? calculateAge(formData.dob) : user.age;
      const previousBaseCents = user.base_salary_cents || 0;
      const newBaseCents = formData.base_salary_cents
        ? Math.round(parseFloat(formData.base_salary_cents) * 100)
        : null;

      // 1. Detect if Base Salary was increased from current base salary
      const isSalaryIncreased =
        previousBaseCents > 0 &&
        newBaseCents !== null &&
        newBaseCents > previousBaseCents;

      const incrementAmountCents = isSalaryIncreased
        ? newBaseCents - previousBaseCents
        : 0;

      const computedFullName = [formData.first_name, formData.last_name].filter(Boolean).join(" ").trim() || formData.full_name || null;

      const updates: any = {
        first_name: formData.first_name?.trim() || null,
        last_name: formData.last_name?.trim() || null,
        full_name: computedFullName,
        aadhaar_number: formData.aadhaar_number?.trim() || null,
        employee_id: formData.employee_id || null,
        designation: formData.designation || null,
        department: formData.department || null,
        date_of_joining: formData.date_of_joining || null,
        joining_salary_cents: formData.joining_salary_cents
          ? Math.round(parseFloat(formData.joining_salary_cents) * 100)
          : null,
        increment_amount_cents: formData.increment_amount_cents
          ? Math.round(parseFloat(formData.increment_amount_cents) * 100)
          : 200000,
        increment_frequency_months: formData.increment_frequency_months
          ? parseInt(formData.increment_frequency_months, 10)
          : 12,
        next_increment_date: formData.next_increment_date || null,
        increment_policy_note: formData.increment_policy_note || null,
        in_time: formData.in_time || null,
        base_salary_cents: newBaseCents,
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
        blood_group: formData.blood_group || null,
      };

      // If initial base salary is being set and no joining salary exists, default joining salary to it
      if (!updates.joining_salary_cents && user.joining_salary_cents == null && newBaseCents) {
        updates.joining_salary_cents = previousBaseCents > 0 ? previousBaseCents : newBaseCents;
      }

      // 2. If salary is increased, automatically log it to employee_increments history!
      if (isSalaryIncreased && newBaseCents) {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          const incRes = await fetch("/api/admin/employee-hub", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              action: "add_increment",
              userId: user.id,
              effectiveDate: new Date().toISOString().slice(0, 10),
              incrementAmountCents,
              newSalaryCents: newBaseCents,
              previousSalaryCents: previousBaseCents,
              reason: "Base salary revision / Annual increment",
            }),
          });
          if (incRes.ok) {
            toast({
              title: "🎉 Salary Increment Recorded!",
              description: `Base salary increased by ₹${(incrementAmountCents / 100).toLocaleString("en-IN")} (from ₹${(previousBaseCents / 100).toLocaleString("en-IN")} to ₹${(newBaseCents / 100).toLocaleString("en-IN")}) and logged to increment history.`,
              variant: "success",
            });
          }
        } catch (incErr) {
          console.warn("Failed to auto-log increment entry:", incErr);
        }
      }

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

  // -------------------------------------------------------------
  // SALARY INCREMENTS & AUDIT TRAIL HANDLERS
  // -------------------------------------------------------------
  const currentBaseRupees = parseFloat(formData.base_salary_cents || "0") || 0;

  const fetchIncrements = useCallback(async () => {
    setIsLoadingIncrements(true);
    try {
      const { data, error } = await supabaseClient
        .from("employee_increments")
        .select("*")
        .eq("user_id", user.id)
        .order("effective_date", { ascending: false });
      if (!error && data) {
        setIncrementsList(data);
      }
    } catch (e) {
      console.warn("Failed to fetch employee increments:", e);
    } finally {
      setIsLoadingIncrements(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (isExpanded && activeTab === "salary") {
      fetchIncrements();
    }
  }, [isExpanded, activeTab, fetchIncrements]);

  function openIncrementForm() {
    setIsIncrementsSectionExpanded(true);
    const defaultHike = 2000;
    const newSal = currentBaseRupees + defaultHike;
    setIncLogForm({
      effectiveDate: new Date().toISOString().slice(0, 10),
      incrementAmount: defaultHike.toString(),
      newSalary: newSal.toString(),
      reason: "Performance Appraisal & Salary Hike",
    });
    setIsLoggingIncrement(true);
  }

  function handleHikeChange(val: string) {
    const hike = parseFloat(val) || 0;
    const newSal = currentBaseRupees + hike;
    setIncLogForm((prev) => ({
      ...prev,
      incrementAmount: val,
      newSalary: isNaN(newSal) ? "" : newSal.toString(),
    }));
  }

  function handleNewSalaryChange(val: string) {
    const newSal = parseFloat(val) || 0;
    const hike = newSal - currentBaseRupees;
    setIncLogForm((prev) => ({
      ...prev,
      newSalary: val,
      incrementAmount: isNaN(hike) ? "" : hike.toString(),
    }));
  }

  async function handleLogIncrementRecord() {
    const hike = parseFloat(incLogForm.incrementAmount) || 0;
    const newBase = parseFloat(incLogForm.newSalary) || 0;

    if (newBase <= 0) {
      toast({
        title: "Invalid Salary",
        description: "Please enter a valid new base salary.",
        variant: "error",
      });
      return;
    }

    if (!incLogForm.effectiveDate) {
      toast({
        title: "Date Required",
        description: "Please select an effective date.",
        variant: "error",
      });
      return;
    }

    setIsSubmittingIncrement(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action: "add_increment",
          userId: user.id,
          effectiveDate: incLogForm.effectiveDate,
          incrementAmountCents: Math.round(hike * 100),
          newSalaryCents: Math.round(newBase * 100),
          previousSalaryCents: Math.round(currentBaseRupees * 100),
          reason: incLogForm.reason || "Performance Appraisal",
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to log increment");
      }

      const newPerDay = (newBase / 30).toFixed(2);
      setFormData((prev) => ({
        ...prev,
        base_salary_cents: newBase.toString(),
        per_day_salary_cents: newPerDay,
      }));
      setIsLoggingIncrement(false);
      setSalaryRefreshKey((k) => k + 1);

      await onUpdateFullProfile(user.id, {
        base_salary_cents: Math.round(newBase * 100),
        per_day_salary_cents: Math.round((newBase / 30) * 100),
      });

      await fetchIncrements();

      toast({
        title: "🎉 Salary Increment Applied!",
        description: `Base salary updated to ₹${newBase.toLocaleString("en-IN")} (+₹${hike.toLocaleString("en-IN")} hike) effective ${incLogForm.effectiveDate}.`,
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: "Error saving increment",
        description: e.message || "Failed to save increment record.",
        variant: "error",
      });
    } finally {
      setIsSubmittingIncrement(false);
    }
  }

  async function handleDeleteIncrementRecord(incId: string) {
    if (!confirm("Are you sure you want to remove this salary increment log? Base salary will automatically revert if this was the latest hike.")) return;
    setDeletingIncrementId(incId);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action: "delete_increment",
          incrementId: incId,
          userId: user.id,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete increment");
      }

      toast({
        title: "Increment Record Deleted",
        description: "The increment log has been removed.",
      });

      await fetchIncrements();

      const { data: updatedProf } = await supabaseClient
        .from("profiles")
        .select("base_salary_cents, per_day_salary_cents")
        .eq("id", user.id)
        .single();

      if (updatedProf) {
        setFormData((prev) => ({
          ...prev,
          base_salary_cents: updatedProf.base_salary_cents ? (updatedProf.base_salary_cents / 100).toString() : prev.base_salary_cents,
          per_day_salary_cents: updatedProf.per_day_salary_cents ? (updatedProf.per_day_salary_cents / 100).toString() : prev.per_day_salary_cents,
        }));
        setSalaryRefreshKey((k) => k + 1);
        await onUpdateFullProfile(user.id, updatedProf);
      }
    } catch (e: any) {
      toast({
        title: "Error deleting increment",
        description: e.message || "Failed to delete increment record.",
        variant: "error",
      });
    } finally {
      setDeletingIncrementId(null);
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
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80 px-1.5 py-0.5 rounded-md shrink-0">
                  <Briefcase size={9.5} className="shrink-0 text-amber-600" />
                  <span>Stock Mgr</span>
                </span>
              )}
              {!user.is_admin && !user.is_stock_manager && (
                <span className="inline-flex items-center text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                  Staff
                </span>
              )}

              {/* Previous Month Salary Settlement Status Chip (Shown only when paid) */}
              {!user.is_admin && isPrevMonthPaid && (
                <span
                  title={`Salary for ${prevMonthLabel?.long || "Previous Month"}: Settled & Paid`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/90 px-1.5 py-0.5 rounded-md shrink-0 shadow-2xs"
                >
                  <CheckCircle size={10} className="text-emerald-600 shrink-0" />
                  <span>{prevMonthLabel?.short || "Prev"} Paid</span>
                </span>
              )}

              {/* Blood Group Badge */}
              {user.blood_group && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md shrink-0">
                  <Droplets size={9.5} className="text-rose-600 shrink-0" />
                  <span>{user.blood_group}</span>
                </span>
              )}

              {/* Employee ID Badge */}
              {user.employee_id && (
                <span className="inline-flex items-center text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-md shrink-0">
                  {user.employee_id}
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
              <span>Salary & Increment Journey</span>
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
              <span>Profile, Role & Shifts</span>
            </button>

            <button
              onClick={() => setAchievementsModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors whitespace-nowrap shadow-2xs"
            >
              <Award size={13} className="text-amber-600" />
              <span>🎖️ Badges & Achievements</span>
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

            <Link
              href={`/?previewStaff=${user.id}`}
              target="_blank"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors whitespace-nowrap ml-auto"
            >
              <Eye size={13} className="text-blue-600" />
              <span>Preview Hub</span>
            </Link>
          </div>

          {/* TAB 1: PROFILE & SHIFTS */}
          {activeTab === "profile" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* First Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <User size={11} className="text-blue-600" /> First Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Vasanth"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <User size={11} className="text-blue-600" /> Last Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Kumar"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Aadhaar Card Number */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Shield size={11} className="text-blue-600" /> Aadhaar Card Number
                  </label>
                  <Input
                    type="text"
                    maxLength={14}
                    placeholder="e.g. 1234 5678 9012"
                    value={formData.aadhaar_number}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 12);
                      const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
                      setFormData({ ...formData, aadhaar_number: formatted });
                    }}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500 font-mono tracking-wide"
                  />
                </div>

                {/* Employee ID */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                      <UserPlus size={11} className="text-blue-600" /> Employee ID
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = generateNextEmployeeId(allUsers, "");
                        setFormData({ ...formData, employee_id: nextId });
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Auto-generate next unique employee ID for this store"
                    >
                      <Sparkles size={10} /> Auto-Generate
                    </button>
                  </div>
                  <Input
                    type="text"
                    placeholder="e.g. EMP-001 (Unique per store)"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
                    className={`h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white font-mono ${
                      duplicateEmpUser
                        ? "border-rose-400 focus:border-rose-500 text-rose-700 bg-rose-50/30"
                        : "focus:border-blue-500"
                    }`}
                  />
                  {duplicateEmpUser && (
                    <div className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                      <AlertCircle size={12} className="shrink-0" />
                      <span>
                        Already in use by{" "}
                        <strong className="font-semibold">
                          {duplicateEmpUser.first_name || duplicateEmpUser.full_name || duplicateEmpUser.email}
                        </strong>{" "}
                        in this store.
                      </span>
                    </div>
                  )}
                </div>

                {/* Designation / Role */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Briefcase size={11} className="text-blue-600" /> Role / Designation
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Senior Barista & Shift Lead"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Building2 size={11} className="text-blue-600" /> Department
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Beverage & Operations"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Date of Joining */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar size={11} className="text-blue-600" /> Date of Joining
                  </label>
                  <Input
                    type="date"
                    value={formData.date_of_joining}
                    onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-400">Used to calculate milestones & service tenure</span>
                </div>

                {/* Joining Salary */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard size={11} className="text-blue-600" /> Joining Salary (₹ / mo)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 15000"
                    value={formData.joining_salary_cents}
                    onChange={(e) => setFormData({ ...formData, joining_salary_cents: e.target.value })}
                    className="h-9.5 text-sm bg-zinc-50/50 border-zinc-200 focus:bg-white focus:border-blue-500"
                  />
                </div>

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
                    <CreditCard size={11} className="text-blue-600" /> Current Base Salary (₹ / mo)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 21000"
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
                  {/* Live Increment Detection Banner */}
                  {(() => {
                    const typedNum = parseFloat(formData.base_salary_cents || "0") * 100;
                    const prevNum = user.base_salary_cents || 0;
                    if (prevNum > 0 && typedNum > prevNum) {
                      const diffRupees = (typedNum - prevNum) / 100;
                      return (
                        <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-start gap-1.5 animate-in fade-in">
                          <TrendingUp size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                          <span>
                            <strong>Increment detected (+₹{diffRupees.toLocaleString("en-IN")}):</strong> Increasing from previous ₹{(prevNum / 100).toLocaleString("en-IN")} to ₹{(typedNum / 100).toLocaleString("en-IN")}. Saving will automatically record this to the employee's increment history!
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Per-Day Salary Rate */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard size={11} className="text-blue-600" /> Per-Day Rate (₹ / day)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 700"
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

                {/* Blood Group */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Droplets size={11} className="text-rose-600" /> Blood Group
                  </label>
                  <select
                    value={formData.blood_group}
                    onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                    className="w-full h-9.5 text-sm bg-zinc-50/50 border border-zinc-200 rounded-lg px-3 focus:bg-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select Blood Group</option>
                    <option value="A+">A Positive (A+)</option>
                    <option value="A-">A Negative (A-)</option>
                    <option value="B+">B Positive (B+)</option>
                    <option value="B-">B Negative (B-)</option>
                    <option value="AB+">AB Positive (AB+)</option>
                    <option value="AB-">AB Negative (AB-)</option>
                    <option value="O+">O Positive (O+)</option>
                    <option value="O-">O Negative (O-)</option>
                  </select>
                </div>
              </div>

              {/* Save Button Bar */}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                <span className="text-[11px] text-zinc-400 hidden sm:inline">
                  All updates reflect immediately on the employee's personal hub.
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
            <div className="animate-in fade-in duration-150 pt-1 space-y-4">
              {/* MANUAL SALARY INCREMENTS & AUDIT TRAIL */}
              <div className="bg-gradient-to-r from-blue-50/70 via-white to-blue-50/40 rounded-xl border border-blue-200 overflow-hidden shadow-2xs transition-all">
                {/* Header (Accordion Toggle Bar) */}
                <div
                  onClick={() => setIsIncrementsSectionExpanded(!isIncrementsSectionExpanded)}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 cursor-pointer hover:bg-blue-50/50 transition-colors select-none",
                    isIncrementsSectionExpanded && "border-b border-blue-100"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                      <TrendingUp size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-blue-950 truncate">
                          Salary Increments & Hike History
                        </span>
                        <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full shrink-0">
                          {incrementsList.length} {incrementsList.length === 1 ? "Hike Logged" : "Hikes Logged"}
                        </span>
                        {!isIncrementsSectionExpanded && (
                          <span className="text-[11px] font-medium text-zinc-500 bg-white/80 border border-blue-100 px-2 py-0.5 rounded-full shrink-0">
                            Current: ₹{currentBaseRupees.toLocaleString("en-IN")}/mo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Manually log appraisal increments with dates & notes. Automatically updates current Base Salary & daily rate.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isIncrementsSectionExpanded) {
                          openIncrementForm();
                        } else if (isLoggingIncrement) {
                          setIsLoggingIncrement(false);
                        } else {
                          openIncrementForm();
                        }
                      }}
                      className={cn(
                        "font-semibold text-xs h-8 gap-1.5 shadow-2xs transition-all",
                        isLoggingIncrement && isIncrementsSectionExpanded
                          ? "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      )}
                    >
                      {isLoggingIncrement && isIncrementsSectionExpanded ? (
                        <>
                          <X size={13} />
                          <span>Close Form</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          <span>Give Salary Increment</span>
                        </>
                      )}
                    </Button>

                    <div
                      className="p-1 rounded-lg text-blue-700 hover:bg-blue-100/60 transition-colors"
                      title={isIncrementsSectionExpanded ? "Collapse History" : "Expand History"}
                    >
                      {isIncrementsSectionExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Collapsible Body */}
                {isIncrementsSectionExpanded && (
                  <div className="p-3.5 sm:p-4 space-y-4 animate-in fade-in duration-150">

                {/* Metric Overview Strip */}
                {(() => {
                  const joiningSalaryRupees = formData.joining_salary_cents
                    ? parseFloat(formData.joining_salary_cents) || 0
                    : user.joining_salary_cents
                    ? user.joining_salary_cents / 100
                    : currentBaseRupees;

                  const totalGrowthRupees = currentBaseRupees > joiningSalaryRupees ? currentBaseRupees - joiningSalaryRupees : 0;
                  const growthPercent = joiningSalaryRupees > 0 && totalGrowthRupees > 0
                    ? Math.round((totalGrowthRupees / joiningSalaryRupees) * 100)
                    : 0;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-white rounded-lg p-2.5 border border-blue-100/80 shadow-2xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Current Base Salary</div>
                        <div className="text-sm font-bold text-zinc-900 mt-0.5">
                          ₹{currentBaseRupees.toLocaleString("en-IN")}
                          <span className="text-[10px] font-normal text-zinc-500 ml-1">/ mo</span>
                        </div>
                        <div className="text-[10px] text-zinc-400">₹{(currentBaseRupees / 30).toFixed(0)} / day</div>
                      </div>

                      <div className="bg-white rounded-lg p-2.5 border border-blue-100/80 shadow-2xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Starting / Joining</div>
                        <div className="text-sm font-bold text-zinc-900 mt-0.5">
                          ₹{joiningSalaryRupees.toLocaleString("en-IN")}
                          <span className="text-[10px] font-normal text-zinc-500 ml-1">/ mo</span>
                        </div>
                        <div className="text-[10px] text-zinc-400">Initial start rate</div>
                      </div>

                      <div className="bg-white rounded-lg p-2.5 border border-emerald-100/80 shadow-2xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Total Career Hike</div>
                        <div className="text-sm font-bold text-emerald-700 mt-0.5">
                          {totalGrowthRupees > 0 ? `+₹${totalGrowthRupees.toLocaleString("en-IN")}` : "₹0"}
                        </div>
                        <div className="text-[10px] text-emerald-600">
                          {growthPercent > 0 ? `+${growthPercent}% overall growth` : "No hikes yet"}
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-2.5 border border-blue-100/80 shadow-2xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Audit Logs</div>
                        <div className="text-sm font-bold text-zinc-900 mt-0.5 flex items-center gap-1.5">
                          <History size={14} className="text-blue-600" />
                          <span>{incrementsList.length} Recorded</span>
                        </div>
                        <div className="text-[10px] text-zinc-400">Audit history active</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Increment Entry Form (Animated Panel) */}
                {isLoggingIncrement && (
                  <div className="bg-white rounded-xl border-2 border-blue-300 p-4 space-y-3.5 shadow-sm animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                        <Sparkles size={14} className="text-blue-600" />
                        <span>Enter Salary Increment Details</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Current: <strong>₹{currentBaseRupees.toLocaleString("en-IN")} / mo</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700">Effective Date</label>
                        <Input
                          type="date"
                          value={incLogForm.effectiveDate}
                          onChange={(e) => setIncLogForm({ ...incLogForm, effectiveDate: e.target.value })}
                          className="h-9 text-xs bg-zinc-50/50"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700">Increment Hike (₹)</label>
                        <Input
                          type="number"
                          placeholder="e.g. 2500"
                          value={incLogForm.incrementAmount}
                          onChange={(e) => handleHikeChange(e.target.value)}
                          className="h-9 text-xs font-semibold text-emerald-700 bg-zinc-50/50"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700 flex items-center justify-between">
                          <span>New Base Salary (₹)</span>
                          {(() => {
                            const hikeNum = parseFloat(incLogForm.incrementAmount) || 0;
                            const pct = currentBaseRupees > 0 && hikeNum > 0
                              ? ((hikeNum / currentBaseRupees) * 100).toFixed(1)
                              : null;
                            return pct ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded">
                                +{pct}%
                              </span>
                            ) : null;
                          })()}
                        </label>
                        <Input
                          type="number"
                          placeholder="e.g. 27500"
                          value={incLogForm.newSalary}
                          onChange={(e) => handleNewSalaryChange(e.target.value)}
                          className="h-9 text-xs font-bold text-blue-900 bg-zinc-50/50"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700">Reason / Appraisal Note</label>
                        <Input
                          type="text"
                          placeholder="e.g. Annual Appraisal / Promotion"
                          value={incLogForm.reason}
                          onChange={(e) => setIncLogForm({ ...incLogForm, reason: e.target.value })}
                          className="h-9 text-xs bg-zinc-50/50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                      <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                        <ArrowRight size={12} className="text-blue-500 shrink-0" />
                        <span>
                          Salary updates from <strong>₹{currentBaseRupees.toLocaleString("en-IN")}</strong> to{" "}
                          <strong className="text-blue-700">
                            ₹{(parseFloat(incLogForm.newSalary) || 0).toLocaleString("en-IN")}
                          </strong>{" "}
                          (₹{((parseFloat(incLogForm.newSalary) || 0) / 30).toFixed(0)}/day)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsLoggingIncrement(false)}
                          className="text-xs h-8"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={isSubmittingIncrement}
                          onClick={handleLogIncrementRecord}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 gap-1.5 shadow-2xs"
                        >
                          <Save size={13} />
                          <span>{isSubmittingIncrement ? "Saving & Updating..." : "Save & Apply Increment"}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Increment History Log Table */}
                <div className="bg-white rounded-xl border border-zinc-200/90 overflow-hidden shadow-2xs">
                  <div className="px-3.5 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History size={14} className="text-zinc-500" />
                      <span className="text-xs font-bold text-zinc-800">Increment Audit Trail & Past Logs</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      Chronological order (latest first)
                    </span>
                  </div>

                  {isLoadingIncrements ? (
                    <div className="py-6 text-center text-xs text-zinc-400">Loading increments history...</div>
                  ) : incrementsList.length === 0 ? (
                    <div className="py-7 px-4 text-center">
                      <TrendingUp size={28} className="mx-auto text-zinc-300 mb-2" />
                      <p className="text-xs font-semibold text-zinc-700">No salary increment logs recorded yet</p>
                      <p className="text-[11px] text-zinc-400 mt-1 max-w-md mx-auto">
                        Instead of manually editing base salary, click <strong>"Give Salary Increment"</strong> above to record hikes with dates and appraisal reasons for complete tracking.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            <th className="px-3.5 py-2">Effective Date</th>
                            <th className="px-3.5 py-2">Hike Amount</th>
                            <th className="px-3.5 py-2">Salary Transition</th>
                            <th className="px-3.5 py-2">Reason / Remarks</th>
                            <th className="px-3.5 py-2">Approved By</th>
                            <th className="px-3.5 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {incrementsList.map((inc) => {
                            const hikeRupees = (inc.increment_amount_cents || 0) / 100;
                            const prevRupees = (inc.previous_salary_cents || 0) / 100;
                            const newRupees = (inc.new_salary_cents || 0) / 100;
                            const pct = prevRupees > 0 ? ((hikeRupees / prevRupees) * 100).toFixed(1) : null;

                            return (
                              <tr key={inc.id} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-3.5 py-2.5 font-medium text-zinc-800 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar size={12} className="text-zinc-400" />
                                    <span>
                                      {new Date(inc.effective_date).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                </td>

                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md text-[11px]">
                                    +₹{hikeRupees.toLocaleString("en-IN")}
                                    {pct && <span className="text-[10px] font-normal text-emerald-600">({pct}%)</span>}
                                  </span>
                                </td>

                                <td className="px-3.5 py-2.5 whitespace-nowrap text-zinc-600">
                                  <div className="flex items-center gap-1 font-medium">
                                    <span>₹{prevRupees.toLocaleString("en-IN")}</span>
                                    <ArrowRight size={11} className="text-zinc-400" />
                                    <span className="font-bold text-zinc-900">₹{newRupees.toLocaleString("en-IN")}</span>
                                  </div>
                                </td>

                                <td className="px-3.5 py-2.5 text-zinc-700">
                                  <span className="line-clamp-1">{inc.reason || "Appraisal Increment"}</span>
                                </td>

                                <td className="px-3.5 py-2.5 text-zinc-400 text-[11px] whitespace-nowrap">
                                  {inc.approved_by || "Admin"}
                                </td>

                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={deletingIncrementId === inc.id}
                                    onClick={() => handleDeleteIncrementRecord(inc.id)}
                                    className="h-7 w-7 p-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50"
                                    title="Delete increment log"
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

              <SalaryManager
                key={salaryRefreshKey}
                userId={user.id}
                userEmail={user.email}
                contactNumber={formData.contact_number || user.contact_number}
                perDaySalary={parseFloat(formData.per_day_salary_cents || "0") * 100}
                onDownloadPayslip={onDownloadPayslip}
                onUpdateContactNumber={async (newPhone: string) => {
                  setFormData((prev) => ({ ...prev, contact_number: newPhone }));
                  await onUpdateFullProfile(user.id, { contact_number: newPhone });
                }}
                onSettlementChange={onSettlementChange}
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

      {/* Employee Achievements Modal */}
      <EmployeeAchievementsModal
        open={achievementsModalOpen}
        onClose={() => setAchievementsModalOpen(false)}
        userId={user.id}
        userEmail={user.email}
        userName={formData.full_name || user.email}
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

  // Previous Month Settlement State: Track settled status per user
  const [settledMap, setSettledMap] = useState<Record<string, boolean>>({});

  const prevMonthInfo = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const monthNum = String(d.getMonth() + 1).padStart(2, "0");
    const monthKey = `${year}-${monthNum}`;
    const short = d.toLocaleString("en-US", { month: "short" });
    const long = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    return { monthKey, short, long };
  }, []);

  const isAdminUser = (u: Profile) => !!u.is_admin || u.email?.toLowerCase().startsWith("admin") || u.email?.toLowerCase().includes("admin@");

  useEffect(() => {
    let isCancelled = false;

    async function loadPrevMonthSettlements() {
      const staffIds = users
        .filter((u) => !isAdminUser(u))
        .map((u) => u.id);

      if (staffIds.length === 0) return;

      const { data, error } = await supabaseClient
        .from("salary_settlements")
        .select("user_id, is_settled")
        .in("user_id", staffIds)
        .eq("month_key", prevMonthInfo.monthKey);

      if (!isCancelled && !error && data) {
        const map: Record<string, boolean> = {};
        data.forEach((row: any) => {
          if (row.is_settled) {
            map[row.user_id] = true;
          }
        });
        setSettledMap(map);
      }
    }

    loadPrevMonthSettlements();

    return () => {
      isCancelled = true;
    };
  }, [users, prevMonthInfo.monthKey]);

  function handleSettlementChange(userId: string, monthKey: string, isSettled: boolean) {
    if (monthKey === prevMonthInfo.monthKey) {
      setSettledMap((prev) => ({
        ...prev,
        [userId]: isSettled,
      }));
    }
  }

  const policy = validatePasswordPolicy(password, isAdminRole ? "admin" : "staff");

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
              allUsers={users}
              isExpanded={expandedUserId === u.id}
              onToggle={() => handleToggleExpand(u.id)}
              onRemoveUser={onRemoveUser}
              onUpdatePass={onUpdatePass}
              onToggleStockManager={onToggleStockManager}
              onUpdateFullProfile={onUpdateFullProfile}
              onDownloadPayslip={onDownloadPayslip}
              isPrevMonthPaid={!!settledMap[u.id]}
              prevMonthLabel={{ short: prevMonthInfo.short, long: prevMonthInfo.long }}
              onSettlementChange={(monthKey, isSettled) => handleSettlementChange(u.id, monthKey, isSettled)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
