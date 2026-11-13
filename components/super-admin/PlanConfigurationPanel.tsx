"use client";

import React, { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { SubscriptionPlan } from "@/lib/subscription/plans";
import {
  Plus,
  Edit3,
  CheckCircle2,
  XCircle,
  Infinity as InfinityIcon,
  ShieldCheck,
  Sparkles,
  Loader2,
  Users,
  Package,
} from "lucide-react";

interface PlanConfigurationPanelProps {
  plans: SubscriptionPlan[];
  onRefresh: () => Promise<void> | void;
}

export function PlanConfigurationPanel({ plans, onRefresh }: PlanConfigurationPanelProps) {
  const { toast } = useToast();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    plan_key: "",
    plan_name: "",
    monthly_price: "0",
    max_active_products: "5",
    is_unlimited_products: false,
    max_employee_seats: "0",
    support_level: "standard" as "standard" | "priority",
    is_active: true,
    entitlements_json: "{}",
  });

  function openEdit(plan: SubscriptionPlan) {
    setIsCreating(false);
    setEditingPlan(plan);
    setForm({
      plan_key: plan.plan_key,
      plan_name: plan.plan_name,
      monthly_price: String(plan.monthly_price ?? 0),
      max_active_products:
        plan.max_active_products === null ? "" : String(plan.max_active_products),
      is_unlimited_products: plan.max_active_products === null,
      max_employee_seats: String(plan.max_employee_seats ?? 0),
      support_level: plan.support_level === "priority" ? "priority" : "standard",
      is_active: plan.is_active !== false,
      entitlements_json: JSON.stringify(plan.feature_entitlements || {}, null, 2),
    });
  }

  function openCreate() {
    setEditingPlan(null);
    setIsCreating(true);
    setForm({
      plan_key: "",
      plan_name: "",
      monthly_price: "0",
      max_active_products: "50",
      is_unlimited_products: false,
      max_employee_seats: "10",
      support_level: "standard",
      is_active: true,
      entitlements_json: JSON.stringify({ store_admin_logins: 1, historical_sales_unlimited: true }, null, 2),
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    let parsedEntitlements: Record<string, any> = {};
    try {
      parsedEntitlements = JSON.parse(form.entitlements_json || "{}");
    } catch {
      toast({
        title: "Invalid Feature Entitlements JSON",
        description: "Please provide valid JSON for plan-level feature entitlements.",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const payload: any = {
        ...(editingPlan ? { id: editingPlan.id } : { plan_key: form.plan_key }),
        plan_name: form.plan_name,
        monthly_price: Number(form.monthly_price),
        is_unlimited_products: form.is_unlimited_products,
        max_active_products: form.is_unlimited_products
          ? null
          : Number(form.max_active_products || 0),
        max_employee_seats: Number(form.max_employee_seats || 0),
        support_level: form.support_level,
        is_active: form.is_active,
        feature_entitlements: parsedEntitlements,
      };

      const res = await fetch("/api/super-admin/plans", {
        method: editingPlan ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save plan configuration");
      }

      toast({
        title: editingPlan ? "Plan Updated" : "Plan Created",
        description: `${form.plan_name} configuration saved. Existing store snapshots remain preserved.`,
        variant: "success",
      });
      setEditingPlan(null);
      setIsCreating(false);
      await onRefresh();
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message || "Could not save plan configuration.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(plan: SubscriptionPlan) {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/super-admin/plans", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update plan status");
      toast({
        title: !plan.is_active ? "Plan Enabled" : "Plan Disabled",
        description: !plan.is_active
          ? `${plan.plan_name} is now available for new assignments.`
          : `${plan.plan_name} is disabled for new assignments. Existing subscriptions continue unaffected.`,
        variant: "success",
      });
      await onRefresh();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#0F172A]">
            Global Subscription Plans
          </h2>
          <p className="text-xs text-[#64748B]">
            Configure default pricing, active product limits, employee login seats, and support tiers. Existing customer agreements keep their snapshotted terms.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs h-9 px-4 gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus size={15} />
          <span>New Plan</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between gap-4 transition-all",
              plan.is_active
                ? "border-[#E2E8F0] hover:border-[#2563EB]/40"
                : "border-slate-200 bg-slate-50/70 opacity-75"
            )}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
                    {plan.plan_key}
                  </span>
                  <h3 className="text-lg font-extrabold text-[#0F172A]">{plan.plan_name}</h3>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                    plan.is_active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  )}
                >
                  {plan.is_active ? "Active" : "Disabled"}
                </span>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#0F172A]">
                  ₹{Number(plan.monthly_price).toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-medium text-[#64748B]">/ month</span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <Package size={13} /> Active Products
                  </span>
                  <span className="font-bold text-[#0F172A] flex items-center gap-1">
                    {plan.max_active_products === null ? (
                      <>
                        <InfinityIcon size={14} className="text-[#2563EB]" /> Unlimited
                      </>
                    ) : (
                      plan.max_active_products
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <Users size={13} /> Employee Logins
                  </span>
                  <span className="font-bold text-[#0F172A]">{plan.max_employee_seats}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <ShieldCheck size={13} /> Store Admin Login
                  </span>
                  <span className="font-bold text-[#0F172A]">1 (Included)</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <Sparkles size={13} /> Support
                  </span>
                  <span
                    className={cn(
                      "font-bold capitalize",
                      plan.support_level === "priority" ? "text-amber-600" : "text-[#0F172A]"
                    )}
                  >
                    {plan.support_level}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(plan)}
                className="flex-1 rounded-xl text-xs h-8 gap-1 cursor-pointer"
              >
                <Edit3 size={13} /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleActive(plan)}
                className={cn(
                  "rounded-xl text-xs h-8 gap-1 cursor-pointer",
                  plan.is_active
                    ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                    : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                )}
              >
                {plan.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                {plan.is_active ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Plan Modal */}
      {(editingPlan || isCreating) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#0F172A]">
                  {editingPlan ? `Edit ${editingPlan.plan_name} Plan` : "Create Subscription Plan"}
                </h3>
                <p className="text-xs text-[#64748B]">
                  Changes apply to new assignments; existing store snapshots are preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPlan(null);
                  setIsCreating(false);
                }}
                className="text-[#64748B] hover:text-[#0F172A] font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!editingPlan && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#0F172A]">Plan Key *</label>
                    <Input
                      value={form.plan_key}
                      onChange={(e) => setForm((p) => ({ ...p, plan_key: e.target.value }))}
                      placeholder="e.g. enterprise"
                      required
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                )}
                <div className={cn("space-y-1", editingPlan && "sm:col-span-2")}>
                  <label className="text-xs font-bold text-[#0F172A]">Plan Name *</label>
                  <Input
                    value={form.plan_name}
                    onChange={(e) => setForm((p) => ({ ...p, plan_name: e.target.value }))}
                    required
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Monthly Price (₹) *</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monthly_price}
                    onChange={(e) => setForm((p) => ({ ...p, monthly_price: e.target.value }))}
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Employee Login Seats *</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.max_employee_seats}
                    onChange={(e) => setForm((p) => ({ ...p, max_employee_seats: e.target.value }))}
                    required
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#0F172A]">Active Product Limit</label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_unlimited_products}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, is_unlimited_products: e.target.checked }))
                        }
                        className="rounded text-[#2563EB]"
                      />
                      Unlimited
                    </label>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    disabled={form.is_unlimited_products}
                    value={form.is_unlimited_products ? "" : form.max_active_products}
                    placeholder={form.is_unlimited_products ? "Unlimited" : "e.g. 250"}
                    onChange={(e) => setForm((p) => ({ ...p, max_active_products: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Customer Support Level</label>
                  <select
                    value={form.support_level}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        support_level: e.target.value === "priority" ? "priority" : "standard",
                      }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-[#E2E8F0] text-xs font-semibold bg-white"
                  >
                    <option value="standard">Standard Support</option>
                    <option value="priority">Priority Support</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">
                  Feature Entitlements (JSON)
                </label>
                <textarea
                  rows={3}
                  value={form.entitlements_json}
                  onChange={(e) => setForm((p) => ({ ...p, entitlements_json: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-[#E2E8F0] text-xs font-mono bg-slate-50"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  className="rounded text-[#2563EB]"
                />
                Plan enabled for new store assignments
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingPlan(null);
                    setIsCreating(false);
                  }}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs px-5 cursor-pointer"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : "Save Plan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

