"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  Plus,
  Trash2,
  Pin,
  Clock,
  Users,
  AlertTriangle,
  Sparkles,
  X,
  Loader2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";

async function getAuthHeaders() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  } catch {
    return { "Content-Type": "application/json" };
  }
}

interface NoticeItem {
  id: string;
  title: string;
  message: string;
  priority: "urgent" | "high" | "normal" | "low";
  target_audience_type: "all" | "role" | "department" | "employee";
  target_audience_value?: string | null;
  is_pinned: boolean;
  expires_at?: string | null;
  created_at: string;
}

interface NoticeBoardModalProps {
  open: boolean;
  onClose: () => void;
}

export function NoticeBoardModal({ open, onClose }: NoticeBoardModalProps) {
  const { toast } = useToast();

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    title: "",
    message: "",
    priority: "normal" as "urgent" | "high" | "normal" | "low",
    targetAudienceType: "all" as "all" | "role" | "department" | "employee",
    targetAudienceValue: "",
    isPinned: false,
    expiresAt: "",
  });

  const loadNotices = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/employee/hub-data", {
        headers: await getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        // The API returns notices
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
    } catch (e) {
      console.error("Failed to load notices:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadNotices();
    }
  }, [open]);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.message) {
      toast({ title: "Title and message are required", variant: "error" });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "create_notice",
          title: form.title,
          message: form.message,
          priority: form.priority,
          targetAudienceType: form.targetAudienceType,
          targetAudienceValue: form.targetAudienceValue || null,
          isPinned: form.isPinned,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to post notice");

      toast({ title: "Notice published successfully", variant: "success" });
      setIsCreating(false);
      setForm({
        title: "",
        message: "",
        priority: "normal",
        targetAudienceType: "all",
        targetAudienceValue: "",
        isPinned: false,
        expiresAt: "",
      });
      loadNotices();
    } catch (e: any) {
      toast({ title: "Error creating notice", description: e.message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    try {
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "delete_notice",
          noticeId,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete notice");
      }

      toast({ title: "Notice removed", variant: "success" });
      setNotices((prev) => prev.filter((n) => n.id !== noticeId));
    } catch (e: any) {
      toast({ title: "Error deleting notice", description: e.message, variant: "error" });
    }
  };

  const handleTogglePin = async (notice: NoticeItem) => {
    try {
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "update_notice",
          noticeId: notice.id,
          isPinned: !notice.is_pinned,
        }),
      });

      if (!res.ok) throw new Error("Failed to update notice");
      toast({
        title: notice.is_pinned ? "Notice unpinned" : "Notice pinned to top",
        variant: "success",
      });
      loadNotices();
    } catch (e: any) {
      toast({ title: "Error updating notice", description: e.message, variant: "error" });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center shadow-2xs">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">Employee Notice Board Manager</h3>
              <p className="text-xs text-[#64748B]">Publish and manage announcements for staff members</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-[#64748B]">
              {notices.length} Active {notices.length === 1 ? "Announcement" : "Announcements"}
            </div>
            {!isCreating && (
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
              >
                <Plus size={14} />
                <span>New Announcement</span>
              </Button>
            )}
          </div>

          {/* Create Announcement Form */}
          {isCreating && (
            <form
              onSubmit={handleCreateNotice}
              className="bg-slate-50 rounded-xl border border-blue-200 p-4 space-y-3.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB] flex items-center gap-1.5">
                  <Sparkles size={13} /> Create Announcement
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Notice Title *</label>
                <Input
                  type="text"
                  placeholder="e.g. Festival Announcement, Tomorrow's Opening Shift..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-white text-xs h-9.5"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Message Body *</label>
                <textarea
                  placeholder="Type the message for employees..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Priority */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e: any) => setForm({ ...form, priority: e.target.value })}
                    className="w-full h-9 text-xs rounded-lg border border-slate-200 bg-white px-2 text-slate-700 focus:outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="low">Info</option>
                  </select>
                </div>

                {/* Target Audience Type */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Audience</label>
                  <select
                    value={form.targetAudienceType}
                    onChange={(e: any) => setForm({ ...form, targetAudienceType: e.target.value })}
                    className="w-full h-9 text-xs rounded-lg border border-slate-200 bg-white px-2 text-slate-700 focus:outline-none"
                  >
                    <option value="all">All Employees</option>
                    <option value="role">Specific Role</option>
                    <option value="department">Specific Department</option>
                    <option value="employee">Specific Employee Email</option>
                  </select>
                </div>

                {/* Expiry Date */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Expiry (Optional)</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full h-9 text-xs rounded-lg border border-slate-200 bg-white px-2 text-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              {form.targetAudienceType !== "all" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">
                    Target {form.targetAudienceType === "role" ? "Role Name" : form.targetAudienceType === "department" ? "Department Name" : "Employee Email"}
                  </label>
                  <Input
                    type="text"
                    placeholder={`e.g. ${form.targetAudienceType === "role" ? "Senior Barista" : form.targetAudienceType === "department" ? "Operations" : "vasanth@bft.com"}`}
                    value={form.targetAudienceValue}
                    onChange={(e) => setForm({ ...form, targetAudienceValue: e.target.value })}
                    className="bg-white text-xs h-9"
                  />
                </div>
              )}

              {/* Pin Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Pin size={12} className="text-blue-600" /> Pin this announcement to top
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                  className="text-xs h-8.5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs h-8.5 gap-1.5"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  <span>{submitting ? "Publishing..." : "Publish Notice"}</span>
                </Button>
              </div>
            </form>
          )}

          {/* Notice List */}
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-blue-600" />
              <span className="text-xs">Loading announcements...</span>
            </div>
          ) : notices.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No notices published yet. Click "New Announcement" above to publish one.
            </div>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "p-4 rounded-xl border transition-all flex items-start justify-between gap-3",
                    n.is_pinned
                      ? "bg-blue-50/40 border-blue-200"
                      : "bg-white hover:bg-slate-50/60 border-slate-200"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {n.is_pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {n.priority}
                      </span>
                      {n.target_audience_type !== "all" && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          To: {n.target_audience_value || n.target_audience_type}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 ml-auto">
                        {new Date(n.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[#0F172A]">{n.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => handleTogglePin(n)}
                      title={n.is_pinned ? "Unpin notice" : "Pin notice"}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-xs",
                        n.is_pinned
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <Pin size={14} className={n.is_pinned ? "rotate-45" : ""} />
                    </button>

                    <button
                      onClick={() => handleDeleteNotice(n.id)}
                      title="Delete notice"
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Notices are immediately visible to eligible logged-in staff users.</span>
          <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
