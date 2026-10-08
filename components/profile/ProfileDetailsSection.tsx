"use client";

import { useState } from "react";
import {
  User,
  Shield,
  Briefcase,
  Calendar,
  Clock,
  CreditCard,
  Phone,
  Heart,
  Mail,
  Copy,
  Eye,
  EyeOff,
  Droplets,
  Building2,
  TrendingUp,
  Lock,
  CheckCircle2,
  PhoneCall,
  Save,
  Loader2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Award,
  Sparkles
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { supabaseClient } from "@/lib/supabaseClient";
import { ChangePasswordCard } from "@/components/profile/ChangePasswordCard";
import Link from "next/link";

export type UserProfileData = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  aadhaar_number?: string | null;
  blood_group?: string | null;
  employee_id?: string | null;
  designation?: string | null;
  department?: string | null;
  date_of_joining?: string | null;
  joining_salary_cents?: number | null;
  base_salary_cents?: number | null;
  per_day_salary_cents?: number | null;
  fixed_allowance_cents?: number | null;
  increment_amount_cents?: number | null;
  increment_frequency_months?: number | null;
  next_increment_date?: string | null;
  increment_policy_note?: string | null;
  in_time?: string | null;
  dob?: string | null;
  age?: number | null;
  contact_number?: string | null;
  emergency_contact_number?: string | null;
  is_admin?: boolean | null;
  is_stock_manager?: boolean | null;
  is_super_admin?: boolean | null;
  business_id?: string | null;
};

interface ProfileDetailsSectionProps {
  profile: UserProfileData;
  onProfileUpdated?: (updated: Partial<UserProfileData>) => void;
}

export function ProfileDetailsSection({ profile, onProfileUpdated }: ProfileDetailsSectionProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"identity" | "job" | "compensation" | "contact" | "security">("identity");
  
  // Aadhaar reveal toggle
  const [showAadhaar, setShowAadhaar] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Self-service editable contact fields
  const [phoneInput, setPhoneInput] = useState(profile.contact_number || "");
  const [emergencyInput, setEmergencyInput] = useState(profile.emergency_contact_number || "");
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Formatting helpers
  const firstName = profile.first_name || (profile.full_name ? profile.full_name.split(" ")[0] : "");
  const lastName = profile.last_name || (profile.full_name ? profile.full_name.split(" ").slice(1).join(" ") : "");
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || profile.full_name || profile.email.split("@")[0];

  function copyToClipboard(text: string, fieldName: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast({
      title: "Copied to clipboard",
      description: `${fieldName} copied successfully.`,
      variant: "success",
    });
    setTimeout(() => setCopiedField(null), 2500);
  }

  function formatAadhaarDisplay(val?: string | null) {
    if (!val) return "Not Registered";
    const cleaned = val.replace(/\D/g, "");
    if (cleaned.length === 0) return "Not Registered";
    if (!showAadhaar) {
      if (cleaned.length < 4) return "•••• •••• ••••";
      return `•••• •••• ${cleaned.slice(-4)}`;
    }
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(" ") : cleaned;
  }

  function formatCurrency(cents?: number | null) {
    if (cents === null || cents === undefined || isNaN(cents)) return "₹ 0";
    const rupees = cents / 100;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(rupees);
  }

  function formatTime(val?: string | null) {
    if (!val) return "Not Assigned";
    if (/am|pm/i.test(val)) return val;
    const parts = val.split(":");
    if (parts.length < 2) return val;
    const h = parseInt(parts[0], 10);
    if (isNaN(h)) return val;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${parts[1]} ${ampm}`;
  }

  function calculateTenure(doj?: string | null): string {
    if (!doj) return "Not set";
    const start = new Date(doj);
    if (isNaN(start.getTime())) return "Not set";
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years === 0 && months === 0) {
      const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return `${Math.max(1, diffDays)} day${diffDays === 1 ? "" : "s"}`;
    }
    const out: string[] = [];
    if (years > 0) out.push(`${years} yr${years === 1 ? "" : "s"}`);
    if (months > 0) out.push(`${months} mo${months === 1 ? "" : "s"}`);
    return out.join(" ");
  }

  function formatDate(dStr?: string | null) {
    if (!dStr) return "Not set";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingContact(true);
    try {
      const { error } = await supabaseClient
        .from("profiles")
        .update({
          contact_number: phoneInput.trim() || null,
          emergency_contact_number: emergencyInput.trim() || null,
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Contact Info Saved",
        description: "Your primary and emergency contact numbers have been updated.",
        variant: "success",
      });

      if (onProfileUpdated) {
        onProfileUpdated({
          contact_number: phoneInput.trim() || null,
          emergency_contact_number: emergencyInput.trim() || null,
        });
      }
    } catch (err: any) {
      toast({
        title: "Could not update contact numbers",
        description: err?.message || "Please check network or contact your administrator.",
        variant: "error",
      });
    } finally {
      setIsSavingContact(false);
    }
  }

  return (
    <div className="w-full">
      {/* Tab Navigation Bar - Smooth Horizontal Scrolling on Mobile */}
      <div className="bg-slate-50/80 border-b border-[#E2E8F0] px-3 sm:px-6 pt-2.5 sm:pt-3">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none pb-2.5 sm:pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("identity")}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === "identity"
                ? "bg-[#2563EB] text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <User size={14} className="shrink-0" />
            <span>Identity & Personal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("job")}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === "job"
                ? "bg-[#2563EB] text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Briefcase size={14} className="shrink-0" />
            <span>Job & Workplace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("compensation")}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === "compensation"
                ? "bg-[#2563EB] text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <CreditCard size={14} className="shrink-0" />
            <span>Salary & Payroll</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contact")}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === "contact"
                ? "bg-[#2563EB] text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Phone size={14} className="shrink-0" />
            <span>Contact & Emergency</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === "security"
                ? "bg-[#2563EB] text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Lock size={14} className="shrink-0" />
            <span>Security & Password</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6">

        {/* ========================================================================= */}
        {/* TAB 1: IDENTITY & PERSONAL DETAILS                                       */}
        {/* ========================================================================= */}
        {activeTab === "identity" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
            {/* Identity Card Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">

              {/* Full Name & Names Breakdown */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <User size={13} className="text-[#2563EB] shrink-0" /> Employee Name
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap shrink-0">
                    Primary Profile
                  </span>
                </div>

                <div>
                  <div className="text-base sm:text-lg font-bold text-[#0F172A] break-words">{fullName}</div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1">
                    <span className="whitespace-nowrap">
                      <strong className="text-slate-700">First:</strong> {profile.first_name || firstName || "—"}
                    </span>
                    <span className="whitespace-nowrap">
                      <strong className="text-slate-700">Last:</strong> {profile.last_name || lastName || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Employee ID Card - Mobile Unwrapped */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Award size={13} className="text-[#2563EB] shrink-0" /> Employee ID
                  </span>
                  {profile.employee_id && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(profile.employee_id!, "Employee ID")}
                      className="text-[11px] font-medium text-[#2563EB] hover:text-blue-800 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy size={12} className="shrink-0" />
                      <span className="whitespace-nowrap">{copiedField === "Employee ID" ? "Copied!" : "Copy"}</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <span className="inline-flex items-center self-start px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-sm sm:text-base font-extrabold text-[#2563EB] tracking-wide whitespace-nowrap shrink-0">
                    {profile.employee_id || "EMP-PENDING"}
                  </span>
                  <span className="text-xs text-slate-500 leading-tight">
                    Official organization identifier
                  </span>
                </div>
              </div>

              {/* Aadhaar Card Number (Govt Identity) */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 sm:p-5 rounded-2xl shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between gap-2 relative z-10">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-300 whitespace-nowrap">
                      Aadhaar Card
                    </span>
                    <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                      Verified ID
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAadhaar(!showAadhaar)}
                      className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title={showAadhaar ? "Hide Aadhaar" : "Reveal Aadhaar"}
                    >
                      {showAadhaar ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    {profile.aadhaar_number && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(profile.aadhaar_number!, "Aadhaar Number")}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Copy Aadhaar"
                      >
                        <Copy size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-1 relative z-10">
                  <div className="font-mono text-lg sm:text-2xl font-bold tracking-wider sm:tracking-widest text-white whitespace-nowrap overflow-x-auto scrollbar-none">
                    {formatAadhaarDisplay(profile.aadhaar_number)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 gap-2">
                    <span className="truncate">Identity Proof (12-Digit UID)</span>
                    <span className="text-slate-400 whitespace-nowrap shrink-0">Confidential</span>
                  </div>
                </div>
              </div>

              {/* Blood Group Card (Medical Info) - Unwrapped on mobile */}
              <div className="bg-gradient-to-br from-rose-50 to-red-50/50 p-4 sm:p-5 rounded-2xl border border-rose-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <Droplets size={14} className="text-rose-600 fill-rose-600 shrink-0" /> Blood Group
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200 whitespace-nowrap shrink-0">
                    Medical Info
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-lg sm:text-xl shadow-xs shrink-0 whitespace-nowrap">
                    {profile.blood_group || "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-rose-950 whitespace-nowrap">
                        {profile.blood_group || "Not Set"}
                      </span>
                      {profile.blood_group && (
                        <span className="text-[10px] font-bold bg-rose-200/70 text-rose-800 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
                          Confirmed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-rose-700/80 mt-0.5 leading-tight">
                      Workplace medical & safety response
                    </div>
                  </div>
                </div>
              </div>

              {/* Date of Birth & Age */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar size={13} className="text-[#2563EB] shrink-0" /> Date of Birth & Age
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Date of Birth</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#0F172A] whitespace-nowrap">
                      {profile.dob ? formatDate(profile.dob) : "Not recorded"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Current Age</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#0F172A] whitespace-nowrap">
                      {profile.age ? `${profile.age} years old` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Official Login Email */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Mail size={13} className="text-[#2563EB] shrink-0" /> Registered Work Email
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.email, "Email")}
                    className="text-[11px] font-medium text-[#2563EB] hover:text-blue-800 flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Copy size={12} className="shrink-0" />
                    <span className="whitespace-nowrap">{copiedField === "Email" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>

                <div className="pt-1">
                  <div className="text-xs sm:text-base font-semibold text-[#0F172A] truncate">
                    {profile.email}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-tight">
                    Used for application login and system communications.
                  </div>
                </div>
              </div>

            </div>

            {/* HR Notice Banner */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <Lock size={15} className="text-slate-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                <strong>HR Record Policy:</strong> Identity, Aadhaar, and legal employee records are managed by the administrator. If you notice any error in your official name, Aadhaar, or blood group, please reach out to your HR or Store Administrator.
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: JOB & WORKPLACE DETAILS                                           */}
        {/* ========================================================================= */}
        {activeTab === "job" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">

              {/* Designation / Role */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Briefcase size={13} className="text-[#2563EB] shrink-0" /> Official Designation
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 whitespace-nowrap shrink-0">
                    Assigned Role
                  </span>
                </div>

                <div>
                  <div className="text-base sm:text-lg font-bold text-[#0F172A]">
                    {profile.designation || "Staff Member"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    System Role:{" "}
                    <span className="font-semibold text-slate-800">
                      {profile.is_super_admin
                        ? "Super Administrator"
                        : profile.is_admin
                        ? "Store Administrator"
                        : profile.is_stock_manager
                        ? "Stock Manager"
                        : "Team Member"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Department */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Building2 size={13} className="text-[#2563EB] shrink-0" /> Department / Unit
                  </span>
                </div>

                <div>
                  <div className="text-base sm:text-lg font-bold text-[#0F172A]">
                    {profile.department || "Operations & Field"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 leading-tight">
                    Assigned business unit within SeyalPro network.
                  </div>
                </div>
              </div>

              {/* Date of Joining & Tenure */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar size={13} className="text-[#2563EB] shrink-0" /> Date of Joining & Tenure
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Joining Date</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#0F172A] whitespace-nowrap">
                      {profile.date_of_joining ? formatDate(profile.date_of_joining) : "Not recorded"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Service Tenure</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold whitespace-nowrap">
                      {calculateTenure(profile.date_of_joining)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shift Reporting In-Time */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Clock size={13} className="text-[#2563EB] shrink-0" /> Shift Reporting Time
                  </span>
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                    Daily Schedule
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-bold text-[#0F172A] whitespace-nowrap">
                      {formatTime(profile.in_time)}
                    </div>
                    <div className="text-xs text-slate-500 leading-tight">
                      Standard daily check-in requirement.
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Quick Link to Timesheet / Employee Hub */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#2563EB] shrink-0" /> Employee Hub & Attendance
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-tight">
                  View daily clock-ins, breaks, monthly attendance calendars, and achievement records.
                </p>
              </div>

              <Link
                href="/employee-hub"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
              >
                <span>Open Employee Hub</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SALARY & COMPENSATION BREAKDOWN                                   */}
        {/* ========================================================================= */}
        {activeTab === "compensation" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
            {/* Main Package Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

              {/* Monthly Base Salary */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <CreditCard size={13} className="text-[#2563EB] shrink-0" /> Base Salary (Monthly)
                </span>
                <div className="text-xl sm:text-2xl font-black text-[#0F172A] whitespace-nowrap">
                  {formatCurrency(profile.base_salary_cents)}
                </div>
                <div className="text-xs text-slate-500 leading-tight">
                  Calculated base payout per billing cycle.
                </div>
              </div>

              {/* Per-Day Salary Rate */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <TrendingUp size={13} className="text-emerald-600 shrink-0" /> Daily Rate (Per Day)
                </span>
                <div className="text-xl sm:text-2xl font-black text-emerald-700 whitespace-nowrap">
                  {formatCurrency(profile.per_day_salary_cents)}
                </div>
                <div className="text-xs text-slate-500 leading-tight">
                  Applicable wage per approved working day.
                </div>
              </div>

              {/* Fixed Allowances */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <Award size={13} className="text-purple-600 shrink-0" /> Monthly Allowance
                </span>
                <div className="text-xl sm:text-2xl font-black text-purple-700 whitespace-nowrap">
                  {formatCurrency(profile.fixed_allowance_cents)}
                </div>
                <div className="text-xs text-slate-500 leading-tight">
                  Fixed travel, food, or operational allowances.
                </div>
              </div>

              {/* Starting / Joining Salary */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar size={13} className="text-slate-500 shrink-0" /> Starting Joining Salary
                </span>
                <div className="text-lg sm:text-xl font-bold text-slate-800 whitespace-nowrap">
                  {profile.joining_salary_cents ? formatCurrency(profile.joining_salary_cents) : "Not recorded"}
                </div>
                <div className="text-xs text-slate-400 leading-tight">
                  Initial remuneration at time of joining.
                </div>
              </div>

              {/* Increment Plan & Policy */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2 sm:col-span-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                  <TrendingUp size={13} className="text-blue-600 shrink-0" /> Increment & Appraisal Details
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Scheduled Increment</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-800">
                      {profile.increment_amount_cents
                        ? `${formatCurrency(profile.increment_amount_cents)} every ${profile.increment_frequency_months || 12} mos`
                        : "As per company review policy"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Next Appraisal Date</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
                      {profile.next_increment_date ? formatDate(profile.next_increment_date) : "Annually / Scheduled"}
                    </span>
                  </div>
                </div>

                {profile.increment_policy_note && (
                  <div className="mt-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-600">
                    <strong className="text-slate-800">Note: </strong>
                    {profile.increment_policy_note}
                  </div>
                )}
              </div>

            </div>

            {/* Link to Timesheet Payslips */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  Official monthly payslips are issued and downloadable directly from the Timesheet section.
                </span>
              </div>
              <Link
                href="/timesheet"
                className="text-xs font-semibold text-[#2563EB] hover:text-blue-800 flex items-center gap-1 shrink-0"
              >
                <span>View Timesheet</span>
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CONTACT & EMERGENCY DETAILS (WITH SELF-SERVICE SAVE)               */}
        {/* ========================================================================= */}
        {activeTab === "contact" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
            {/* Quick Dial Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

              {/* Primary Mobile */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Phone size={13} className="text-[#2563EB] shrink-0" /> Primary Mobile Number
                  </span>
                  {profile.contact_number && (
                    <a
                      href={`tel:${profile.contact_number}`}
                      className="text-[11px] font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors shrink-0"
                    >
                      <PhoneCall size={12} /> Call
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-base sm:text-lg font-bold text-[#0F172A] truncate">
                    {profile.contact_number || "Not Registered"}
                  </div>
                  {profile.contact_number && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(profile.contact_number!, "Primary Contact")}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-md shrink-0 cursor-pointer"
                      title="Copy Number"
                    >
                      <Copy size={15} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-400 leading-tight">
                  Primary number for dispatch notices, OTPs, and work alerts.
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="bg-rose-50/60 p-4 sm:p-5 rounded-2xl border border-rose-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <Heart size={14} className="text-rose-600 fill-rose-600 shrink-0" /> Emergency SOS Contact
                  </span>
                  {profile.emergency_contact_number && (
                    <a
                      href={`tel:${profile.emergency_contact_number}`}
                      className="text-[11px] font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-lg border border-rose-300 flex items-center gap-1 transition-colors shrink-0"
                    >
                      <PhoneCall size={12} /> Emergency Call
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-base sm:text-lg font-bold text-rose-950 truncate">
                    {profile.emergency_contact_number || "Not Configured"}
                  </div>
                  {profile.emergency_contact_number && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(profile.emergency_contact_number!, "Emergency Contact")}
                      className="text-rose-500 hover:text-rose-700 p-1 rounded-md shrink-0 cursor-pointer"
                      title="Copy Emergency Number"
                    >
                      <Copy size={15} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-rose-800/80 leading-tight">
                  Designated guardian or doctor in case of workplace emergencies.
                </div>
              </div>

            </div>

            {/* Self-Service Update Form */}
            <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Save size={16} className="text-[#2563EB] shrink-0" /> Update Your Contact Numbers
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                  You can update your personal mobile number and emergency guardian contact number anytime.
                </p>
              </div>

              <form onSubmit={handleSaveContact} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Phone size={13} className="text-slate-500 shrink-0" /> Primary Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] shadow-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Heart size={13} className="text-rose-500 shrink-0" /> Emergency SOS Contact
                    </label>
                    <input
                      type="tel"
                      value={emergencyInput}
                      onChange={(e) => setEmergencyInput(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSavingContact}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingContact ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save size={15} />
                        <span>Save Contact Numbers</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: SECURITY & CREDENTIALS                                            */}
        {/* ========================================================================= */}
        {activeTab === "security" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
            {/* Embedded Change Password Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <ChangePasswordCard />
            </div>

            {/* Security Best Practices */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-600 shrink-0" /> Account Security Guidelines
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1 leading-relaxed">
                <li>Never share your account credentials or attendance PIN with others.</li>
                <li>Your session is automatically guarded with encrypted SSL cookies.</li>
                <li>If you notice any unauthorized access, reset your password immediately and contact your admin.</li>
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
