"use client";

import { Clock, Phone, Heart, Award, Droplets, Calendar, Briefcase } from "lucide-react";
import { UserProfileData } from "./ProfileDetailsSection";

interface ProfileStatsProps {
  inTime?: string;
  phone?: string;
  emergency?: string;
  profile?: UserProfileData | null;
}

export function ProfileStats({ inTime, phone, emergency, profile }: ProfileStatsProps) {
  // Resolve values prioritizing profile if provided
  const resolvedInTime = profile?.in_time || inTime || "Not set";
  const resolvedEmpId = profile?.employee_id || "EMP-PENDING";
  const resolvedBlood = profile?.blood_group || "Not set";

  // Calculate tenure if date_of_joining is present
  function formatTenure(doj?: string | null): string {
    if (!doj) return "Not set";
    const start = new Date(doj);
    if (isNaN(start.getTime())) return doj;
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years === 0 && months === 0) {
      const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return `${Math.max(1, diffDays)}d`;
    }
    const out: string[] = [];
    if (years > 0) out.push(`${years}y`);
    if (months > 0) out.push(`${months}m`);
    return out.join(" ");
  }

  function formatTime(val?: string) {
    if (!val || val === "Not set") return "Not set";
    if (/am|pm/i.test(val)) return val;
    const parts = val.split(":");
    if (parts.length < 2) return val;
    const h = parseInt(parts[0], 10);
    if (isNaN(h)) return val;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${parts[1]} ${ampm}`;
  }

  const items = [
    {
      label: "Employee ID",
      value: resolvedEmpId,
      icon: Award,
      color: "text-[#2563EB]",
      bg: "bg-blue-50 border border-blue-200",
    },
    {
      label: "Blood Group",
      value: resolvedBlood,
      icon: Droplets,
      color: "text-rose-600",
      bg: "bg-rose-50 border border-rose-200",
    },
    {
      label: "Shift Timing",
      value: formatTime(resolvedInTime),
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50 border border-amber-200",
    },
    {
      label: "Service Tenure",
      value: profile?.date_of_joining ? formatTenure(profile.date_of_joining) : "Active",
      icon: Calendar,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border border-emerald-200",
    },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-8 py-3 sm:py-4 bg-white border-b border-slate-200/80">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="p-2 sm:p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex items-center gap-2 sm:gap-3 min-w-0"
          >
            <div className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}>
              <item.icon size={16} className="sm:w-[18px] sm:h-[18px] shrink-0" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                {item.label}
              </div>
              <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5 truncate whitespace-nowrap">
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
