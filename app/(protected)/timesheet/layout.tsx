"use client";

import React from "react";
import GeofenceGate from "@/components/GeofenceGate";
import { useTenant } from "@/lib/context/TenantContext";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  const { isModuleEnabled, loading } = useTenant();
  const isTimesheetEnabled = isModuleEnabled ? isModuleEnabled("timesheet") : true;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 rounded-full border-3 border-blue-600 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-500 tracking-tight">Loading Timesheet Workspace...</span>
      </div>
    );
  }

  if (!isTimesheetEnabled) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 mx-auto flex items-center justify-center">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-base font-bold text-[#0F172A]">Timesheet Module Disabled</h2>
          <p className="text-xs text-slate-500">
            The Timesheet &amp; GPS Attendance tracking module is currently disabled for this store. You can enable it from the Business Profile or Super Admin dashboard.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <GeofenceGate>{children}</GeofenceGate>;
}
