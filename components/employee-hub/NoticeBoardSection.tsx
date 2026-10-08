"use client";

import React, { useState } from "react";
import {
  Bell,
  Pin,
  AlertTriangle,
  Sparkles,
  Info,
  Clock,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { EmployeeNotice } from "@/lib/services/employeeHubService";
import { cn } from "@/lib/utils/cn";

interface NoticeBoardSectionProps {
  notices: EmployeeNotice[];
}

export function NoticeBoardSection({ notices }: NoticeBoardSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!notices || notices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <Bell size={22} />
        </div>
        <h3 className="text-base font-bold text-[#0F172A]">Employee Notice Board</h3>
        <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
          No active company announcements at the moment. All new operational notices and store updates will appear here.
        </p>
      </div>
    );
  }

  // Pinned notices first, then sorted by date
  const sortedNotices = [...notices].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle size={11} /> Urgent
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
            <Sparkles size={11} /> High Priority
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Info
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Announcement
          </span>
        );
    }
  };

  const formatNoticeDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffHrs = Math.round((now.getTime() - d.getTime()) / 3600000);

      if (diffHrs < 1) return "Just now";
      if (diffHrs < 24) return `${diffHrs} hours ago`;
      if (diffHrs < 48) return "Yesterday";
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 shadow-2xs">
            <Bell size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
                Employee Notice Board
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                {notices.length} Active
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#64748B]">
              Official company messages, operational briefings, and store announcements.
            </p>
          </div>
        </div>
      </div>

      {/* Notices List */}
      <div className="space-y-3">
        {sortedNotices.map((notice) => {
          const isExpanded = expandedId === notice.id;

          return (
            <div
              key={notice.id}
              className={cn(
                "rounded-xl border p-4 transition-all duration-200",
                notice.isPinned
                  ? "bg-gradient-to-r from-blue-50/60 via-white to-blue-50/30 border-blue-200/90 shadow-xs"
                  : "bg-white hover:bg-slate-50/70 border-slate-200"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges Bar */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    {notice.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs">
                        <Pin size={10} className="rotate-45" /> Pinned
                      </span>
                    )}

                    {getPriorityBadge(notice.priority)}

                    {notice.targetAudienceType !== "all" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        <Users size={10} />
                        <span className="capitalize">{notice.targetAudienceType}</span>
                      </span>
                    )}

                    <span className="text-xs text-[#64748B] flex items-center gap-1 ml-auto">
                      <Clock size={11} />
                      <span>{formatNoticeDate(notice.createdAt)}</span>
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm sm:text-base font-bold text-[#0F172A] leading-snug">
                    {notice.title}
                  </h3>

                  {/* Message */}
                  <p
                    className={cn(
                      "text-xs sm:text-sm text-[#475569] mt-1.5 leading-relaxed",
                      !isExpanded && "line-clamp-2"
                    )}
                  >
                    {notice.message}
                  </p>
                </div>
              </div>

              {/* Read more toggle if long message */}
              {notice.message.length > 140 && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : notice.id)}
                    className="text-xs font-semibold text-[#2563EB] hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <span>{isExpanded ? "Show Less" : "Read Full Notice"}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
