"use client";

import React, { useState, useEffect } from "react";
import {
  Award,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  X,
  Loader2,
  Calendar,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { STANDARD_ACHIEVEMENTS_CATALOG } from "@/lib/services/employeeHubService";
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

interface EmployeeAchievementsModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  userName?: string | null;
}

export function EmployeeAchievementsModal({
  open,
  onClose,
  userId,
  userEmail,
  userName,
}: EmployeeAchievementsModalProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [form, setForm] = useState({
    badgeKey: "first_year",
    title: "1 Year Milestone",
    description: "Completed your first 365 days of exemplary contribution.",
    category: "tenure",
    achievedDate: new Date().toISOString().slice(0, 10),
  });

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/employee/hub-data?userId=${encodeURIComponent(userId)}`, {
        headers: await getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.achievements) {
          setAchievements(json.achievements);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && userId) {
      loadAchievements();
    }
  }, [open, userId]);

  const handleSelectPreset = (key: string) => {
    const found = STANDARD_ACHIEVEMENTS_CATALOG.find((c) => c.badgeKey === key);
    if (found) {
      setForm({
        ...form,
        badgeKey: found.badgeKey,
        title: found.title,
        description: found.description,
        category: found.category,
      });
    }
  };

  const handleAwardAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "award_achievement",
          userId,
          badgeKey: form.badgeKey,
          title: form.title,
          description: form.description,
          category: form.category,
          achievedDate: form.achievedDate,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to award achievement");

      toast({ title: `Awarded "${form.title}" successfully!`, variant: "success" });
      setIsAdding(false);
      loadAchievements();
    } catch (e: any) {
      toast({ title: "Error awarding badge", description: e.message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAchievement = async (achievementId: string) => {
    try {
      const res = await fetch("/api/admin/employee-hub", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "delete_achievement",
          achievementId,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }

      toast({ title: "Achievement revoked", variant: "success" });
      loadAchievements();
    } catch (e: any) {
      toast({ title: "Error deleting", description: e.message, variant: "error" });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center shadow-2xs">
              <Award size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">Employee Badges & Achievements</h3>
              <p className="text-xs text-[#64748B]">
                Managing recognitions for: <strong className="text-[#0F172A] capitalize">{userName || userEmail}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#64748B]">
              Recognitions Catalog & Current Status
            </span>
            {!isAdding && (
              <Button
                size="sm"
                onClick={() => setIsAdding(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
              >
                <Plus size={14} />
                <span>Award Badge</span>
              </Button>
            )}
          </div>

          {/* Add Form */}
          {isAdding && (
            <form
              onSubmit={handleAwardAchievement}
              className="bg-amber-50/50 rounded-xl border border-amber-200 p-4 space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600" /> Award New Achievement
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>

              {/* Preset Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Choose Badge Type</label>
                <select
                  value={form.badgeKey}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full h-9.5 text-xs rounded-lg border border-slate-200 bg-white px-2.5 text-slate-800 focus:outline-none"
                >
                  {STANDARD_ACHIEVEMENTS_CATALOG.map((item) => (
                    <option key={item.badgeKey} value={item.badgeKey}>
                      {item.emoji} {item.title} ({item.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Badge Title</label>
                <Input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-white text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Description / Criteria</label>
                <Input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-white text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Date Achieved</label>
                <input
                  type="date"
                  value={form.achievedDate}
                  onChange={(e) => setForm({ ...form, achievedDate: e.target.value })}
                  className="w-full h-9 text-xs rounded-lg border border-slate-200 bg-white px-2.5 text-slate-800 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAdding(false)}
                  className="text-xs h-8.5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-8.5 gap-1.5"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  <span>Save & Unlock</span>
                </Button>
              </div>
            </form>
          )}

          {/* Achievements Grid */}
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-amber-600" />
              <span className="text-xs">Loading employee achievements...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={cn(
                    "p-3.5 rounded-xl border flex items-start gap-3 transition-all",
                    ach.isUnlocked
                      ? "bg-amber-50/30 border-amber-200 shadow-2xs"
                      : "bg-slate-50 border-slate-200 opacity-60"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                    {ach.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-[#0F172A] truncate">{ach.title}</h4>
                      {ach.isUnlocked ? (
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      ) : (
                        <Lock size={12} className="text-slate-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{ach.description}</p>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {ach.isUnlocked ? (
                        <span className="text-emerald-700 font-semibold">
                          Earned: {ach.achievedDate || "Yes"}
                        </span>
                      ) : (
                        "Locked"
                      )}
                    </div>
                  </div>

                  {ach.isUnlocked && ach.id && !ach.id.startsWith("derived_") && (
                    <button
                      onClick={() => handleDeleteAchievement(ach.id)}
                      title="Revoke badge"
                      className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Unlocked badges display on the staff member's Employee Hub immediately.</span>
          <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
