"use client";

import { useState } from "react";
import { User, Copy, Check, Droplets, Award, Shield, Briefcase, Building2 } from "lucide-react";
import { UserProfileData } from "./ProfileDetailsSection";

interface ProfileHeaderProps {
  email?: string | null;
  profile?: UserProfileData | null;
}

export function ProfileHeader({ email, profile }: ProfileHeaderProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);

  const displayEmail = profile?.email || email || "";
  const firstName = profile?.first_name || (profile?.full_name ? profile.full_name.split(" ")[0] : "");
  const lastName = profile?.last_name || (profile?.full_name ? profile.full_name.split(" ").slice(1).join(" ") : "");
  
  const displayName = [firstName, lastName].filter(Boolean).join(" ") 
    || profile?.full_name 
    || (displayEmail ? displayEmail.split("@")[0].replace(/[._-]/g, " ") : "Team Member");

  const initial = (firstName?.[0] || displayName?.[0] || displayEmail?.[0] || "U").toUpperCase();

  function copyEmail() {
    if (!displayEmail) return;
    navigator.clipboard.writeText(displayEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  // Role info badge
  const roleLabel = profile?.is_super_admin
    ? "Super Admin"
    : profile?.is_admin
    ? "Store Admin"
    : profile?.is_stock_manager
    ? "Stock Manager"
    : "Staff Member";

  const roleBadgeStyle = profile?.is_super_admin
    ? "bg-purple-50 text-purple-700 border-purple-200"
    : profile?.is_admin
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : profile?.is_stock_manager
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white pt-7 sm:pt-10 pb-6 sm:pb-8 px-4 sm:px-8 border-b border-slate-700/60">
      {/* Ambient background decoration */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6 max-w-4xl mx-auto">
        {/* Avatar Circle */}
        <div className="relative group shrink-0">
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-1 shadow-xl shadow-blue-900/30 ring-4 ring-white/10">
            <div className="w-full h-full rounded-[14px] sm:rounded-[22px] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center text-3xl sm:text-5xl font-black text-white tracking-wider">
              {initial}
            </div>
          </div>
          {profile?.blood_group && (
            <div className="absolute -bottom-1.5 -right-1.5 sm:-bottom-2 sm:-right-2 bg-rose-600 text-white text-[10px] sm:text-[11px] font-black px-1.5 sm:px-2 py-0.5 rounded-full border-2 border-slate-900 shadow-sm flex items-center gap-0.5 whitespace-nowrap shrink-0">
              <span>🩸</span>
              <span>{profile.blood_group}</span>
            </div>
          )}
        </div>

        {/* User Identity Details */}
        <div className="flex-1 text-center md:text-left space-y-2 sm:space-y-2.5 min-w-0">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2">
            {/* Role Badge */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs whitespace-nowrap shrink-0 ${roleBadgeStyle}`}>
              {profile?.is_super_admin ? <Shield size={12} className="shrink-0" /> : profile?.is_admin ? <Shield size={12} className="shrink-0" /> : <User size={12} className="shrink-0" />}
              <span>{roleLabel}</span>
            </span>

            {/* Employee ID Badge */}
            {profile?.employee_id && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400/30 whitespace-nowrap shrink-0">
                <Award size={12} className="shrink-0" />
                <span>{profile.employee_id}</span>
              </span>
            )}

            {/* Blood Group Badge */}
            {profile?.blood_group && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30 whitespace-nowrap shrink-0">
                <Droplets size={12} className="fill-rose-300 shrink-0" />
                <span>Blood: {profile.blood_group}</span>
              </span>
            )}
          </div>

          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white capitalize break-words">
              {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2">
              <span className="font-medium text-slate-200">
                {profile?.designation || "Staff Associate"}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                {profile?.department || "Operations"}
              </span>
            </p>
          </div>

          {/* Email badge with copy */}
          <div className="flex items-center justify-center md:justify-start gap-2 pt-0.5 sm:pt-1">
            <span className="text-[11px] sm:text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 sm:px-3 py-1 rounded-lg border border-slate-700/60 truncate max-w-[200px] sm:max-w-xs">
              {displayEmail}
            </span>
            {displayEmail && (
              <button
                type="button"
                onClick={copyEmail}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                title="Copy Email"
              >
                {copiedEmail ? <Check size={14} className="text-emerald-400 shrink-0" /> : <Copy size={14} className="shrink-0" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
