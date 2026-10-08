"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ProfileDetailsSection, UserProfileData } from "@/components/profile/ProfileDetailsSection";
import { ChevronLeft, Loader2, Sparkles, UserCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // 1. Try full profile query including new employee columns
        const { data: prof, error } = await supabaseClient
          .from("profiles")
          .select(
            "id, email, first_name, last_name, full_name, aadhaar_number, blood_group, employee_id, designation, department, date_of_joining, joining_salary_cents, base_salary_cents, per_day_salary_cents, fixed_allowance_cents, increment_amount_cents, increment_frequency_months, next_increment_date, increment_policy_note, in_time, dob, age, contact_number, emergency_contact_number, is_admin, is_stock_manager, is_super_admin, business_id"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("Full profile query failed, using safe fallback:", error.message);
          // Safe fallback for unmigrated databases
          const { data: fallbackProf } = await supabaseClient
            .from("profiles")
            .select(
              "id, email, full_name, in_time, base_salary_cents, per_day_salary_cents, fixed_allowance_cents, age, dob, contact_number, emergency_contact_number, is_admin, is_stock_manager"
            )
            .eq("id", user.id)
            .maybeSingle();

          if (fallbackProf) {
            setProfile({
              id: user.id,
              email: user.email || "",
              full_name: fallbackProf.full_name,
              in_time: fallbackProf.in_time,
              base_salary_cents: fallbackProf.base_salary_cents,
              per_day_salary_cents: fallbackProf.per_day_salary_cents,
              fixed_allowance_cents: fallbackProf.fixed_allowance_cents,
              age: fallbackProf.age,
              dob: fallbackProf.dob,
              contact_number: fallbackProf.contact_number,
              emergency_contact_number: fallbackProf.emergency_contact_number,
              is_admin: fallbackProf.is_admin,
              is_stock_manager: fallbackProf.is_stock_manager,
            });
          } else {
            setProfile({
              id: user.id,
              email: user.email || "",
            });
          }
        } else if (prof) {
          setProfile({
            ...prof,
            email: prof.email || user.email || "",
          });
        } else {
          setProfile({
            id: user.id,
            email: user.email || "",
          });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, []);

  function handleProfileUpdated(updated: Partial<UserProfileData>) {
    setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 gap-3 px-4">
        <Loader2 className="animate-spin text-[#2563EB]" size={32} />
        <span className="text-sm font-medium text-center">Loading your profile & settings...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <UserCheck size={24} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Session Not Found</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          Please sign in to your account to review your profile and employment details.
        </p>
        <Link
          href="/login"
          className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold"
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20 sm:pb-24">
      {/* Top Breadcrumb & Status Navigation - Fully Responsive */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2">
          {/* Breadcrumb Section with Ellipsis Protection */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-[#2563EB] flex items-center gap-0.5 sm:gap-1 transition-colors shrink-0"
            >
              <ChevronLeft size={16} className="shrink-0" />
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Link>

            <span className="text-slate-300 shrink-0">/</span>

            <span className="text-xs font-bold text-slate-900 truncate">
              <span className="hidden sm:inline">My Profile & Settings</span>
              <span className="sm:hidden">My Profile</span>
            </span>
          </div>

          {/* Active Account Status Pill - Unwrapped on mobile */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] sm:text-[11px] font-bold whitespace-nowrap shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="hidden sm:inline">Active Account</span>
              <span className="sm:hidden">Active</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Profile Layout Container */}
      <div className="max-w-4xl mx-auto px-2.5 sm:px-6 py-4 sm:py-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
          {/* Header Banner */}
          <ProfileHeader profile={profile} email={profile.email} />

          {/* Quick Metrics Bar */}
          <ProfileStats profile={profile} inTime={profile.in_time || ""} />

          {/* Comprehensive Tabbed Details Section */}
          <ProfileDetailsSection
            profile={profile}
            onProfileUpdated={handleProfileUpdated}
          />
        </div>
      </div>
    </div>
  );
}
