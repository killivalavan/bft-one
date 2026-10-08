"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  Eye,
  Shield,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  calculateServiceTenure,
  computeMilestones,
  generateSalaryProjection,
  STANDARD_ACHIEVEMENTS_CATALOG,
} from "@/lib/services/employeeHubService";
import { EmployeeHeroSection } from "./EmployeeHeroSection";
import { EmployeeSummaryCards } from "./EmployeeSummaryCards";
import { NextMilestoneCard } from "./NextMilestoneCard";
import { SalaryJourneySection } from "./SalaryJourneySection";
import { CareerJourneyTimeline } from "./CareerJourneyTimeline";
import { AchievementsSection } from "./AchievementsSection";
import { NoticeBoardSection } from "./NoticeBoardSection";
import { MissingDataNotice } from "./EmptyHubState";

interface EmployeeHubViewProps {
  previewUserId?: string | null;
  onExitPreview?: () => void;
}

export function EmployeeHubView({
  previewUserId,
  onExitPreview,
}: EmployeeHubViewProps = {}) {
  const { user } = useUser();
  const { flags } = useProfile();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Client-side direct fallback querying Supabase if the API endpoint is unavailable or returns 401
  const loadDirectFallback = useCallback(async (targetId: string) => {
    try {
      const { data: prof, error: profErr } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (profErr || !prof) return null;

      const profileData = {
        id: prof.id,
        email: prof.email,
        fullName: prof.full_name || prof.email?.split("@")[0] || "Team Member",
        employeeId: prof.employee_id || `EMP-${prof.id.slice(0, 4).toUpperCase()}`,
        designation: prof.designation || (prof.is_admin ? "Store Administrator" : "Store Associate"),
        department: prof.department || "Operations",
        dateOfJoining: prof.date_of_joining || prof.created_at || null,
        baseSalaryCents: prof.base_salary_cents || 0,
        joiningSalaryCents: prof.joining_salary_cents || prof.base_salary_cents || 0,
        fixedAllowanceCents: prof.fixed_allowance_cents || 0,
        inTime: prof.in_time || "10:00 AM",
        contactNumber: prof.contact_number || null,
        emergencyContactNumber: prof.emergency_contact_number || null,
        incrementAmountCents: prof.increment_amount_cents || 200000,
        incrementFrequencyMonths: prof.increment_frequency_months || 12,
        nextIncrementDate: prof.next_increment_date || null,
        incrementPolicyNote: prof.increment_policy_note || "₹2,000 increment every year based on company policy.",
        bloodGroup: prof.blood_group || null,
      };

      const tenure = calculateServiceTenure(profileData.dateOfJoining);
      const { milestones, nextMilestone } = computeMilestones(profileData.dateOfJoining);

      // Attempt loading related records with error suppression (tables may be pending migration)
      let dbIncrements: any[] = [];
      let dbAchievements: any[] = [];
      let dbNotices: any[] = [];

      try {
        const { data: incs } = await supabaseClient
          .from("employee_increments")
          .select("*")
          .eq("user_id", targetId)
          .order("effective_date", { ascending: false });
        if (incs) dbIncrements = incs;
      } catch {}

      try {
        const { data: achs } = await supabaseClient
          .from("employee_achievements")
          .select("*")
          .eq("user_id", targetId);
        if (achs) dbAchievements = achs;
      } catch {}

      try {
        const { data: nots } = await supabaseClient
          .from("employee_notices")
          .select("*")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (nots) dbNotices = nots;
      } catch {}

      const increments = dbIncrements.map((i: any) => ({
        id: i.id,
        effectiveDate: i.effective_date,
        previousSalaryCents: i.previous_salary_cents,
        newSalaryCents: i.new_salary_cents,
        incrementAmountCents: i.increment_amount_cents,
        reason: i.reason,
      }));

      const currentMonthlySalary = (profileData.baseSalaryCents || 0) / 100;
      const annualIncrementAmt = (profileData.incrementAmountCents || 200000) / 100;

      const salaryProjections = {
        fiveYears: generateSalaryProjection(currentMonthlySalary, annualIncrementAmt, 5),
        tenYears: generateSalaryProjection(currentMonthlySalary, annualIncrementAmt, 10),
        fifteenYears: generateSalaryProjection(currentMonthlySalary, annualIncrementAmt, 15),
      };

      const achievements = STANDARD_ACHIEVEMENTS_CATALOG.map((cat) => {
        const found = dbAchievements.find((a: any) => a.badge_key === cat.badgeKey);
        return {
          id: found?.id || `preset_${cat.badgeKey}`,
          badgeKey: cat.badgeKey,
          title: found?.title || cat.title,
          description: found?.description || cat.description,
          category: cat.category,
          achievedDate: found?.achieved_date || null,
          isUnlocked: !!found,
          iconName: cat.iconName,
          emoji: cat.emoji,
        };
      });

      const notices = dbNotices.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        priority: n.priority || "normal",
        targetAudienceType: n.target_audience_type || "all",
        targetAudienceValue: n.target_audience_value || null,
        isPinned: !!n.is_pinned,
        createdAt: n.created_at,
        expiresAt: n.expires_at || null,
      }));

      return {
        profile: profileData,
        tenure,
        milestones,
        nextMilestone,
        salary: {
          currentBaseSalaryCents: profileData.baseSalaryCents,
          joiningSalaryCents: profileData.joiningSalaryCents,
          fixedAllowanceCents: profileData.fixedAllowanceCents,
          lastIncrement: increments[0] || null,
          nextExpectedIncrementCents: profileData.incrementAmountCents,
          increments,
          projections: salaryProjections,
          policy: {
            amountCents: profileData.incrementAmountCents,
            frequencyMonths: profileData.incrementFrequencyMonths,
            effectiveDate: profileData.nextIncrementDate,
            note: profileData.incrementPolicyNote,
          },
        },
        achievements,
        notices,
      };
    } catch (err) {
      console.error("Direct fallback failed:", err);
      return null;
    }
  }, []);

  const fetchHubData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Check client session
      const { data: sessionRes } = await supabaseClient.auth.getSession();
      const session = sessionRes?.session;
      const token = session?.access_token;
      const targetUserId = previewUserId || session?.user?.id || user?.id;

      let url = "/api/employee/hub-data";
      if (previewUserId) {
        url += `?userId=${encodeURIComponent(previewUserId)}`;
      }

      // 2. Attempt API request with Bearer token
      let fetchedOk = false;
      let apiError = "";

      if (token) {
        try {
          const res = await fetch(url, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            const json = await res.json();
            setData(json);
            fetchedOk = true;
            return;
          }

          // If 401, attempt session refresh once
          if (res.status === 401) {
            const { data: refreshed } = await supabaseClient.auth.refreshSession();
            if (refreshed?.session?.access_token) {
              const retryRes = await fetch(url, {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${refreshed.session.access_token}`,
                },
              });
              if (retryRes.ok) {
                const json = await retryRes.json();
                setData(json);
                fetchedOk = true;
                return;
              }
            }
          }

          const errJson = await res.json().catch(() => ({}));
          apiError = errJson.error || `HTTP error ${res.status}`;
        } catch (fetchErr: any) {
          apiError = fetchErr.message || "Network error";
        }
      }

      // 3. Seamless client-side direct fallback if API was unavailable or errored
      if (!fetchedOk && targetUserId) {
        const fallbackData = await loadDirectFallback(targetUserId);
        if (fallbackData) {
          setData(fallbackData);
          return;
        }
      }

      // 4. If neither worked and no session exists:
      if (!session && !targetUserId) {
        throw new Error("Invalid or expired session. Please sign in again.");
      }

      throw new Error(apiError || "Failed to load employee hub data");
    } catch (e: any) {
      console.error("Failed to load employee hub data:", e);
      setError(e.message || "Failed to load employee hub");
    } finally {
      setLoading(false);
    }
  }, [previewUserId, user?.id, loadDirectFallback]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  // Loading Skeleton State
  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-pulse">
        {/* Hero Skeleton */}
        <div className="space-y-3">
          <div className="h-4 w-40 bg-slate-200 rounded-md" />
          <div className="h-10 w-80 bg-slate-200 rounded-xl" />
          <div className="h-4 w-96 bg-slate-200 rounded-md" />
          <div className="h-20 w-full bg-slate-200 rounded-2xl" />
        </div>

        {/* Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-2xl" />
          ))}
        </div>

        {/* Main Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-40 bg-slate-200 rounded-2xl" />
            <div className="h-80 bg-slate-200 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="h-64 bg-slate-200 rounded-2xl" />
            <div className="h-64 bg-slate-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !data) {
    const isAuthError =
      error.toLowerCase().includes("session") ||
      error.toLowerCase().includes("sign in") ||
      error.toLowerCase().includes("unauthorized") ||
      error.toLowerCase().includes("401");

    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-white rounded-3xl border border-slate-200 text-center shadow-lg space-y-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
          isAuthError ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-red-50 text-red-600 border border-red-200"
        }`}>
          <AlertCircle size={28} />
        </div>
        <h3 className="text-lg font-bold text-[#0F172A]">
          {isAuthError ? "Session Expired" : "Unable to Load Employee Hub"}
        </h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto">
          {isAuthError
            ? "Your session is invalid or has expired. Please sign in again to access your Employee Hub."
            : error}
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {isAuthError ? (
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] text-white font-semibold text-xs hover:bg-blue-700 transition-all shadow-xs"
            >
              <Shield size={14} />
              <span>Sign In Again</span>
            </Link>
          ) : (
            <button
              onClick={fetchHubData}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] text-white font-semibold text-xs hover:bg-blue-700 transition-all shadow-xs"
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          )}
          {isAuthError && (
            <button
              onClick={fetchHubData}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200 transition-all"
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, tenure, milestones, nextMilestone, salary, achievements, notices } = data;
  const isMissingSalary = !profile.baseSalaryCents || profile.baseSalaryCents <= 0;
  const isMissingJoiningDate = !profile.dateOfJoining;

  return (
    <div className="min-h-screen pb-20 bg-[#F8FAFC]">
      {/* Admin Preview Floating Header */}
      {(flags?.isAdmin || previewUserId) && (
        <div className="bg-slate-900 text-white border-b border-slate-800 px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <Eye size={14} className="text-blue-400 shrink-0" />
            <span className="font-semibold text-slate-300 truncate">
              Employee Hub View:{" "}
              <strong className="text-white capitalize">{profile.fullName || profile.email}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onExitPreview ? (
              <button
                onClick={onExitPreview}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition-colors"
              >
                <ArrowLeft size={12} />
                <span>Return to Command Center</span>
              </button>
            ) : (
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
              >
                <Shield size={12} className="text-blue-400" />
                <span>Manage in Admin</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Main Employee Hub Layout */}
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6">
        {/* 1. HERO & WELCOME SECTION */}
        <EmployeeHeroSection
          profile={profile}
          tenure={tenure}
          isAdminPreview={!!previewUserId}
        />

        {/* Missing Data Notices if Incomplete */}
        {isMissingSalary && <MissingDataNotice type="salary" />}
        {isMissingJoiningDate && <MissingDataNotice type="joining_date" />}

        {/* 2. EMPLOYEE SUMMARY CARDS ROW */}
        <EmployeeSummaryCards
          currentMonthlySalary={salary.currentMonthlySalary}
          tenure={tenure}
          nextMilestone={nextMilestone}
          incrementAmount={salary.incrementAmount}
          nextIncrementDate={salary.nextIncrementDate}
        />

        {/* 3. CORE HIGHLIGHT: NEXT MILESTONE CARD */}
        <NextMilestoneCard
          nextMilestone={nextMilestone}
          joiningDateStr={profile.dateOfJoining}
        />

        {/* 4. SALARY & INCREMENT JOURNEY */}
        <SalaryJourneySection
          currentMonthlySalary={salary.currentMonthlySalary}
          joiningMonthlySalary={salary.joiningMonthlySalary}
          incrementAmount={salary.incrementAmount}
          incrementFrequencyMonths={salary.incrementFrequencyMonths}
          nextIncrementDate={salary.nextIncrementDate}
          lastIncrement={salary.lastIncrement}
          incrementHistory={salary.incrementHistory}
          projections={salary.projections}
          incrementPolicyNote={profile.incrementPolicyNote}
        />

        {/* 5. SPLIT SECTION: CAREER JOURNEY TIMELINE & NOTICE BOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (7 cols): My Journey Milestone Timeline */}
          <div className="lg:col-span-7">
            <CareerJourneyTimeline
              milestones={milestones}
              joiningDateStr={profile.dateOfJoining}
            />
          </div>

          {/* Right Column (5 cols): Employee Notice Board */}
          <div className="lg:col-span-5">
            <NoticeBoardSection notices={notices} />
          </div>
        </div>

        {/* 6. ACHIEVEMENTS & RECOGNITION */}
        <AchievementsSection achievements={achievements} />
      </div>
    </div>
  );
}
