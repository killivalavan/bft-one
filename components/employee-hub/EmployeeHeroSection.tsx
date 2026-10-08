"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarDays,
  Wallet,
  Contact,
  User,
  Clock,
  Briefcase,
  Building2,
  Calendar,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { EmployeeProfileData, ServiceTenure } from "@/lib/services/employeeHubService";
import { cn } from "@/lib/utils/cn";

interface EmployeeHeroSectionProps {
  profile: EmployeeProfileData;
  tenure: ServiceTenure;
  isAdminPreview?: boolean;
}

export function EmployeeHeroSection({
  profile,
  tenure,
  isAdminPreview,
}: EmployeeHeroSectionProps) {
  const [greeting, setGreeting] = useState("Hello");
  const [currentDateStr, setCurrentDateStr] = useState("");

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting("Good morning");
    else if (hours < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");

    setCurrentDateStr(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    );
  }, []);

  const formattedJoiningDate = profile.dateOfJoining
    ? new Date(profile.dateOfJoining).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="relative pt-2 pb-2">
      {/* Subtle Ambient Background Mesh */}
      <div className="absolute -top-12 -left-10 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-0 right-0 w-80 h-80 bg-slate-200/40 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="space-y-4">
        {/* Top Badges Row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[#E2E8F0] shadow-2xs text-[11px] font-semibold text-[#0F172A]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
              </span>
              <span className="text-[#64748B] font-medium">Employee Hub</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className="text-[#2563EB] font-bold">Active Staff</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[#E2E8F0] shadow-2xs text-[11px] font-semibold text-[#64748B]">
              <Calendar size={12} className="text-[#2563EB]" />
              <span>{currentDateStr}</span>
            </div>

            {profile.employeeId && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800">
                <span>{profile.employeeId}</span>
              </div>
            )}

            {profile.bloodGroup && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700" title="Blood Group">
                <span>🩸 {profile.bloodGroup}</span>
              </div>
            )}

            {profile.aadhaarNumber && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-50 border border-zinc-200 text-[11px] font-mono font-medium text-zinc-700" title="Aadhaar Number">
                <span>🆔 •••• {profile.aadhaarNumber.replace(/\s+/g, "").slice(-4)}</span>
              </div>
            )}
          </div>

          {/* Service Badge */}
          {tenure.formatted !== "Not specified" && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 shadow-2xs">
              <Sparkles size={13} className="text-emerald-600" />
              <span>With us for {tenure.formatted}</span>
            </div>
          )}
        </div>

        {/* Personalized Welcome Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0F172A] tracking-tight leading-tight">
              {greeting},{" "}
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[#2563EB] capitalize">
                  {profile.firstName || profile.fullName?.split(" ")[0] || profile.email.split("@")[0]}
                </span>
                <span className="inline-block text-2xl sm:text-3xl md:text-4xl">👋</span>
              </span>
            </h1>
            <p className="text-[#64748B] text-xs sm:text-sm font-normal max-w-2xl">
              Welcome to your personal employee hub. Track your salary journey, service milestones, achievements, and company notices below.
            </p>
          </div>

          {/* Shift In-time Pill */}
          {profile.inTime && (
            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-[#E2E8F0] shadow-xs shrink-0 self-start lg:self-auto">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                  Shift Timing
                </div>
                <div className="text-sm font-bold text-[#0F172A]">{profile.inTime}</div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Employee Summary Profile Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 divide-y sm:divide-y-0 divide-slate-100 sm:divide-x divide-slate-100">
            {/* 1. Designation */}
            <div className="pt-2 sm:pt-0 sm:pr-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
                <Briefcase size={13} className="text-[#2563EB]" />
                <span>Role / Designation</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                {profile.designation || "Store Staff"}
              </div>
            </div>

            {/* 2. Department */}
            <div className="pt-2 sm:pt-0 sm:px-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
                <Building2 size={13} className="text-[#2563EB]" />
                <span>Department</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                {profile.department || "Operations"}
              </div>
            </div>

            {/* 3. Joined Date */}
            <div className="pt-2 sm:pt-0 sm:px-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
                <Calendar size={13} className="text-[#2563EB]" />
                <span>Date Joined</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                {formattedJoiningDate || (
                  <span className="text-slate-400 font-normal">Not configured</span>
                )}
              </div>
            </div>

            {/* 4. Tenure */}
            <div className="pt-2 sm:pt-0 sm:pl-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
                <Sparkles size={13} className="text-[#16A34A]" />
                <span>Service Tenure</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-[#16A34A] truncate">
                {tenure.formatted !== "Not specified" ? tenure.formatted : "New Joiner"}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Staff Navigation Links (Timesheet, Calendar, Salary Ledger, Contacts) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Link
            href="/timesheet"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-xs font-semibold text-[#0F172A] hover:text-[#2563EB] border border-[#E2E8F0] hover:border-blue-200 transition-all shadow-2xs whitespace-nowrap active:scale-95"
          >
            <CalendarCheck2 size={13} className="text-[#2563EB]" />
            <span>Clock In / Timesheet</span>
          </Link>

          <Link
            href="/mysalary"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-xs font-semibold text-[#0F172A] hover:text-[#16A34A] border border-[#E2E8F0] hover:border-emerald-200 transition-all shadow-2xs whitespace-nowrap active:scale-95"
          >
            <Wallet size={13} className="text-[#16A34A]" />
            <span>Salary Ledger & Payslips</span>
          </Link>

          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-xs font-semibold text-[#0F172A] hover:text-[#2563EB] border border-[#E2E8F0] hover:border-blue-200 transition-all shadow-2xs whitespace-nowrap active:scale-95"
          >
            <CalendarDays size={13} className="text-[#2563EB]" />
            <span>Leave Calendar</span>
          </Link>

          <Link
            href="/contacts"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-semibold text-[#0F172A] border border-[#E2E8F0] transition-all shadow-2xs whitespace-nowrap active:scale-95"
          >
            <Contact size={13} className="text-slate-600" />
            <span>Emergency Contacts</span>
          </Link>

          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-semibold text-[#0F172A] border border-[#E2E8F0] transition-all shadow-2xs whitespace-nowrap active:scale-95"
          >
            <User size={13} className="text-slate-600" />
            <span>My Profile</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
