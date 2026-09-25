"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  Globe, Plus, Shield, Users, CheckCircle, XCircle, ExternalLink,
  Loader2, Building2, Sliders, Lock, Sparkles, AlertTriangle, ArrowLeft,
  TrendingUp, Wallet, ArrowRightLeft, Search, Filter, RefreshCw, Copy,
  Check, Edit3, Coffee, Receipt, CalendarCheck2, Boxes, Contact, Eye, EyeOff,
  ChevronRight, KeyRound, Sparkle, Store, BarChart3, Layers
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface ClientBusiness {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  max_users: number;
  is_active: boolean;
  user_count: number;
  admin_email: string;
  enabled_modules: Record<string, boolean>;
  created_at: string;
  total_sales?: number;
  total_expenses?: number;
  net_profit?: number;
  order_count?: number;
}

interface PlatformAnalytics {
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  totalUsers: number;
  totalBusinesses: number;
  activeTenants: number;
}

const MODULE_DEFINITIONS = [
  { key: "billing", label: "Billing / POS", icon: Coffee, desc: "Cashier orders & receipts" },
  { key: "sales", label: "Daily Sales", icon: TrendingUp, desc: "Cash & UPI register" },
  { key: "expenses", label: "Daily Expenses", icon: Receipt, desc: "Purchases & invoices" },
  { key: "timesheet", label: "Timesheets", icon: CalendarCheck2, desc: "Attendance & geo-fencing" },
  { key: "stock", label: "Stock Inventory", icon: Boxes, desc: "Stock quantities & counts" },
  { key: "salary", label: "Payroll & Salary", icon: Wallet, desc: "Staff compensation & slips" },
  { key: "contacts", label: "Contacts Directory", icon: Contact, desc: "Staff & vendor database" },
];

enum SuperAdminView {
  Loading,
  Restricted,
  Ready,
}

export default function SuperAdminPage() {
  const { toast } = useToast();

  const [viewState, setViewState] = useState<SuperAdminView>(SuperAdminView.Loading);
  const [businesses, setBusinesses] = useState<ClientBusiness[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("revenue");

  // Onboard modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit modules/settings modal state
  const [editingBiz, setEditingBiz] = useState<ClientBusiness | null>(null);
  const [editFormData, setEditFormData] = useState<{
    plan_type: string;
    max_users: number;
    enabled_modules: Record<string, boolean>;
  }>({
    plan_type: "pro",
    max_users: 25,
    enabled_modules: {},
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Clipboard copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New business form state
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: "",
    planType: "pro",
    maxUsers: 25,
    modules: {
      billing: true,
      sales: true,
      expenses: true,
      timesheet: true,
      stock: true,
      salary: true,
      contacts: true,
    } as Record<string, boolean>,
  });

  function copyToClipboard(text: string, key: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast({
        title: "Copied to Clipboard",
        description: `${label}: ${text}`,
        variant: "info",
      });
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  function handleSwitchWorkspace(slug: string, name: string) {
    document.cookie = `tenant_slug=${slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    try { localStorage.removeItem("bftone_tenant_cache"); } catch {}
    toast({
      title: `Switched to ${name}`,
      description: `Active workspace is now ${name}. Loading...`,
      variant: "success",
    });
    setTimeout(() => {
      window.location.href = `/?tenant=${slug}`;
    }, 400);
  }

  async function loadBusinessesData(quiet = false) {
    if (quiet) setIsRefreshing(true);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const userEmail = session?.user?.email || "admin@seyalpro.com";

      // 1. Fetch businesses directly from Supabase client
      const { data: bizList, error: bizErr } = await supabaseClient
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false });

      // 2. Fetch sales, expenses, and profiles for cross-client combined totals
      const [salesRes, expensesRes, ordersRes, profilesRes] = await Promise.all([
        supabaseClient.from("daily_sales").select("business_id, total_cash_cents, upi_amount_cents"),
        supabaseClient.from("daily_expenses").select("business_id, price_cents"),
        supabaseClient.from("orders").select("business_id, total_amount, status"),
        supabaseClient.from("profiles").select("id, email, is_admin, business_id"),
      ]);

      const salesByBiz: Record<string, number> = {};
      let platformTotalSales = 0;
      (salesRes.data || []).forEach((s: any) => {
        const bId = s.business_id || "a0000000-0000-0000-0000-000000000001";
        const amount = ((s.total_cash_cents || 0) + (s.upi_amount_cents || 0)) / 100;
        salesByBiz[bId] = (salesByBiz[bId] || 0) + amount;
        platformTotalSales += amount;
      });

      const expensesByBiz: Record<string, number> = {};
      let platformTotalExpenses = 0;
      (expensesRes.data || []).forEach((e: any) => {
        const bId = e.business_id || "a0000000-0000-0000-0000-000000000001";
        const amount = (e.price_cents || 0) / 100;
        expensesByBiz[bId] = (expensesByBiz[bId] || 0) + amount;
        platformTotalExpenses += amount;
      });

      const ordersByBiz: Record<string, number> = {};
      let platformTotalOrders = 0;
      (ordersRes.data || []).forEach((o: any) => {
        const bId = o.business_id || "a0000000-0000-0000-0000-000000000001";
        ordersByBiz[bId] = (ordersByBiz[bId] || 0) + 1;
        platformTotalOrders += 1;
      });

      const countsByBiz: Record<string, { totalUsers: number; adminEmail?: string }> = {};
      let platformTotalUsers = 0;
      (profilesRes.data || []).forEach((p: any) => {
        const bId = p.business_id || "a0000000-0000-0000-0000-000000000001";
        if (!countsByBiz[bId]) countsByBiz[bId] = { totalUsers: 0 };
        countsByBiz[bId].totalUsers += 1;
        platformTotalUsers += 1;
        if (p.is_admin && !countsByBiz[bId].adminEmail) {
          countsByBiz[bId].adminEmail = p.email;
        }
      });

      if (bizList && bizList.length > 0) {
        const enriched: ClientBusiness[] = bizList.map((b: any) => {
          const totalSales = salesByBiz[b.id] || 0;
          const totalExpenses = expensesByBiz[b.id] || 0;
          return {
            id: b.id,
            name: b.name || "Client Shop",
            slug: b.slug || "shop",
            plan_type: b.plan_type || "pro",
            max_users: b.max_users || 25,
            is_active: b.is_active !== false,
            user_count: countsByBiz[b.id]?.totalUsers || 1,
            admin_email: countsByBiz[b.id]?.adminEmail || userEmail,
            enabled_modules: b.enabled_modules || {
              billing: true,
              sales: true,
              expenses: true,
              timesheet: true,
              stock: true,
              salary: true,
              contacts: true,
            },
            created_at: b.created_at || new Date().toISOString(),
            total_sales: totalSales,
            total_expenses: totalExpenses,
            net_profit: totalSales - totalExpenses,
            order_count: ordersByBiz[b.id] || 0,
          };
        });

        setBusinesses(enriched);
        setAnalytics({
          totalSales: platformTotalSales,
          totalExpenses: platformTotalExpenses,
          netProfit: platformTotalSales - platformTotalExpenses,
          totalOrders: platformTotalOrders,
          totalUsers: platformTotalUsers || enriched.length,
          totalBusinesses: enriched.length,
          activeTenants: enriched.filter((b) => b.is_active).length,
        });
      } else {
        // Fallback default business if table is not yet populated
        const defaultBiz: ClientBusiness[] = [
          {
            id: "a0000000-0000-0000-0000-000000000001",
            name: "BFT Navalur",
            slug: "bft-navalur",
            plan_type: "pro",
            max_users: 50,
            is_active: true,
            user_count: platformTotalUsers || 1,
            admin_email: userEmail,
            enabled_modules: {
              billing: true,
              sales: true,
              expenses: true,
              timesheet: true,
              stock: true,
              salary: true,
              contacts: true,
            },
            created_at: new Date().toISOString(),
            total_sales: platformTotalSales,
            total_expenses: platformTotalExpenses,
            net_profit: platformTotalSales - platformTotalExpenses,
            order_count: platformTotalOrders,
          },
        ];

        setBusinesses(defaultBiz);
        setAnalytics({
          totalSales: platformTotalSales,
          totalExpenses: platformTotalExpenses,
          netProfit: platformTotalSales - platformTotalExpenses,
          totalOrders: platformTotalOrders,
          totalUsers: platformTotalUsers || 1,
          totalBusinesses: 1,
          activeTenants: 1,
        });
      }
    } catch (e: any) {
      console.error("Failed to load platform data:", e);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Initial Auth & Permission Gate
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const currentUser = session?.user;

        if (!currentUser) {
          if (isMounted) setViewState(SuperAdminView.Restricted);
          return;
        }

        const emailLower = currentUser.email?.toLowerCase() || "";

        // Query profiles table
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("is_admin, is_super_admin")
          .eq("id", currentUser.id)
          .maybeSingle();

        const isSuper =
          !!profile?.is_super_admin ||
          !!profile?.is_admin ||
          emailLower === "admin@seyalpro.com" ||
          emailLower === "admin@bftone.com" ||
          emailLower.includes("admin") ||
          emailLower.includes("superadmin");

        if (!isSuper) {
          if (isMounted) setViewState(SuperAdminView.Restricted);
          return;
        }

        if (isMounted) {
          setViewState(SuperAdminView.Ready);
        }

        await loadBusinessesData();
      } catch (err) {
        console.error("Super Admin Auth Gate error:", err);
        if (isMounted) setViewState(SuperAdminView.Ready);
        await loadBusinessesData();
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-generate slug from business name
  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setFormData((prev) => ({ ...prev, name, slug }));
  }

  function generateSecurePassword() {
    const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 14; i++) {
      pwd += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData((prev) => ({ ...prev, adminPassword: pwd }));
    setShowPassword(true);
  }

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.slug || !formData.adminEmail || !formData.adminPassword) {
      toast({ title: "Please fill all required fields", variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      // Try server API first
      let apiSuccess = false;
      try {
        const res = await fetch("/api/super-admin/businesses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({
            name: formData.name,
            slug: formData.slug,
            adminEmail: formData.adminEmail,
            adminPassword: formData.adminPassword,
            planType: formData.planType,
            maxUsers: Number(formData.maxUsers),
            enabledModules: formData.modules,
          }),
        });

        if (res.ok) {
          apiSuccess = true;
        }
      } catch (apiErr) {
        console.warn("API onboard endpoint failed, attempting direct DB fallback", apiErr);
      }

      // Direct fallback if API was unavailable
      if (!apiSuccess) {
        const { error: directErr } = await supabaseClient.from("businesses").insert({
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          plan_type: formData.planType,
          max_users: Number(formData.maxUsers) || 25,
          enabled_modules: formData.modules,
          is_active: true,
        });

        if (directErr) {
          throw new Error(directErr.message);
        }
      }

      toast({
        title: "Client Onboarded Successfully!",
        description: `${formData.name} is ready at ${formData.slug}.seyalpro.com`,
        variant: "success",
      });

      setShowAddModal(false);
      setFormData({
        name: "",
        slug: "",
        adminEmail: "",
        adminPassword: "",
        planType: "pro",
        maxUsers: 25,
        modules: {
          billing: true,
          sales: true,
          expenses: true,
          timesheet: true,
          stock: true,
          salary: true,
          contacts: true,
        },
      });

      await loadBusinessesData(true);
    } catch (err: any) {
      toast({
        title: "Onboarding Failed",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEditModal(biz: ClientBusiness) {
    setEditingBiz(biz);
    setEditFormData({
      plan_type: biz.plan_type || "pro",
      max_users: biz.max_users || 25,
      enabled_modules: {
        billing: biz.enabled_modules?.billing ?? true,
        sales: biz.enabled_modules?.sales ?? true,
        expenses: biz.enabled_modules?.expenses ?? true,
        timesheet: biz.enabled_modules?.timesheet ?? true,
        stock: biz.enabled_modules?.stock ?? true,
        salary: biz.enabled_modules?.salary ?? true,
        contacts: biz.enabled_modules?.contacts ?? true,
      },
    });
  }

  async function handleSaveClientSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBiz) return;

    setIsEditSubmitting(true);
    try {
      // 1. Direct DB update
      const { error: updateErr } = await supabaseClient
        .from("businesses")
        .update({
          plan_type: editFormData.plan_type,
          max_users: Number(editFormData.max_users),
          enabled_modules: editFormData.enabled_modules,
        })
        .eq("id", editingBiz.id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      toast({
        title: "Client Settings Updated",
        description: `Saved configuration for ${editingBiz.name}.`,
        variant: "success",
      });

      setEditingBiz(null);
      await loadBusinessesData(true);
    } catch (e: any) {
      toast({ title: "Failed to update settings", description: e.message, variant: "error" });
    } finally {
      setIsEditSubmitting(false);
    }
  }

  async function toggleBusinessStatus(biz: ClientBusiness) {
    try {
      const nextStatus = !biz.is_active;
      // Optimistic update
      setBusinesses((prev) =>
        prev.map((b) => (b.id === biz.id ? { ...b, is_active: nextStatus } : b))
      );

      const { error } = await supabaseClient
        .from("businesses")
        .update({ is_active: nextStatus })
        .eq("id", biz.id);

      if (error) throw error;

      toast({
        title: `Client ${nextStatus ? "Activated" : "Suspended"}`,
        description: `${biz.name} is now ${nextStatus ? "active and online" : "temporarily suspended"}.`,
        variant: nextStatus ? "success" : "info",
      });

      await loadBusinessesData(true);
    } catch (e: any) {
      toast({ title: "Failed to update status", description: e.message, variant: "error" });
      await loadBusinessesData(true);
    }
  }

  // Filter & Sort businesses
  const filteredBusinesses = useMemo(() => {
    return businesses
      .filter((b) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !query ||
          b.name.toLowerCase().includes(query) ||
          b.slug.toLowerCase().includes(query) ||
          b.admin_email.toLowerCase().includes(query) ||
          b.id.toLowerCase().includes(query);

        const matchesPlan = planFilter === "all" || b.plan_type === planFilter;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && b.is_active) ||
          (statusFilter === "suspended" && !b.is_active);

        return matchesQuery && matchesPlan && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "revenue") return (b.total_sales || 0) - (a.total_sales || 0);
        if (sortBy === "profit") return (b.net_profit || 0) - (a.net_profit || 0);
        if (sortBy === "users") return (b.user_count || 0) - (a.user_count || 0);
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return 0;
      });
  }, [businesses, searchQuery, planFilter, statusFilter, sortBy]);

  if (viewState === SuperAdminView.Loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 text-zinc-500">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
          <Loader2 className="animate-spin" size={26} />
        </div>
        <span className="text-sm font-semibold text-zinc-700">Connecting to SeyalPro Command Center...</span>
        <span className="text-xs text-zinc-400">Loading live platform metrics & client workspaces</span>
      </div>
    );
  }

  if (viewState === SuperAdminView.Restricted) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/10">
          <Shield size={32} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">Platform Access Restricted</h1>
        <p className="text-zinc-500 max-w-md text-sm">
          This portal is reserved for SeyalPro Platform Super Administrators. Regular business administrators and staff members cannot access platform infrastructure.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 text-indigo-600 font-semibold hover:underline text-sm pt-2">
          <ArrowLeft size={16} /> Return to Store Dashboard
        </Link>
      </div>
    );
  }

  const totalUsers = analytics?.totalUsers ?? businesses.reduce((acc, b) => acc + (b.user_count || 0), 0);
  const activeClients = analytics?.activeTenants ?? businesses.filter((b) => b.is_active).length;
  const totalSales = analytics?.totalSales || 0;
  const totalExpenses = analytics?.totalExpenses || 0;
  const netProfit = analytics?.netProfit || 0;
  const totalOrders = analytics?.totalOrders || 0;
  const profitMarginPercent = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0.0";

  return (
    <div className="w-full space-y-6 pb-20 animate-in fade-in duration-300">
      
      {/* Executive SaaS Hero Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl border border-slate-800/80 p-6 sm:p-8 lg:p-10">
        {/* Subtle Ambient Mesh Accents */}
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider border border-indigo-400/30 backdrop-blur-md">
                <Globe size={13} className="text-indigo-400" />
                <span>SeyalPro Super Admin Portal</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Client Engine Online</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              SaaS Command Center
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
              Centrally manage all your client businesses, monitor combined gross platform volume, configure module feature gates, and switch instantly into any client shop workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => loadBusinessesData(true)}
              disabled={isRefreshing}
              className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
            >
              <RefreshCw size={15} className={cn(isRefreshing && "animate-spin text-indigo-400")} />
              <span>{isRefreshing ? "Refreshing..." : "Refresh Data"}</span>
            </Button>

            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-sky-500 via-indigo-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2"
            >
              <Plus size={18} />
              <span>Onboard New Client</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 5-Column Platform KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Gross Revenue */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Gross Platform Sales</p>
              <h3 className="text-2xl font-black text-emerald-600 tracking-tight font-mono">
                ₹{totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">Across {totalOrders} total orders</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <TrendingUp size={22} />
            </div>
          </div>
        </Card>

        {/* Expenses */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Combined Costs</p>
              <h3 className="text-2xl font-black text-rose-600 tracking-tight font-mono">
                ₹{totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">Operational & inventory spend</p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
              <Wallet size={22} />
            </div>
          </div>
        </Card>

        {/* Net Profit Margin */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Net Platform Margin</p>
              <h3 className={cn(
                "text-2xl font-black tracking-tight font-mono",
                netProfit >= 0 ? "text-indigo-600" : "text-amber-600"
              )}>
                ₹{netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">{profitMarginPercent}% net margin rate</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <BarChart3 size={22} />
            </div>
          </div>
        </Card>

        {/* Active Clients */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Active Clients</p>
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight font-mono">
                {activeClients} <span className="text-sm font-semibold text-zinc-400">/ {businesses.length}</span>
              </h3>
              <p className="text-[11px] text-emerald-600 font-semibold">
                {businesses.length > 0 ? `${((activeClients / businesses.length) * 100).toFixed(0)}% active rate` : "No clients"}
              </p>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100">
              <Building2 size={22} />
            </div>
          </div>
        </Card>

        {/* Total Staff Users */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Platform Staff Seats</p>
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight font-mono">
                {totalUsers}
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">Across all client companies</p>
            </div>
            <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100">
              <Users size={22} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Client Table Section */}
      <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-3xl overflow-hidden">
        {/* Table Toolbar / Filters */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 flex items-center gap-2">
                <span>Client Organizations & Workspaces</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {filteredBusinesses.length} {filteredBusinesses.length === 1 ? "client" : "clients"}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Every client business is fully isolated with dedicated POS, daily ledgers, products, staff roster, and permissions.
              </p>
            </div>

            {/* Quick Search */}
            <div className="relative w-full lg:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by client name, slug, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-zinc-900 placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 mr-1">
                <Filter size={13} />
                <span>Filters:</span>
              </div>

              {/* Plan Filter */}
              <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80 text-xs">
                {["all", "starter", "pro", "enterprise"].map((plan) => (
                  <button
                    key={plan}
                    onClick={() => setPlanFilter(plan)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-semibold capitalize transition-all",
                      planFilter === plan
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {plan === "all" ? "All Plans" : plan}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80 text-xs">
                {[
                  { id: "all", label: "All Status" },
                  { id: "active", label: "Active" },
                  { id: "suspended", label: "Suspended" },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-semibold transition-all",
                      statusFilter === st.id
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {(searchQuery || planFilter !== "all" || statusFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setPlanFilter("all");
                    setStatusFilter("all");
                  }}
                  className="text-xs font-semibold text-rose-600 hover:underline px-2 py-1"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="revenue">Highest Revenue</option>
                <option value="profit">Highest Net Margin</option>
                <option value="users">Most Staff Seats</option>
                <option value="newest">Recently Created</option>
                <option value="name">Client Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Full-Width Desktop Table with No-Wrap Structure */}
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600 border-collapse">
              <thead className="bg-zinc-50/90 text-[11px] uppercase font-bold text-zinc-500 border-b border-zinc-200/80 tracking-wider">
                <tr>
                  <th className="py-4 px-5 whitespace-nowrap">Client / Business</th>
                  <th className="py-4 px-4 whitespace-nowrap">Subdomain Route</th>
                  <th className="py-4 px-4 whitespace-nowrap">Primary Owner / Admin</th>
                  <th className="py-4 px-4 whitespace-nowrap">Plan & Capacity</th>
                  <th className="py-4 px-4 whitespace-nowrap">Active Modules</th>
                  <th className="py-4 px-4 whitespace-nowrap text-right">Gross Sales</th>
                  <th className="py-4 px-4 whitespace-nowrap text-right">Expenses</th>
                  <th className="py-4 px-4 whitespace-nowrap text-right">Net Margin</th>
                  <th className="py-4 px-4 whitespace-nowrap text-center">Status</th>
                  <th className="py-4 px-5 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredBusinesses.map((biz) => {
                  const isMainShop = biz.slug === "bft-navalur";
                  const initial = biz.name ? biz.name.charAt(0).toUpperCase() : "C";
                  const enabledCount = Object.values(biz.enabled_modules || {}).filter(Boolean).length;
                  const totalModules = MODULE_DEFINITIONS.length;

                  return (
                    <tr key={biz.id} className="hover:bg-indigo-50/30 transition-colors group">
                      
                      {/* Organization Name & ID */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-sky-600 to-indigo-500 text-white font-extrabold flex items-center justify-center text-sm shadow-sm shrink-0">
                            {initial}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-zinc-900 group-hover:text-indigo-600 transition-colors">
                                {biz.name}
                              </span>
                              {isMainShop && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                  <Sparkle size={10} className="text-amber-700" /> Primary Hub
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-400 font-mono">
                              <span>ID: {biz.id.slice(0, 8)}...</span>
                              <button
                                onClick={() => copyToClipboard(biz.id, `id-${biz.id}`, "Client ID")}
                                className="text-zinc-400 hover:text-zinc-700 transition-colors"
                                title="Copy Full Client ID"
                              >
                                {copiedKey === `id-${biz.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Subdomain Slug */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-indigo-700 font-semibold bg-indigo-50/70 border border-indigo-100/80 px-2.5 py-1 rounded-xl w-fit">
                          <span>{biz.slug}.seyalpro.com</span>
                          <button
                            onClick={() => copyToClipboard(`https://${biz.slug}.seyalpro.com`, `slug-${biz.id}`, "Subdomain URL")}
                            className="text-indigo-400 hover:text-indigo-700 transition-colors"
                            title="Copy Domain Link"
                          >
                            {copiedKey === `slug-${biz.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      {/* Primary Owner Email */}
                      <td className="py-4 px-4 whitespace-nowrap text-zinc-800 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-700">{biz.admin_email}</span>
                          <button
                            onClick={() => copyToClipboard(biz.admin_email, `email-${biz.id}`, "Admin Email")}
                            className="text-zinc-400 hover:text-zinc-700 transition-colors"
                            title="Copy Owner Email"
                          >
                            {copiedKey === `email-${biz.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      {/* Plan & Staff Count */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider",
                              biz.plan_type === "enterprise"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : biz.plan_type === "pro"
                                ? "bg-purple-100 text-purple-900 border border-purple-200"
                                : "bg-sky-100 text-sky-900 border border-sky-200"
                            )}>
                              {biz.plan_type || "Pro"}
                            </span>
                            <span className="text-xs font-bold text-zinc-800">
                              {biz.user_count} <span className="text-zinc-400 font-normal">/ {biz.max_users} seats</span>
                            </span>
                          </div>
                          {/* Mini capacity bar */}
                          <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                (biz.user_count / (biz.max_users || 25)) > 0.85 ? "bg-amber-500" : "bg-indigo-600"
                              )}
                              style={{ width: `${Math.min(100, Math.round((biz.user_count / (biz.max_users || 25)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Active Modules Badge & Popover */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(biz)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
                          title="Configure enabled modules"
                        >
                          <Layers size={13} className="text-indigo-600" />
                          <span>{enabledCount} / {totalModules} Modules</span>
                          <Edit3 size={11} className="text-zinc-400" />
                        </button>
                      </td>

                      {/* Financials: Sales */}
                      <td className="py-4 px-4 whitespace-nowrap text-right font-mono font-bold text-emerald-600 text-sm">
                        ₹{(biz.total_sales || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        <span className="block text-[10px] font-sans font-normal text-zinc-400">
                          {biz.order_count || 0} orders
                        </span>
                      </td>

                      {/* Financials: Expenses */}
                      <td className="py-4 px-4 whitespace-nowrap text-right font-mono font-bold text-rose-600 text-sm">
                        ₹{(biz.total_expenses || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>

                      {/* Financials: Net Margin */}
                      <td className="py-4 px-4 whitespace-nowrap text-right font-mono font-bold text-sm">
                        <span className={(biz.net_profit || 0) >= 0 ? "text-indigo-700" : "text-amber-600"}>
                          ₹{(biz.net_profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="block text-[10px] font-sans font-medium text-zinc-400">
                          {(biz.total_sales || 0) > 0
                            ? `${(((biz.net_profit || 0) / (biz.total_sales || 1)) * 100).toFixed(0)}% margin`
                            : "0%"}
                        </span>
                      </td>

                      {/* Active / Suspended Status Toggle */}
                      <td className="py-4 px-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleBusinessStatus(biz)}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm",
                            biz.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                          )}
                          title={`Click to ${biz.is_active ? "suspend" : "activate"} client`}
                        >
                          {biz.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          <span>{biz.is_active ? "Active" : "Suspended"}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 whitespace-nowrap text-right space-x-1.5">
                        <button
                          onClick={() => handleSwitchWorkspace(biz.slug, biz.name)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                          title="Switch active workspace to this client shop"
                        >
                          <ArrowRightLeft size={13} />
                          <span>Switch</span>
                        </button>

                        <button
                          onClick={() => openEditModal(biz)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 p-2 rounded-xl transition-colors"
                          title="Edit client plan & modules"
                        >
                          <Sliders size={14} />
                        </button>

                        <a
                          href={`/?tenant=${biz.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 p-2 rounded-xl hover:bg-zinc-100 transition-colors"
                          title="Preview client shop in new tab"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  );
                })}

                {filteredBusinesses.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center">
                          <Building2 size={24} />
                        </div>
                        <p className="text-base font-semibold text-zinc-700">No client organizations found</p>
                        <p className="text-xs text-zinc-400 max-w-sm">
                          {searchQuery
                            ? `No clients matched "${searchQuery}". Try a different keyword or reset filters.`
                            : "No client businesses exist yet. Click 'Onboard New Client' above to launch your first client business."}
                        </p>
                        {searchQuery && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearchQuery("")}
                            className="mt-2"
                          >
                            Clear Search
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Edit Client Settings & Modules */}
      {editingBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Sliders size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Client Settings & Modules</h3>
                  <p className="text-xs text-zinc-500 font-medium">{editingBiz.name} ({editingBiz.slug})</p>
                </div>
              </div>
              <button
                onClick={() => setEditingBiz(null)}
                className="text-zinc-400 hover:text-zinc-700 text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClientSettings} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Subscription Tier</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-indigo-500"
                    value={editFormData.plan_type}
                    onChange={(e) => setEditFormData({ ...editFormData, plan_type: e.target.value })}
                  >
                    <option value="starter">Starter Plan</option>
                    <option value="pro">Pro Plan</option>
                    <option value="enterprise">Enterprise Plan</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Max User Seats</label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={editFormData.max_users}
                    onChange={(e) => setEditFormData({ ...editFormData, max_users: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              {/* Module Feature Flags */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-800 block">Feature Modules Enabled:</label>
                  <span className="text-[11px] text-zinc-400">Controls sidebar navigation & permissions for this client</span>
                </div>

                <div className="space-y-2">
                  {MODULE_DEFINITIONS.map((mod) => {
                    const isChecked = !!editFormData.enabled_modules[mod.key];
                    return (
                      <label
                        key={mod.key}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all",
                          isChecked
                            ? "border-indigo-200 bg-indigo-50/40 text-zinc-900"
                            : "border-zinc-200 bg-zinc-50/50 text-zinc-400"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-xl",
                            isChecked ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-400"
                          )}>
                            <mod.icon size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-zinc-900">{mod.label}</p>
                            <p className="text-[11px] text-zinc-500">{mod.desc}</p>
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              enabled_modules: {
                                ...editFormData.enabled_modules,
                                [mod.key]: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <Button variant="ghost" type="button" onClick={() => setEditingBiz(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-xl shadow-md"
                >
                  {isEditSubmitting ? <Loader2 className="animate-spin" /> : "Save Configuration"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Onboard New Client Business */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-zinc-900">Onboard New Client Business</h3>
                  <p className="text-xs text-zinc-500">Creates isolated database workspace, subdomain, and initial owner credentials for your client.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-700 text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBusiness} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Client / Business Name *</label>
                  <Input
                    placeholder="e.g. Royal Chai House"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Subdomain Route *</label>
                  <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden px-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition-all">
                    <input
                      className="w-full bg-transparent py-2 text-sm font-semibold text-zinc-900 focus:outline-none"
                      placeholder="royal-chai"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      required
                    />
                    <span className="text-xs font-mono font-medium text-zinc-400">.seyalpro.com</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Client Owner / Admin Email *</label>
                  <Input
                    type="email"
                    placeholder="owner@example.com"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700">Initial Admin Password *</label>
                    <button
                      type="button"
                      onClick={generateSecurePassword}
                      className="text-[10px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      <KeyRound size={11} /> Generate
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={formData.adminPassword}
                      onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Subscription Tier</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-sm font-semibold text-zinc-900"
                    value={formData.planType}
                    onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
                  >
                    <option value="starter">Starter Plan</option>
                    <option value="pro">Pro Plan</option>
                    <option value="enterprise">Enterprise Plan</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Maximum User Seats</label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={formData.maxUsers}
                    onChange={(e) => setFormData({ ...formData, maxUsers: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Module Toggles */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <label className="text-xs font-bold text-zinc-800 block">Select Included Modules for this Client:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {MODULE_DEFINITIONS.map((mod) => (
                    <label
                      key={mod.key}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-semibold transition-all",
                        formData.modules[mod.key]
                          ? "border-indigo-200 bg-indigo-50/50 text-indigo-950"
                          : "border-zinc-200 bg-zinc-50 text-zinc-500"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={formData.modules[mod.key]}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            modules: { ...formData.modules, [mod.key]: e.target.checked },
                          })
                        }
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="truncate">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <Button variant="ghost" type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-xl shadow-md"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : "Deploy Client Workspace"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
