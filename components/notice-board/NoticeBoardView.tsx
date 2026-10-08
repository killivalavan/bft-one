"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Megaphone,
  Pin,
  AlertTriangle,
  Sparkles,
  Search,
  Plus,
  Trash2,
  Edit3,
  Share2,
  CheckCheck,
  Calendar,
  Clock,
  Users,
  RefreshCw,
  X,
  Send,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Copy,
  Info,
  Check,
  CalendarDays,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, isPast } from "date-fns";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

export interface NoticeItem {
  id: string;
  title: string;
  message: string;
  priority: "urgent" | "high" | "normal" | "low";
  target_audience_type: "all" | "role" | "department" | "employee";
  target_audience_value?: string | null;
  is_pinned: boolean;
  expires_at?: string | null;
  created_at: string;
  created_by?: string | null;
}

const TEMPLATES = [
  {
    label: "Store Timing Update",
    priority: "high" as const,
    title: "Store Operating Hours Announcement",
    message: "Please note our updated opening and closing hours starting this week. All shift leaders must ensure opening and closing SOP checklists are completed promptly.",
  },
  {
    label: "Staff Meeting",
    priority: "normal" as const,
    title: "Monthly Staff Sync & Operations Review",
    message: "All team members are requested to join our upcoming sync. We will review monthly sales milestones, inventory handovers, and recognize top contributors.",
  },
  {
    label: "Quality & Hygiene SOP",
    priority: "urgent" as const,
    title: "Urgent: Food Safety & Hygiene Standards",
    message: "Strict adherence to hygiene guidelines is mandatory across kitchen and front counters. Clean surfaces regularly, wear hairnets and aprons at all times.",
  },
  {
    label: "Festival / Bonus",
    priority: "normal" as const,
    title: "Festival Greetings & Team Appreciation",
    message: "A huge thank you to all team members for your dedication. Special festival incentives and schedule allocations have been released by store management.",
  },
];

export function NoticeBoardView() {
  const { user } = useUser();
  const { flags } = useProfile();
  const { business } = useTenant();
  const { toast } = useToast();

  // Management access: Only admins have editing, creation, pinning, and deletion privileges
  const isDirectAdmin = Boolean(
    flags?.isAdmin ||
    flags?.isSuperAdmin ||
    (user?.email && user.email.toLowerCase().includes("admin"))
  );
  const [dbIsAdmin, setDbIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabaseClient
      .from("profiles")
      .select("is_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDbIsAdmin(Boolean(data?.is_admin || data?.is_super_admin));
      });
  }, [user?.id]);

  const isAdmin = isDirectAdmin || dbIsAdmin === true;

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "pinned" | "urgent" | "expiring" | "unread">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Read / Acknowledged status in local storage
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("bft_acknowledged_notices");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPriority, setFormPriority] = useState<"urgent" | "high" | "normal" | "low">("normal");
  const [formTargetType, setFormTargetType] = useState<"all" | "role" | "department" | "employee">("all");
  const [formTargetValue, setFormTargetValue] = useState("");
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formExpiresAt, setFormExpiresAt] = useState("");

  const loadNotices = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabaseClient
        .from("employee_notices")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (business?.id) {
        query = query.or(`business_id.eq.${business.id},business_id.is.null`);
      }

      const { data, error } = await query;

      if (!error && data) {
        setNotices(data as NoticeItem[]);
      } else {
        // Fallback to employee hub endpoint if direct DB fails
        const res = await fetch("/api/employee/hub-data");
        if (res.ok) {
          const json = await res.json();
          if (json.notices) {
            setNotices(
              json.notices.map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                priority: n.priority,
                target_audience_type: n.targetAudienceType,
                target_audience_value: n.targetAudienceValue,
                is_pinned: n.isPinned,
                expires_at: n.expiresAt,
                created_at: n.createdAt,
              }))
            );
          }
        }
      }
    } catch (e) {
      console.error("Error loading notices:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const toggleAcknowledge = (noticeId: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(noticeId)) {
        next.delete(noticeId);
        toast({ title: "Marked as Unread", variant: "info" });
      } else {
        next.add(noticeId);
        toast({ title: "Notice Acknowledged! ✅", variant: "success" });
      }
      try {
        localStorage.setItem("bft_acknowledged_notices", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleCopyNotice = (notice: NoticeItem) => {
    const text = `📢 *${notice.title}*\n\n${notice.message}\n\n— ${business?.name || "BFT Store Operations"}`;
    navigator.clipboard.writeText(text);
    setCopiedId(notice.id);
    setTimeout(() => setCopiedId(null), 2500);
    toast({ title: "Notice copied to clipboard!", variant: "success" });
  };

  const handleShareToWhatsApp = (notice: NoticeItem) => {
    const text = encodeURIComponent(
      `📢 *${notice.title}*\n\n${notice.message}\n\n— Sent via ${business?.name || "BFT Team Portal"}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const openCreateModal = () => {
    setEditingNotice(null);
    setFormTitle("");
    setFormMessage("");
    setFormPriority("normal");
    setFormTargetType("all");
    setFormTargetValue("");
    setFormIsPinned(false);
    setFormExpiresAt("");
    setIsModalOpen(true);
  };

  const openEditModal = (notice: NoticeItem) => {
    setEditingNotice(notice);
    setFormTitle(notice.title);
    setFormMessage(notice.message);
    setFormPriority(notice.priority);
    setFormTargetType(notice.target_audience_type || "all");
    setFormTargetValue(notice.target_audience_value || "");
    setFormIsPinned(notice.is_pinned);
    setFormExpiresAt(notice.expires_at ? notice.expires_at.substring(0, 10) : "");
    setIsModalOpen(true);
  };

  const handleApplyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setFormTitle(tpl.title);
    setFormMessage(tpl.message);
    setFormPriority(tpl.priority);
    toast({ title: `Loaded: ${tpl.label}`, variant: "info" });
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formMessage.trim()) {
      toast({ title: "Please fill in title and message", variant: "error" });
      return;
    }

    setSubmitting(true);
    try {
      if (editingNotice) {
        // Update notice
        const { error: directErr } = await supabaseClient
          .from("employee_notices")
          .update({
            title: formTitle.trim(),
            message: formMessage.trim(),
            priority: formPriority,
            target_audience_type: formTargetType,
            target_audience_value: formTargetValue.trim() || null,
            is_pinned: formIsPinned,
            expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingNotice.id);

        if (directErr) {
          // Fallback to server route /api/admin/employee-hub
          const res = await fetch("/api/admin/employee-hub", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update_notice",
              noticeId: editingNotice.id,
              updates: {
                title: formTitle.trim(),
                message: formMessage.trim(),
                priority: formPriority,
                targetAudienceType: formTargetType,
                targetAudienceValue: formTargetValue.trim() || null,
                isPinned: formIsPinned,
                expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
              },
            }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error || directErr.message);
          }
        }

        // Optimistically update notice in UI
        setNotices((prev) =>
          prev.map((n) =>
            n.id === editingNotice.id
              ? {
                  ...n,
                  title: formTitle.trim(),
                  message: formMessage.trim(),
                  priority: formPriority,
                  target_audience_type: formTargetType,
                  target_audience_value: formTargetValue.trim() || null,
                  is_pinned: formIsPinned,
                  expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
                }
              : n
          )
        );

        toast({ title: "Announcement Updated! 📝", variant: "success" });
      } else {
        // Create new notice
        const { error: directErr } = await supabaseClient
          .from("employee_notices")
          .insert({
            business_id: business?.id,
            title: formTitle.trim(),
            message: formMessage.trim(),
            priority: formPriority,
            target_audience_type: formTargetType,
            target_audience_value: formTargetValue.trim() || null,
            is_pinned: formIsPinned,
            expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
            created_by: user?.id,
          });

        if (directErr) {
          // Fallback to server route
          const res = await fetch("/api/admin/employee-hub", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_notice",
              title: formTitle.trim(),
              message: formMessage.trim(),
              priority: formPriority,
              targetAudienceType: formTargetType,
              targetAudienceValue: formTargetValue.trim() || null,
              isPinned: formIsPinned,
              expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
            }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error || directErr.message);
          }
        }

        toast({ title: "Announcement Published! 📢", variant: "success" });
      }

      setIsModalOpen(false);
      await loadNotices();
    } catch (err: any) {
      toast({
        title: "Failed to save announcement",
        description: err.message || "Please check your network connection.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (notice: NoticeItem) => {
    try {
      const nextPinned = !notice.is_pinned;
      const { error: directErr } = await supabaseClient
        .from("employee_notices")
        .update({ is_pinned: nextPinned, updated_at: new Date().toISOString() })
        .eq("id", notice.id);

      if (directErr) {
        const res = await fetch("/api/admin/employee-hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_notice",
            noticeId: notice.id,
            updates: { isPinned: nextPinned },
          }),
        });
        if (!res.ok) throw directErr;
      }

      setNotices((prev) =>
        prev.map((n) => (n.id === notice.id ? { ...n, is_pinned: nextPinned } : n))
      );
      toast({
        title: nextPinned ? "Pinned to Top 📌" : "Unpinned Announcement",
        variant: "success",
      });
    } catch (err: any) {
      toast({ title: "Failed to update pin", description: err.message, variant: "error" });
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!window.confirm("Are you sure you want to delete this notice? This action cannot be undone.")) return;

    try {
      const { error: directErr } = await supabaseClient
        .from("employee_notices")
        .delete()
        .eq("id", noticeId);

      if (directErr) {
        const res = await fetch("/api/admin/employee-hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_notice",
            noticeId,
          }),
        });
        if (!res.ok) throw directErr;
      }

      setNotices((prev) => prev.filter((n) => n.id !== noticeId));
      toast({ title: "Announcement Removed 🗑️", variant: "success" });
    } catch (err: any) {
      toast({ title: "Failed to delete notice", description: err.message, variant: "error" });
    }
  };

  // Filtered & Searched Notices
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesMsg = n.message.toLowerCase().includes(q);
        const matchesAudience = n.target_audience_value?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesAudience) return false;
      }

      // Filter tabs
      if (selectedFilter === "pinned") return n.is_pinned;
      if (selectedFilter === "urgent") return n.priority === "urgent" || n.priority === "high";
      if (selectedFilter === "expiring") {
        if (!n.expires_at) return false;
        const exp = new Date(n.expires_at).getTime();
        const now = Date.now();
        const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
        return diffDays >= -1 && diffDays <= 7;
      }
      if (selectedFilter === "unread") return !readIds.has(n.id);

      return true;
    });
  }, [notices, searchQuery, selectedFilter, readIds]);

  // Statistics
  const stats = useMemo(() => {
    const total = notices.length;
    const pinnedCount = notices.filter((n) => n.is_pinned).length;
    const urgentCount = notices.filter((n) => n.priority === "urgent" || n.priority === "high").length;
    const expiringCount = notices.filter((n) => {
      if (!n.expires_at) return false;
      const exp = new Date(n.expires_at).getTime();
      const now = Date.now();
      const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
      return diffDays >= -1 && diffDays <= 7;
    }).length;
    const unreadCount = notices.filter((n) => !readIds.has(n.id)).length;
    return { total, pinnedCount, urgentCount, expiringCount, unreadCount };
  }, [notices, readIds]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
      {/* 1. TOP HEADER BAR (Fully Responsive for Mobile & Desktop) */}
      <div className="border-b border-[#E2E8F0] bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            {/* Title & Store Info */}
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
                <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0 flex-1">
                {/* Title + Live Broadcast badge (Wraps seamlessly on narrow mobile view) */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[#0F172A] leading-tight">
                    Employee Notice Board
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] sm:text-xs font-semibold bg-blue-50 text-[#2563EB] border border-blue-200 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />
                    <span>Live Broadcast</span>
                  </span>
                </div>

                {/* Store Name & Subtitle Description (Responsive multiline wrapping) */}
                <div className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  <span className="font-semibold text-slate-800">
                    {business?.name || "BFT Store Operations"}
                  </span>
                  <span className="mx-1.5 text-slate-300">•</span>
                  <span className="text-slate-500">
                    Official company announcements, operational SOPs & staff updates
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Bar (Refreshes & Broadcasts) */}
            <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              <button
                type="button"
                onClick={() => loadNotices(true)}
                disabled={refreshing}
                title="Refresh Announcements"
                className="p-2 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-600 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={15} className={cn(refreshing && "animate-spin text-[#2563EB]")} />
              </button>

              {isAdmin && (
                <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold shadow-2xs">
                  <ShieldCheck size={14} className="text-blue-600" />
                  <span>Admin Mode</span>
                  <span className="text-[11px] font-normal text-blue-600 hidden md:inline">• Edit &amp; post tools hidden from staff</span>
                </div>
              )}

              {isAdmin && (
                <Button
                  onClick={openCreateModal}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Broadcast Notice</span>
                  <span className="ml-1 text-[10px] font-extrabold uppercase bg-blue-800 text-white px-1.5 py-0.5 rounded tracking-wider">Admin Only</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 mt-4 sm:mt-6 space-y-4 sm:space-y-6">
        {/* 2. STATS OVERVIEW CARDS (Standard Clean White Cards with Semantic Accents) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#64748B]">Total Notices</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563EB]">
                <MessageSquare size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[#0F172A]">{stats.total}</div>
            <p className="text-[11px] text-[#64748B] mt-0.5">Published broadcasts</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#64748B]">Pinned to Top</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563EB]">
                <Pin size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[#2563EB]">{stats.pinnedCount}</div>
            <p className="text-[11px] text-[#64748B] mt-0.5">Priority highlights</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#64748B]">Urgent Alerts</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-[#DC2626]">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[#DC2626]">{stats.urgentCount}</div>
            <p className="text-[11px] text-[#64748B] mt-0.5">Time-critical updates</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#64748B]">Expiring Soon</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Clock size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-amber-600">{stats.expiringCount}</div>
            <p className="text-[11px] text-[#64748B] mt-0.5">Expiry within 7 days</p>
          </div>
        </div>

        {/* 3. SEARCH & FILTER TOOLBAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-xs">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search announcements, tags, departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border-[#E2E8F0] rounded-xl h-9 font-medium"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {[
              { id: "all", label: "All Notices", count: stats.total },
              { id: "pinned", label: "📌 Pinned", count: stats.pinnedCount },
              { id: "urgent", label: "🚨 Urgent", count: stats.urgentCount },
              { id: "expiring", label: "⏳ Expiring", count: stats.expiringCount },
              { id: "unread", label: "Unread", count: stats.unreadCount },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFilter(f.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5",
                  selectedFilter === f.id
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                )}
              >
                <span>{f.label}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-md text-[10px]",
                    selectedFilter === f.id ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200"
                  )}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. ANNOUNCEMENTS LIST / CARDS */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 size={32} className="animate-spin text-[#2563EB] mx-auto" />
            <p className="text-xs text-[#64748B] font-semibold">Loading company notice board...</p>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="py-16 px-4 bg-white rounded-2xl border border-dashed border-[#E2E8F0] text-center space-y-3 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-200 flex items-center justify-center mx-auto shadow-2xs">
              <Megaphone size={24} />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">No Announcements Found</h3>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">
              {searchQuery || selectedFilter !== "all"
                ? "No notices match your active search filter. Try clearing the search or switching filters."
                : "No company broadcasts have been published yet. All store announcements, policies, and operational notes will appear here."}
            </p>
            <Button onClick={openCreateModal} className="mt-2 text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8]">
              <Plus size={14} className="mr-1" /> Create First Broadcast
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredNotices.map((notice) => {
              const isUrgent = notice.priority === "urgent";
              const isHigh = notice.priority === "high";
              const isPinned = notice.is_pinned;
              const isRead = readIds.has(notice.id);
              const isExpired = notice.expires_at ? isPast(parseISO(notice.expires_at)) : false;

              return (
                <div
                  key={notice.id}
                  className={cn(
                    "relative rounded-2xl bg-white transition-all duration-200 p-5 sm:p-6 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-sm",
                    isUrgent
                      ? "border-2 border-rose-300 bg-rose-50/15"
                      : isHigh
                      ? "border border-amber-300 bg-amber-50/15"
                      : isPinned
                      ? "border-2 border-blue-300 bg-blue-50/15"
                      : "border border-[#E2E8F0]"
                  )}
                >
                  {/* Top Priority Ribbon Accent */}
                  {isUrgent && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[#DC2626]" />
                  )}
                  {isHigh && !isUrgent && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[#F59E0B]" />
                  )}
                  {isPinned && !isUrgent && !isHigh && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[#2563EB]" />
                  )}

                  <div className="space-y-4">
                    {/* Header Chips & Badges + Action Buttons */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Pinned Badge */}
                        {isPinned && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-blue-50 text-[#2563EB] border border-blue-200">
                            <Pin size={11} className="rotate-45" /> Pinned
                          </span>
                        )}

                        {/* Priority Badge */}
                        {isUrgent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-rose-50 text-[#DC2626] border border-rose-200">
                            <AlertTriangle size={11} /> Urgent
                          </span>
                        ) : isHigh ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide bg-amber-50 text-[#B45309] border border-amber-200">
                            <Sparkles size={11} /> High Priority
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
                            <Info size={11} /> General
                          </span>
                        )}

                        {/* Target Audience Pill */}
                        {notice.target_audience_type !== "all" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            <Users size={10} />
                            <span className="capitalize">
                              To: {notice.target_audience_value || notice.target_audience_type}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <Users size={10} />
                            <span>All Staff</span>
                          </span>
                        )}

                        {/* Expiry Date Badge */}
                        {notice.expires_at && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border",
                              isExpired
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            )}
                          >
                            <Clock size={10} />
                            <span>
                              {isExpired
                                ? `Expired: ${format(parseISO(notice.expires_at), "d MMM yyyy")}`
                                : `Expires: ${format(parseISO(notice.expires_at), "d MMM yyyy")}`}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Quick Actions Header for Management (Visible strictly to Admin) */}
                      {isAdmin && (
                        <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0 bg-blue-50/70 px-2 py-1 rounded-xl border border-blue-200/80">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 hidden md:inline">
                            Admin Only:
                          </span>

                          {/* 1. EDIT BUTTON */}
                          <button
                            type="button"
                            onClick={() => openEditModal(notice)}
                            title="Edit Notice (Admin Only - Hidden from regular staff)"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>

                          {/* 2. PIN / UNPIN BUTTON */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(notice)}
                            title={isPinned ? "Unpin notice (Admin Only)" : "Pin to top (Admin Only)"}
                            className={cn(
                              "p-1.5 rounded-lg border transition-colors cursor-pointer",
                              isPinned
                                ? "bg-blue-100 text-[#2563EB] border-blue-300 hover:bg-blue-200"
                                : "bg-white text-slate-500 border-blue-200 hover:text-slate-900 hover:bg-blue-50"
                            )}
                          >
                            <Pin size={13} className={isPinned ? "rotate-45" : ""} />
                          </button>

                          {/* 3. DELETE BUTTON */}
                          <button
                            type="button"
                            onClick={() => handleDeleteNotice(notice.id)}
                            title="Delete Notice (Admin Only)"
                            className="p-1.5 rounded-lg bg-white border border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Notice Title */}
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight leading-snug">
                        {notice.title}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-[#64748B] mt-1 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> {format(parseISO(notice.created_at), "d MMM yyyy, h:mm a")}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatDistanceToNow(parseISO(notice.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Notice Body Text */}
                    <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100 font-normal">
                      {notice.message}
                    </div>
                  </div>

                  {/* Card Bottom Action Bar */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Acknowledge Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleAcknowledge(notice.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer shadow-2xs",
                          isRead
                            ? "bg-emerald-50 text-[#16A34A] border border-emerald-200"
                            : "bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0]"
                        )}
                      >
                        {isRead ? (
                          <>
                            <CheckCheck size={13} className="text-[#16A34A]" />
                            <span>Acknowledged</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} className="text-slate-400" />
                            <span>Mark as Read</span>
                          </>
                        )}
                      </button>

                      {/* Prominent Edit Notice Option (Admin Only) */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openEditModal(notice)}
                          title="Edit this notice (Admin Only - Staff cannot edit)"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                        >
                          <Edit3 size={13} />
                          <span>Edit Notice</span>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                            Admin Only
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Social & Sharing Links */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleCopyNotice(notice)}
                        title="Copy announcement"
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E2E8F0] text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        {copiedId === notice.id ? (
                          <>
                            <Check size={12} className="text-[#16A34A]" />
                            <span className="text-[#16A34A]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} className="text-slate-500" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareToWhatsApp(notice)}
                        title="Share on WhatsApp group"
                        className="px-2.5 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Share2 size={12} />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. BROADCAST / EDIT NOTICE MODAL (FULL FEATURED MANAGER) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center shadow-2xs">
                  <Megaphone size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">
                      {editingNotice ? "Edit Announcement" : "Broadcast New Notice"}
                    </h3>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                      Admin Only
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B]">
                    Publish updates visible to all employees on their portal &amp; app (Staff can read &amp; acknowledge only)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveNotice} className="p-5 sm:p-6 space-y-4">
              {/* Preset Templates Shortcut */}
              {!editingNotice && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Quick Announcement Templates:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-[#2563EB] transition-colors border border-blue-200 cursor-pointer"
                      >
                        ⚡ {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F172A] block">
                  Notice Title <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Tomorrow Store Timings & Morning Prep"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="text-xs font-semibold"
                  required
                />
              </div>

              {/* Priority, Target Audience & Expiry Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Priority */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0F172A] block">Priority Level</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full text-xs font-medium border border-[#E2E8F0] rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="urgent">🚨 Urgent (Top Alert)</option>
                    <option value="high">⭐ High Priority</option>
                    <option value="normal">📌 Normal (Standard)</option>
                    <option value="low">ℹ️ Low / Info</option>
                  </select>
                </div>

                {/* Target Audience Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0F172A] block">Target Audience</label>
                  <select
                    value={formTargetType}
                    onChange={(e) => setFormTargetType(e.target.value as any)}
                    className="w-full text-xs font-medium border border-[#E2E8F0] rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="all">👥 All Employees</option>
                    <option value="department">🏢 By Department</option>
                    <option value="role">🛡️ By Staff Role</option>
                    <option value="employee">👤 Specific Employee</option>
                  </select>
                </div>

                {/* Expiry Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0F172A] block">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full text-xs font-medium border border-[#E2E8F0] rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              {/* Specific Audience Value if not 'all' */}
              {formTargetType !== "all" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0F172A] block">
                    {formTargetType === "role"
                      ? "Target Role (e.g. Senior Barista, Head Chef)"
                      : formTargetType === "department"
                      ? "Target Department (e.g. Kitchen, Front Desk, Housekeeping)"
                      : "Target Employee Email (e.g. staff@bftone.com)"}
                  </label>
                  <Input
                    type="text"
                    placeholder={
                      formTargetType === "role"
                        ? "e.g. Barista"
                        : formTargetType === "department"
                        ? "e.g. Kitchen"
                        : "e.g. employee@company.com"
                    }
                    value={formTargetValue}
                    onChange={(e) => setFormTargetValue(e.target.value)}
                    className="text-xs"
                  />
                </div>
              )}

              {/* Message Content */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F172A] block">
                  Announcement Message <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="Write clear instructions, details, timings, or policies for staff..."
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  className="w-full text-xs p-3 border border-[#E2E8F0] rounded-xl bg-white focus:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-y leading-relaxed font-normal"
                  required
                />
              </div>

              {/* Pin to Top Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Pin size={15} className="text-[#2563EB]" />
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">Pin to Top of Notice Board</span>
                    <span className="text-[10px] text-[#64748B]">Keep this notice pinned above other announcements</span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={formIsPinned}
                  onChange={(e) => setFormIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>{editingNotice ? "Save Changes" : "Publish Broadcast"}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
