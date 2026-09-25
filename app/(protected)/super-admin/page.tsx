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
  ChevronRight, KeyRound, Sparkle, Store, BarChart3, Layers, Trash2, Download,
  MapPin, Clock, DollarSign, LayoutGrid, List, AlertOctagon, CheckSquare, ShieldAlert,
  LifeBuoy, Bug, MessageSquare, Tag, Image as ImageIcon, Send
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export interface SupportTicket {
  id: string;
  ticket_number: string;
  business_id: string;
  creator_email: string;
  creator_name?: string;
  title: string;
  category: string;
  priority: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  description: string;
  attachment_url?: string;
  resolution_notes?: string;
  created_at: string;
  businesses?: { name: string; slug: string };
}

export interface ClientBusiness {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  max_users: number;
  is_active: boolean;
  user_count: number;
  admin_email: string;
  currency_symbol?: string;
  timezone?: string;
  geofence_lat?: number | null;
  geofence_lng?: number | null;
  geofence_radius_meters?: number;
  geofence_enabled?: boolean;
  enabled_modules: Record<string, boolean>;
  created_at: string;
  total_sales?: number;
  total_expenses?: number;
  net_profit?: number;
  order_count?: number;
  open_issues_count?: number;
  total_issues_count?: number;
}

interface PlatformAnalytics {
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  totalUsers: number;
  totalBusinesses: number;
  activeTenants: number;
  totalIssues: number;
  openIssues: number;
}

const MODULE_DEFINITIONS = [
  { key: "billing", label: "Billing / POS", icon: Coffee, desc: "Cashier orders, table receipts & POS" },
  { key: "sales", label: "Daily Sales", icon: TrendingUp, desc: "Cash & UPI register settlements" },
  { key: "expenses", label: "Daily Expenses", icon: Receipt, desc: "Purchases, vendor invoices & costs" },
  { key: "timesheet", label: "Timesheets & GPS", icon: CalendarCheck2, desc: "Staff clock-in & GPS geofencing" },
  { key: "stock", label: "Stock Inventory", icon: Boxes, desc: "Inventory quantities, alerts & counts" },
  { key: "salary", label: "Payroll & Salary", icon: Wallet, desc: "Staff compensation & payslips" },
  { key: "contacts", label: "Contacts Directory", icon: Contact, desc: "Staff, emergency & vendor database" },
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
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // View Layout: Table or Cards
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("revenue");

  // Onboard modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit modal state & tab
  const [editingBiz, setEditingBiz] = useState<ClientBusiness | null>(null);
  const [editTab, setEditTab] = useState<"profile" | "modules" | "geofence" | "password">("profile");
  const [editFormData, setEditFormData] = useState<{
    name: string;
    slug: string;
    plan_type: string;
    max_users: number;
    currency_symbol: string;
    timezone: string;
    geofence_lat: string;
    geofence_lng: string;
    geofence_radius_meters: number;
    geofence_enabled: boolean;
    enabled_modules: Record<string, boolean>;
    newAdminPassword?: string;
  }>({
    name: "",
    slug: "",
    plan_type: "pro",
    max_users: 25,
    currency_symbol: "₹",
    timezone: "Asia/Kolkata",
    geofence_lat: "",
    geofence_lng: "",
    geofence_radius_meters: 150,
    geofence_enabled: true,
    enabled_modules: {},
    newAdminPassword: "",
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Danger Zone: Delete Store Modal state
  const [deletingBiz, setDeletingBiz] = useState<ClientBusiness | null>(null);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Support Issues Drawer state
  const [selectedBizForIssues, setSelectedBizForIssues] = useState<ClientBusiness | null>(null);
  const [showAllTicketsModal, setShowAllTicketsModal] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [viewingScreenshotUrl, setViewingScreenshotUrl] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

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
    currencySymbol: "₹",
    timezone: "Asia/Kolkata",
    geofenceLat: "12.8439",
    geofenceLng: "80.2268",
    geofenceRadius: 150,
    geofenceEnabled: true,
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

  // Export full platform overview as CSV
  function handleExportCSV() {
    if (!businesses.length) {
      toast({ title: "No client data to export", variant: "error" });
      return;
    }

    const headers = [
      "Client Name",
      "Slug / Subdomain",
      "Status",
      "Plan Tier",
      "Staff Seats",
      "Admin Email",
      "Total Sales (₹)",
      "Total Expenses (₹)",
      "Net Profit (₹)",
      "Total Orders",
      "Open Issues",
      "Created Date",
    ];

    const rows = businesses.map((b) => [
      `"${b.name.replace(/"/g, '""')}"`,
      `"${b.slug}"`,
      b.is_active ? "Active" : "Suspended",
      b.plan_type.toUpperCase(),
      b.user_count,
      `"${b.admin_email}"`,
      b.total_sales || 0,
      b.total_expenses || 0,
      b.net_profit || 0,
      b.order_count || 0,
      b.open_issues_count || 0,
      new Date(b.created_at).toLocaleDateString(),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `seyalpro_clients_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Downloaded report for ${businesses.length} client businesses.`,
      variant: "success",
    });
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

      // 2. Fetch sales, expenses, profiles, and support tickets in parallel
      const [salesRes, expensesRes, ordersRes, profilesRes, ticketsRes] = await Promise.all([
        supabaseClient.from("daily_sales").select("business_id, total_cash_cents, upi_amount_cents"),
        supabaseClient.from("daily_expenses").select("business_id, price_cents"),
        supabaseClient.from("orders").select("business_id, total_amount, status"),
        supabaseClient.from("profiles").select("id, email, is_admin, business_id"),
        fetch("/api/support/tickets", {
          headers: { Authorization: `Bearer ${token || ""}` },
        }).then((r) => r.json()).catch(() => ({ tickets: [] })),
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

      // Process tickets per business
      const openIssuesByBiz: Record<string, number> = {};
      const totalIssuesByBiz: Record<string, number> = {};
      let platformTotalIssues = 0;
      let platformOpenIssues = 0;

      const loadedTickets: SupportTicket[] = ticketsRes.tickets || [];
      setAllTickets(loadedTickets);

      loadedTickets.forEach((t) => {
        const bId = t.business_id;
        totalIssuesByBiz[bId] = (totalIssuesByBiz[bId] || 0) + 1;
        platformTotalIssues += 1;
        if (t.status === "open" || t.status === "in_progress") {
          openIssuesByBiz[bId] = (openIssuesByBiz[bId] || 0) + 1;
          platformOpenIssues += 1;
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
            currency_symbol: b.currency_symbol || "₹",
            timezone: b.timezone || "Asia/Kolkata",
            geofence_lat: b.geofence_lat !== null ? Number(b.geofence_lat) : null,
            geofence_lng: b.geofence_lng !== null ? Number(b.geofence_lng) : null,
            geofence_radius_meters: b.geofence_radius_meters ? Number(b.geofence_radius_meters) : 150,
            geofence_enabled: b.geofence_enabled !== false,
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
            open_issues_count: openIssuesByBiz[b.id] || 0,
            total_issues_count: totalIssuesByBiz[b.id] || 0,
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
          totalIssues: platformTotalIssues,
          openIssues: platformOpenIssues,
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
            currency_symbol: "₹",
            timezone: "Asia/Kolkata",
            geofence_lat: 12.8439,
            geofence_lng: 80.2268,
            geofence_radius_meters: 150,
            geofence_enabled: true,
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
            open_issues_count: openIssuesByBiz["a0000000-0000-0000-0000-000000000001"] || 0,
            total_issues_count: totalIssuesByBiz["a0000000-0000-0000-0000-000000000001"] || 0,
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
          totalIssues: platformTotalIssues,
          openIssues: platformOpenIssues,
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
          .select("is_super_admin")
          .eq("id", currentUser.id)
          .maybeSingle();

        const isSuper =
          !!profile?.is_super_admin ||
          emailLower === "admin@seyalpro.com";

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
        if (isMounted) setViewState(SuperAdminView.Restricted);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Ticket Status
  async function handleUpdateTicketStatus(ticketId: string, newStatus: string, resolutionNotes?: string) {
    setUpdatingTicketId(ticketId);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/support/tickets", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          ticketId,
          status: newStatus,
          resolutionNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update ticket.");
      }

      toast({
        title: "Ticket Status Updated",
        description: `Marked as ${newStatus.toUpperCase()}`,
        variant: "success",
      });

      await loadBusinessesData(true);
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "error" });
    } finally {
      setUpdatingTicketId(null);
    }
  }

  // Auto-generate slug from business name
  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setFormData((prev) => ({ ...prev, name, slug }));
  }

  function generateSecurePassword(isEdit = false) {
    const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 14; i++) {
      pwd += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    if (isEdit) {
      setEditFormData((prev) => ({ ...prev, newAdminPassword: pwd }));
    } else {
      setFormData((prev) => ({ ...prev, adminPassword: pwd }));
      setShowPassword(true);
    }
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
            currencySymbol: formData.currencySymbol,
            timezone: formData.timezone,
            geofenceLat: formData.geofenceLat ? Number(formData.geofenceLat) : null,
            geofenceLng: formData.geofenceLng ? Number(formData.geofenceLng) : null,
            geofenceRadiusMeters: Number(formData.geofenceRadius) || 150,
            geofenceEnabled: formData.geofenceEnabled,
            enabledModules: formData.modules,
          }),
        });

        if (res.ok) {
          apiSuccess = true;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Onboarding request failed.");
        }
      } catch (apiErr: any) {
        throw apiErr;
      }

      toast({
        title: "Client Onboarded Successfully!",
        description: `${formData.name} is ready at ${formData.slug}.seyalpro.in`,
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
        currencySymbol: "₹",
        timezone: "Asia/Kolkata",
        geofenceLat: "12.8439",
        geofenceLng: "80.2268",
        geofenceRadius: 150,
        geofenceEnabled: true,
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
    setEditTab("profile");
    setEditFormData({
      name: biz.name || "",
      slug: biz.slug || "",
      plan_type: biz.plan_type || "pro",
      max_users: biz.max_users || 25,
      currency_symbol: biz.currency_symbol || "₹",
      timezone: biz.timezone || "Asia/Kolkata",
      geofence_lat: biz.geofence_lat ? String(biz.geofence_lat) : "",
      geofence_lng: biz.geofence_lng ? String(biz.geofence_lng) : "",
      geofence_radius_meters: biz.geofence_radius_meters || 150,
      geofence_enabled: biz.geofence_enabled !== false,
      newAdminPassword: "",
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
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      // 1. Update business details via API
      const res = await fetch("/api/super-admin/businesses", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          id: editingBiz.id,
          name: editFormData.name,
          slug: editFormData.slug,
          plan_type: editFormData.plan_type,
          max_users: Number(editFormData.max_users),
          currency_symbol: editFormData.currency_symbol,
          timezone: editFormData.timezone,
          geofence_lat: editFormData.geofence_lat ? Number(editFormData.geofence_lat) : null,
          geofence_lng: editFormData.geofence_lng ? Number(editFormData.geofence_lng) : null,
          geofence_radius_meters: Number(editFormData.geofence_radius_meters) || 150,
          geofence_enabled: editFormData.geofence_enabled,
          enabled_modules: editFormData.enabled_modules,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update business configuration.");
      }

      // 2. If password reset requested
      if (editFormData.newAdminPassword && editFormData.newAdminPassword.trim().length >= 6) {
        const resetRes = await fetch("/api/super-admin/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({
            businessId: editingBiz.id,
            newPassword: editFormData.newAdminPassword.trim(),
          }),
        });

        if (!resetRes.ok) {
          const rErr = await resetRes.json().catch(() => ({}));
          toast({
            title: "Settings saved, but password reset failed",
            description: rErr.error || "Could not update admin password.",
            variant: "error",
          });
        } else {
          toast({
            title: "Admin Password Reset",
            description: `Updated credentials for ${editingBiz.name} admin account.`,
            variant: "success",
          });
        }
      }

      toast({
        title: "Client Settings Saved",
        description: `Successfully updated configuration for ${editFormData.name}.`,
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

  // Toggle active/suspended status
  async function toggleBusinessStatus(biz: ClientBusiness) {
    try {
      const nextStatus = !biz.is_active;
      // Optimistic update
      setBusinesses((prev) =>
        prev.map((b) => (b.id === biz.id ? { ...b, is_active: nextStatus } : b))
      );

      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/super-admin/businesses", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          id: biz.id,
          is_active: nextStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to toggle status.");
      }

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

  // Delete / Offboard Business
  async function handleDeleteBusiness() {
    if (!deletingBiz) return;

    if (confirmDeleteInput.trim().toLowerCase() !== deletingBiz.name.trim().toLowerCase()) {
      toast({
        title: "Confirmation Name Mismatch",
        description: `Please type "${deletingBiz.name}" exactly to confirm deletion.`,
        variant: "error",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/super-admin/businesses", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          businessId: deletingBiz.id,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || "Failed to delete business.");
      }

      toast({
        title: "Store Deleted Permanently",
        description: resData.message || `${deletingBiz.name} was removed from the platform.`,
        variant: "success",
      });

      setDeletingBiz(null);
      setConfirmDeleteInput("");
      await loadBusinessesData(true);
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsDeleting(false);
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
        if (sortBy === "issues") return (b.open_issues_count || 0) - (a.open_issues_count || 0);
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return 0;
      });
  }, [businesses, searchQuery, planFilter, statusFilter, sortBy]);

  // Filtered support tickets for the Issues Drawer
  const displayedTickets = useMemo(() => {
    let list = allTickets;
    if (selectedBizForIssues) {
      list = list.filter((t) => t.business_id === selectedBizForIssues.id);
    }
    if (ticketStatusFilter !== "all") {
      list = list.filter((t) => t.status === ticketStatusFilter);
    }
    return list;
  }, [allTickets, selectedBizForIssues, ticketStatusFilter]);

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
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/super-admin/login"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all"
          >
            <Lock size={14} /> Platform Owner 2FA Login
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all"
          >
            <ArrowLeft size={14} /> Return to Store Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalUsers = analytics?.totalUsers ?? businesses.reduce((acc, b) => acc + (b.user_count || 0), 0);
  const activeClients = analytics?.activeTenants ?? businesses.filter((b) => b.is_active).length;
  const totalSales = analytics?.totalSales || 0;
  const totalExpenses = analytics?.totalExpenses || 0;
  const netProfit = analytics?.netProfit || 0;
  const totalOrders = analytics?.totalOrders || 0;
  const totalIssues = analytics?.totalIssues || 0;
  const openIssues = analytics?.openIssues || 0;
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
              {openIssues > 0 && (
                <div
                  onClick={() => setShowAllTicketsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/30 cursor-pointer hover:bg-amber-500/30 transition-colors"
                >
                  <LifeBuoy size={13} className="text-amber-400" />
                  <span>{openIssues} Pending Support Tickets</span>
                </div>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              SaaS Command Center
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
              Centrally manage client stores, track live platform financial volume, review and resolve client bug tickets with screenshots, and switch seamlessly into any client workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowAllTicketsModal(true)}
              className="bg-slate-800/80 hover:bg-slate-700 text-amber-300 border-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
            >
              <LifeBuoy size={15} className="text-amber-400" />
              <span>Issues Inbox ({openIssues})</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
            >
              <Download size={15} className="text-sky-400" />
              <span>Export CSV</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => loadBusinessesData(true)}
              disabled={isRefreshing}
              className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
            >
              <RefreshCw size={15} className={cn(isRefreshing && "animate-spin text-indigo-400")} />
              <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
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

      {/* 6-Column Platform KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Gross Revenue */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Gross Platform Sales</p>
              <h3 className="text-xl font-black text-emerald-600 tracking-tight font-mono">
                ₹{totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[10px] text-zinc-400 font-medium">Across {totalOrders} orders</p>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <TrendingUp size={20} />
            </div>
          </div>
        </Card>

        {/* Expenses */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Combined Costs</p>
              <h3 className="text-xl font-black text-rose-600 tracking-tight font-mono">
                ₹{totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[10px] text-zinc-400 font-medium">Purchases & expenses</p>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <Wallet size={20} />
            </div>
          </div>
        </Card>

        {/* Net Profit Margin */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Net Platform Margin</p>
              <h3 className={cn(
                "text-xl font-black tracking-tight font-mono",
                netProfit >= 0 ? "text-indigo-600" : "text-amber-600"
              )}>
                ₹{netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[10px] text-zinc-400 font-medium">{profitMarginPercent}% net margin rate</p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <BarChart3 size={20} />
            </div>
          </div>
        </Card>

        {/* Active Clients */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Active Stores</p>
              <h3 className="text-xl font-black text-zinc-900 tracking-tight font-mono">
                {activeClients} <span className="text-xs font-semibold text-zinc-400">/ {businesses.length}</span>
              </h3>
              <p className="text-[10px] text-emerald-600 font-semibold">
                {businesses.length > 0 ? `${((activeClients / businesses.length) * 100).toFixed(0)}% online` : "No stores"}
              </p>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <Building2 size={20} />
            </div>
          </div>
        </Card>

        {/* Total Staff Users */}
        <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Platform Staff Seats</p>
              <h3 className="text-xl font-black text-zinc-900 tracking-tight font-mono">
                {totalUsers}
              </h3>
              <p className="text-[10px] text-zinc-400 font-medium">Across all store accounts</p>
            </div>
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
              <Users size={20} />
            </div>
          </div>
        </Card>

        {/* Client Support Issues & Bugs KPI Card */}
        <Card
          onClick={() => setShowAllTicketsModal(true)}
          className={cn(
            "border shadow-sm rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer",
            openIssues > 0 ? "border-amber-200 bg-amber-50/40" : "border-zinc-200/80 bg-white"
          )}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Reported Issues</p>
              <h3 className={cn(
                "text-xl font-black tracking-tight font-mono flex items-center gap-1.5",
                openIssues > 0 ? "text-amber-700" : "text-zinc-900"
              )}>
                <span>{openIssues} Open</span>
                <span className="text-xs font-semibold text-zinc-400 font-sans">/ {totalIssues}</span>
              </h3>
              <p className="text-[10px] text-indigo-600 font-bold flex items-center gap-0.5">
                <span>View All Tickets</span>
                <ChevronRight size={12} />
              </p>
            </div>
            <div className={cn(
              "p-2.5 rounded-xl border",
              openIssues > 0
                ? "bg-amber-100 text-amber-700 border-amber-300"
                : "bg-zinc-100 text-zinc-600 border-zinc-200"
            )}>
              <LifeBuoy size={20} className={cn(openIssues > 0 && "animate-spin-slow")} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Client Table & Cards Section */}
      <Card className="border border-zinc-200/80 shadow-sm bg-white rounded-3xl overflow-hidden">
        {/* Table Toolbar / Filters */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 flex items-center gap-2">
                <span>Client Organizations & Workspaces</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {filteredBusinesses.length} {filteredBusinesses.length === 1 ? "store" : "stores"}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Every store is fully isolated with dedicated POS, daily ledgers, products, staff roster, GPS geofencing, and permissions.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Switcher Toggle */}
              <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5",
                    viewMode === "table" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                  title="Table View"
                >
                  <List size={16} />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5",
                    viewMode === "cards" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  )}
                  title="Grid Cards View"
                >
                  <LayoutGrid size={16} />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search store name, slug, email..."
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
                    {plan}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80 text-xs">
                {[
                  { key: "all", label: "All Status" },
                  { key: "active", label: "Active" },
                  { key: "suspended", label: "Suspended" },
                ].map((st) => (
                  <button
                    key={st.key}
                    onClick={() => setStatusFilter(st.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-semibold transition-all",
                      statusFilter === st.key
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-zinc-400">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="revenue">Gross Sales (Highest)</option>
                <option value="profit">Net Profit (Highest)</option>
                <option value="issues">Open Issues (Highest)</option>
                <option value="users">Staff Count</option>
                <option value="newest">Newly Created</option>
                <option value="name">Store Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* VIEW 1: TABLE VIEW */}
        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 text-zinc-500 text-[11px] uppercase tracking-wider font-bold border-b border-zinc-100">
                  <th className="py-3.5 px-6">Store & Subdomain</th>
                  <th className="py-3.5 px-4">Plan & Seats</th>
                  <th className="py-3.5 px-4">Admin Email</th>
                  <th className="py-3.5 px-4">Financial Volume</th>
                  <th className="py-3.5 px-4">Reported Issues</th>
                  <th className="py-3.5 px-4">Active Modules</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs sm:text-sm">
                {filteredBusinesses.map((biz) => {
                  const isProtectedRoot = biz.id === "a0000000-0000-0000-0000-000000000001";
                  const enabledCount = Object.values(biz.enabled_modules || {}).filter(Boolean).length;
                  const totalModules = MODULE_DEFINITIONS.length;
                  const openCount = biz.open_issues_count || 0;
                  const totalCount = biz.total_issues_count || 0;

                  return (
                    <tr key={biz.id} className="hover:bg-zinc-50/70 transition-colors group">
                      
                      {/* Store & Subdomain */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm text-white shrink-0 shadow-sm",
                            biz.is_active
                              ? "bg-gradient-to-tr from-sky-600 via-indigo-600 to-indigo-700 shadow-indigo-200"
                              : "bg-zinc-400"
                          )}>
                            {biz.name[0]?.toUpperCase() || "S"}
                          </div>
                          <div>
                            <div className="font-extrabold text-zinc-900 flex items-center gap-1.5">
                              <span>{biz.name}</span>
                              {isProtectedRoot && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  Default Root
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5 font-mono">
                              <span>{biz.slug}.seyalpro.in</span>
                              <button
                                onClick={() => copyToClipboard(`${biz.slug}.seyalpro.in`, `sub_${biz.id}`, "Subdomain")}
                                className="hover:text-zinc-600 p-0.5"
                                title="Copy Subdomain"
                              >
                                {copiedKey === `sub_${biz.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Plan & Users */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
                            biz.plan_type === "enterprise" ? "bg-purple-100 text-purple-800" :
                            biz.plan_type === "pro" ? "bg-indigo-50 text-indigo-700 border border-indigo-100" :
                            "bg-zinc-100 text-zinc-700"
                          )}>
                            {biz.plan_type}
                          </span>
                          <div className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                            <Users size={12} className="text-zinc-400" />
                            <span>{biz.user_count} / {biz.max_users} seats</span>
                          </div>
                        </div>
                      </td>

                      {/* Admin Email */}
                      <td className="py-4 px-4">
                        <div className="font-mono text-xs text-zinc-700 max-w-[180px] truncate flex items-center gap-1">
                          <span className="truncate">{biz.admin_email}</span>
                          <button
                            onClick={() => copyToClipboard(biz.admin_email, `email_${biz.id}`, "Admin Email")}
                            className="text-zinc-400 hover:text-zinc-600 shrink-0"
                            title="Copy Email"
                          >
                            {copiedKey === `email_${biz.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                          <KeyRound size={11} />
                          <span>Standard Password Policy</span>
                        </div>
                      </td>

                      {/* Financials */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-emerald-600 font-mono text-xs">
                            ₹{(biz.total_sales || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            Cost: ₹{(biz.total_expenses || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className={cn(
                            "text-[10px] font-bold font-mono",
                            (biz.net_profit || 0) >= 0 ? "text-indigo-600" : "text-amber-600"
                          )}>
                            Net: ₹{(biz.net_profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </td>

                      {/* Reported Issues Badge */}
                      <td className="py-4 px-4">
                        <button
                          onClick={() => {
                            setSelectedBizForIssues(biz);
                            setTicketStatusFilter("all");
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border",
                            openCount > 0
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200"
                              : totalCount > 0
                              ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border-zinc-200"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                          )}
                          title="Click to view all reported tickets for this store"
                        >
                          {openCount > 0 ? (
                            <>
                              <LifeBuoy size={13} className="text-amber-600 animate-spin-slow" />
                              <span>{openCount} Open ({totalCount})</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle size={13} className="text-emerald-600" />
                              <span>{totalCount > 0 ? `${totalCount} Solved` : "0 Issues"}</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Active Modules */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs font-bold text-zinc-700">
                            <Sliders size={13} className="text-indigo-500" />
                            <span>{enabledCount} / {totalModules} active</span>
                          </div>
                          <div className="w-24 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${(enabledCount / totalModules) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => toggleBusinessStatus(biz)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all",
                            biz.is_active
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80"
                              : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80"
                          )}
                          title="Click to toggle status"
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", biz.is_active ? "bg-emerald-500" : "bg-rose-500")} />
                          <span>{biz.is_active ? "Active" : "Suspended"}</span>
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Workspace Switcher */}
                          <button
                            onClick={() => handleSwitchWorkspace(biz.slug, biz.name)}
                            className="p-2 rounded-xl text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all font-bold text-xs flex items-center gap-1"
                            title={`Switch into ${biz.name}`}
                          >
                            <ArrowRightLeft size={14} />
                            <span className="hidden xl:inline">Switch</span>
                          </button>

                          {/* Configure / Edit */}
                          <button
                            onClick={() => openEditModal(biz)}
                            className="p-2 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent hover:border-zinc-200 transition-all text-xs font-semibold flex items-center gap-1"
                            title="Edit Settings & Modules"
                          >
                            <Edit3 size={14} />
                            <span className="hidden xl:inline">Configure</span>
                          </button>

                          {/* Delete Store (Danger Zone) */}
                          {!isProtectedRoot && (
                            <button
                              onClick={() => {
                                setDeletingBiz(biz);
                                setConfirmDeleteInput("");
                              }}
                              className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all text-xs"
                              title="Delete / Offboard Store"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* VIEW 2: CARDS GRID VIEW */
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredBusinesses.map((biz) => {
              const isProtectedRoot = biz.id === "a0000000-0000-0000-0000-000000000001";
              const enabledCount = Object.values(biz.enabled_modules || {}).filter(Boolean).length;
              const openCount = biz.open_issues_count || 0;

              return (
                <div
                  key={biz.id}
                  className="rounded-2xl border border-zinc-200/80 p-5 bg-white hover:shadow-lg transition-all space-y-4 relative group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-indigo-100">
                        {biz.name[0]?.toUpperCase() || "S"}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-zinc-900 flex items-center gap-1.5">
                          <span>{biz.name}</span>
                          {isProtectedRoot && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700">Root</span>
                          )}
                        </h3>
                        <p className="text-xs text-zinc-400 font-mono">{biz.slug}.seyalpro.in</p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleBusinessStatus(biz)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1",
                        biz.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", biz.is_active ? "bg-emerald-500" : "bg-rose-500")} />
                      <span>{biz.is_active ? "Active" : "Suspended"}</span>
                    </button>
                  </div>

                  {/* Financials Row */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-center font-mono">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-sans block uppercase font-bold">Sales</span>
                      <span className="font-bold text-xs text-emerald-600">₹{(biz.total_sales || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 font-sans block uppercase font-bold">Expenses</span>
                      <span className="font-bold text-xs text-rose-600">₹{(biz.total_expenses || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 font-sans block uppercase font-bold">Profit</span>
                      <span className="font-bold text-xs text-indigo-600">₹{(biz.net_profit || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Issues & Staff Info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 pt-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Users size={14} className="text-zinc-400" />
                      <span>{biz.user_count} / {biz.max_users} seats</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedBizForIssues(biz);
                        setTicketStatusFilter("all");
                      }}
                      className={cn(
                        "flex items-center gap-1 font-bold px-2 py-0.5 rounded-lg border text-[11px]",
                        openCount > 0
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-zinc-100 text-zinc-600 border-zinc-200"
                      )}
                    >
                      <LifeBuoy size={12} className={openCount > 0 ? "text-amber-600" : "text-zinc-400"} />
                      <span>{openCount} Open Issues</span>
                    </button>
                  </div>

                  {/* Action Bar */}
                  <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                    <Button
                      onClick={() => handleSwitchWorkspace(biz.slug, biz.name)}
                      className="h-9 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex-1 flex items-center justify-center gap-1.5"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Launch Store</span>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => openEditModal(biz)}
                      className="h-9 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border-zinc-200 text-xs font-semibold rounded-xl px-3"
                    >
                      <Edit3 size={14} />
                    </Button>

                    {!isProtectedRoot && (
                      <button
                        onClick={() => {
                          setDeletingBiz(biz);
                          setConfirmDeleteInput("");
                        }}
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Store"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* DRAWER / MODAL: CLIENT SUPPORT TICKETS & BUG REPORTS                      */}
      {/* ========================================================================= */}
      {(selectedBizForIssues || showAllTicketsModal) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-zinc-200 space-y-6 animate-in zoom-in-95 duration-200 my-8 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                    <LifeBuoy size={20} />
                  </div>
                  <h2 className="text-xl font-extrabold text-zinc-900">
                    {selectedBizForIssues ? `${selectedBizForIssues.name} — Reported Issues` : "All Client Support Tickets"}
                  </h2>
                </div>
                <p className="text-xs text-zinc-500">
                  Review client bug reports, inspect uploaded screenshots, and update ticket resolution status.
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedBizForIssues(null);
                  setShowAllTicketsModal(false);
                }}
                className="text-zinc-400 hover:text-zinc-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 text-xs font-bold shrink-0">
              {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
                <button
                  key={st}
                  onClick={() => setTicketStatusFilter(st)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl capitalize transition-all",
                    ticketStatusFilter === st
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Tickets List Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {displayedTickets.length === 0 ? (
                <div className="text-center py-12 space-y-2 text-zinc-400">
                  <LifeBuoy size={36} className="mx-auto text-zinc-300" />
                  <p className="font-bold text-sm text-zinc-600">No issues found</p>
                  <p className="text-xs">No client tickets match the current status filter.</p>
                </div>
              ) : (
                displayedTickets.map((ticket) => {
                  const isUpdating = updatingTicketId === ticket.id;

                  return (
                    <div
                      key={ticket.id}
                      className="p-5 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 shadow-2xs space-y-3.5 transition-all"
                    >
                      {/* Top Bar: Ticket #, Store, Priority, Status */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-indigo-600 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100">
                              #{ticket.ticket_number}
                            </span>
                            <h4 className="text-sm font-extrabold text-zinc-900">{ticket.title}</h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            {ticket.businesses?.name && (
                              <span className="font-bold text-zinc-800 flex items-center gap-1">
                                <Store size={12} className="text-zinc-400" />
                                {ticket.businesses.name}
                              </span>
                            )}
                            <span>•</span>
                            <span>Reported by <span className="font-mono text-zinc-700">{ticket.creator_email}</span></span>
                            <span>•</span>
                            <span>{new Date(ticket.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Priority & Status Controls */}
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                            ticket.priority === "urgent" ? "bg-rose-100 text-rose-800" :
                            ticket.priority === "high" ? "bg-amber-100 text-amber-800" :
                            ticket.priority === "medium" ? "bg-sky-100 text-sky-800" :
                            "bg-zinc-100 text-zinc-700"
                          )}>
                            {ticket.priority}
                          </span>

                          <select
                            value={ticket.status}
                            disabled={isUpdating}
                            onChange={(e) => handleUpdateTicketStatus(ticket.id, e.target.value)}
                            className={cn(
                              "text-xs font-bold px-2.5 py-1 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500",
                              ticket.status === "open" ? "bg-amber-50 text-amber-800 border-amber-300" :
                              ticket.status === "in_progress" ? "bg-sky-50 text-sky-800 border-sky-300" :
                              ticket.status === "resolved" ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                              "bg-zinc-100 text-zinc-700 border-zinc-200"
                            )}
                          >
                            <option value="open">🟡 Open</option>
                            <option value="in_progress">🔵 In Progress</option>
                            <option value="resolved">🟢 Resolved</option>
                            <option value="closed">⚪ Closed</option>
                          </select>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-zinc-700 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                        {ticket.description}
                      </p>

                      {/* Attachment Screenshot Preview */}
                      {ticket.attachment_url && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                            Attached Screenshot
                          </span>
                          <div className="inline-block relative rounded-xl border border-zinc-200 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                            <img
                              src={ticket.attachment_url}
                              alt="Bug Screenshot"
                              onClick={() => setViewingScreenshotUrl(ticket.attachment_url!)}
                              className="w-32 h-20 object-cover"
                            />
                            <div
                              onClick={() => setViewingScreenshotUrl(ticket.attachment_url!)}
                              className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold gap-1 opacity-0 hover:opacity-100 transition-opacity"
                            >
                              <Eye size={14} />
                              <span>Zoom</span>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 shrink-0">
              <span>Showing {displayedTickets.length} issues</span>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedBizForIssues(null);
                  setShowAllTicketsModal(false);
                }}
                className="rounded-xl"
              >
                Close Inbox
              </Button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREENSHOT FULL ZOOM MODAL                                               */}
      {/* ========================================================================= */}
      {viewingScreenshotUrl && (
        <div
          onClick={() => setViewingScreenshotUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <div className="relative max-w-4xl max-h-[85vh] p-2 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <img
              src={viewingScreenshotUrl}
              alt="Full screenshot"
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            <button
              onClick={() => setViewingScreenshotUrl(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ONBOARD NEW CLIENT BUSINESS                                      */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-zinc-200 space-y-6 animate-in zoom-in-95 duration-200 my-8">
            
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-zinc-900 flex items-center gap-2">
                  <Sparkles size={20} className="text-indigo-600" />
                  <span>Onboard New Client Business</span>
                </h2>
                <p className="text-xs text-zinc-500">
                  Instantly provision an isolated tenant workspace with customized modules and dedicated admin login.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBusiness} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Business Name *</label>
                  <Input
                    placeholder="e.g. Royal Chai House"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Subdomain Slug *</label>
                  <div className="flex items-center">
                    <Input
                      placeholder="royal-chai"
                      value={formData.slug}
                      onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                      required
                      className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white rounded-r-none font-mono text-xs"
                    />
                    <span className="h-10 px-3 bg-zinc-100 border border-l-0 border-zinc-200 text-zinc-500 text-xs font-mono font-medium rounded-r-xl flex items-center">
                      .seyalpro.in
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Store Admin Email *</label>
                  <Input
                    type="email"
                    placeholder="owner@royalchai.com"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData((prev) => ({ ...prev, adminEmail: e.target.value }))}
                    required
                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700">Initial Password *</label>
                    <button
                      type="button"
                      onClick={() => generateSecurePassword(false)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <Sparkle size={12} /> Auto-Generate
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={formData.adminPassword}
                      onChange={(e) => setFormData((prev) => ({ ...prev, adminPassword: e.target.value }))}
                      required
                      className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white pr-10 font-mono text-xs"
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Subscription Tier</label>
                  <select
                    value={formData.planType}
                    onChange={(e) => setFormData((prev) => ({ ...prev, planType: e.target.value }))}
                    className="w-full h-10 px-3 bg-zinc-50 border-zinc-200 rounded-xl text-xs font-bold focus:bg-white"
                  >
                    <option value="starter">Starter Plan (5 Seats)</option>
                    <option value="pro">Pro Plan (25 Seats)</option>
                    <option value="enterprise">Enterprise Plan (Unlimited)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Max Staff Seats</label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={formData.maxUsers}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxUsers: Number(e.target.value) }))}
                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Currency Symbol</label>
                  <Input
                    value={formData.currencySymbol}
                    onChange={(e) => setFormData((prev) => ({ ...prev, currencySymbol: e.target.value }))}
                    placeholder="₹, $, €, £"
                    className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white text-xs font-bold"
                  />
                </div>
              </div>

              {/* Module Toggles */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">
                  Enabled Feature Modules
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-zinc-100 rounded-2xl bg-zinc-50/50">
                  {MODULE_DEFINITIONS.map((m) => {
                    const Icon = m.icon;
                    const isChecked = formData.modules[m.key] !== false;
                    return (
                      <label
                        key={m.key}
                        className={cn(
                          "flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer text-xs",
                          isChecked
                            ? "bg-white border-indigo-200 shadow-sm text-zinc-900"
                            : "bg-zinc-100/50 border-transparent text-zinc-400"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              modules: { ...prev.modules, [m.key]: e.target.checked },
                            }))
                          }
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <Icon size={16} className={isChecked ? "text-indigo-600" : "text-zinc-400"} />
                        <span className="font-semibold">{m.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-6 shadow-md shadow-indigo-200"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : "Provision Client Workspace"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: FULL EDIT & CONFIGURE BUSINESS (4 TABS)                          */}
      {/* ========================================================================= */}
      {editingBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-zinc-200 space-y-6 animate-in zoom-in-95 duration-200 my-8">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-zinc-900">
                    Configure {editingBiz.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {editingBiz.slug}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Update plan tier, toggle individual module features, adjust GPS geofencing, or reset store admin credentials.
                </p>
              </div>
              <button
                onClick={() => setEditingBiz(null)}
                className="text-zinc-400 hover:text-zinc-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-100 pb-2 overflow-x-auto text-xs font-bold">
              {[
                { id: "profile", label: "General & Plan", icon: Store },
                { id: "modules", label: "Module Gates", icon: Sliders },
                { id: "geofence", label: "GPS Geofencing", icon: MapPin },
                { id: "password", label: "Admin Password", icon: KeyRound },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = editTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setEditTab(tab.id as any)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap",
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSaveClientSettings} className="space-y-5">
              
              {/* TAB 1: PROFILE & PLAN */}
              {editTab === "profile" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Business Display Name</label>
                      <Input
                        value={editFormData.name}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        className="h-10 bg-zinc-50 border-zinc-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Subdomain Slug</label>
                      <Input
                        value={editFormData.slug}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, slug: e.target.value }))}
                        required
                        className="h-10 bg-zinc-50 border-zinc-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Subscription Plan</label>
                      <select
                        value={editFormData.plan_type}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, plan_type: e.target.value }))}
                        className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold"
                      >
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Max Staff Seats</label>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={editFormData.max_users}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, max_users: Number(e.target.value) }))}
                        className="h-10 bg-zinc-50 border-zinc-200 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Currency Symbol</label>
                      <Input
                        value={editFormData.currency_symbol}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, currency_symbol: e.target.value }))}
                        placeholder="₹"
                        className="h-10 bg-zinc-50 border-zinc-200 text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MODULE FEATURE GATES */}
              {editTab === "modules" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs text-zinc-500 font-medium">
                    Enabling or disabling a module immediately adds or hides it from the client shop's navigation bar and mobile layout.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-1">
                    {MODULE_DEFINITIONS.map((m) => {
                      const Icon = m.icon;
                      const isEnabled = editFormData.enabled_modules[m.key] !== false;
                      return (
                        <div
                          key={m.key}
                          onClick={() =>
                            setEditFormData((prev) => ({
                              ...prev,
                              enabled_modules: { ...prev.enabled_modules, [m.key]: !isEnabled },
                            }))
                          }
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer",
                            isEnabled
                              ? "bg-indigo-50/50 border-indigo-200 shadow-sm"
                              : "bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-xl shrink-0 mt-0.5",
                            isEnabled ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-500"
                          )}>
                            <Icon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="font-extrabold text-xs text-zinc-900">{m.label}</h4>
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                isEnabled ? "bg-indigo-100 text-indigo-700" : "bg-zinc-200 text-zinc-600"
                              )}>
                                {isEnabled ? "ON" : "OFF"}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{m.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: GPS GEOFENCING */}
              {editTab === "geofence" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
                    <MapPin size={18} className="shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-bold">GPS Attendance Enforcement</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        When enabled, employees can only clock in to Timesheets when physically within the specified radius of the store.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-zinc-200 bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.geofence_enabled}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, geofence_enabled: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-xs font-bold text-zinc-900">Enforce GPS Geofence for Staff Timesheets</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Latitude</label>
                      <Input
                        value={editFormData.geofence_lat}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, geofence_lat: e.target.value }))}
                        placeholder="e.g. 12.8439"
                        className="h-10 bg-zinc-50 border-zinc-200 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Longitude</label>
                      <Input
                        value={editFormData.geofence_lng}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, geofence_lng: e.target.value }))}
                        placeholder="e.g. 80.2268"
                        className="h-10 bg-zinc-50 border-zinc-200 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Radius (Meters)</label>
                      <Input
                        type="number"
                        min={20}
                        max={5000}
                        value={editFormData.geofence_radius_meters}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, geofence_radius_meters: Number(e.target.value) }))}
                        className="h-10 bg-zinc-50 border-zinc-200 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: RESET STORE ADMIN PASSWORD */}
              {editTab === "password" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <KeyRound size={15} className="text-indigo-600" />
                      <span>Direct Master Password Reset</span>
                    </p>
                    <p className="text-[11px] text-indigo-700 leading-relaxed">
                      If the store owner forgot their credentials, you can directly assign a new password without requiring email verification.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-700">New Store Admin Password</label>
                      <button
                        type="button"
                        onClick={() => generateSecurePassword(true)}
                        className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Sparkle size={12} /> Auto-Generate
                      </button>
                    </div>
                    <Input
                      type="text"
                      placeholder="Leave blank to keep unchanged"
                      value={editFormData.newAdminPassword || ""}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, newAdminPassword: e.target.value }))}
                      className="h-10 bg-zinc-50 border-zinc-200 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingBiz(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-6 shadow-md shadow-indigo-200"
                >
                  {isEditSubmitting ? <Loader2 className="animate-spin" /> : "Save Configuration"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PERMANENT DELETE / OFFBOARD STORE (DANGER ZONE)                   */}
      {/* ========================================================================= */}
      {deletingBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-rose-200 space-y-6 animate-in zoom-in-95 duration-200">
            
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <AlertOctagon size={30} />
              </div>
              <h3 className="text-xl font-extrabold text-zinc-900">
                Permanently Delete Store?
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                This action is <span className="font-bold text-rose-600">irreversible</span>. It will permanently purge all sales records, expenses, timesheets, inventory, and staff login accounts for:
              </p>
              <div className="p-3 rounded-xl bg-zinc-100 font-extrabold text-sm text-zinc-900 border border-zinc-200">
                {deletingBiz.name} ({deletingBiz.slug}.seyalpro.in)
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 block text-center">
                Type <span className="text-rose-600 font-mono font-bold">"{deletingBiz.name}"</span> below to confirm:
              </label>
              <Input
                type="text"
                placeholder={deletingBiz.name}
                value={confirmDeleteInput}
                onChange={(e) => setConfirmDeleteInput(e.target.value)}
                className="h-10 text-center font-bold text-xs bg-rose-50/50 border-rose-200 focus:bg-white text-zinc-900"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeletingBiz(null);
                  setConfirmDeleteInput("");
                }}
                className="flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteBusiness}
                disabled={
                  isDeleting ||
                  confirmDeleteInput.trim().toLowerCase() !== deletingBiz.name.trim().toLowerCase()
                }
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-200"
              >
                {isDeleting ? <Loader2 className="animate-spin" /> : "Delete Store"}
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
