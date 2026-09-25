"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTenant } from "@/lib/context/TenantContext";
import { useUser } from "@/lib/hooks/useUser";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  LifeBuoy, Bug, AlertTriangle, CheckCircle2, Clock, UploadCloud, X,
  Image as ImageIcon, Loader2, Sparkles, Send, ShieldAlert, Plus,
  Search, RefreshCw, MessageSquare, Check, Eye, ExternalLink, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface RaiseIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "list" | "create";
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  business_id: string;
  created_by_user_id: string | null;
  creator_email: string;
  creator_name: string | null;
  title: string;
  category: string;
  priority: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  description: string;
  attachment_url: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

const QUICK_TOPICS = [
  "POS Thermal Printer error",
  "Daily Sales calculation mismatch",
  "GPS Timesheet clock-in issue",
  "Inventory stock count difference",
  "Staff salary payslip issue",
  "Feature request for store",
];

const CATEGORIES: Record<string, { label: string; icon: any }> = {
  bug: { label: "System Bug / Glitch", icon: Bug },
  pos_billing: { label: "POS & Billing", icon: LifeBuoy },
  timesheet_gps: { label: "Timesheet & GPS", icon: ShieldAlert },
  inventory_stock: { label: "Inventory / Stock", icon: LifeBuoy },
  feature_request: { label: "Feature Request", icon: Sparkles },
  other: { label: "General Support", icon: LifeBuoy },
};

const PRIORITIES = [
  { id: "low", label: "Low", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  { id: "medium", label: "Medium", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "high", label: "High", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "urgent", label: "Critical", color: "bg-rose-50 text-rose-700 border-rose-200" },
];

export default function RaiseIssueModal({ isOpen, onClose, initialTab = "list" }: RaiseIssueModalProps) {
  const { business } = useTenant();
  const { user } = useUser();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"list" | "create">(initialTab);
  
  // List State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Create Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("bug");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ ticketNumber: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchTickets();
    }
  }, [isOpen, initialTab]);

  async function fetchTickets() {
    setLoadingTickets(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/support/tickets", {
        headers: {
          Authorization: `Bearer ${token || ""}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.tickets) {
        setTickets(data.tickets);
      }
    } catch (e) {
      console.error("Failed to load tickets", e);
    } finally {
      setLoadingTickets(false);
    }
  }

  if (!isOpen) return null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file (PNG, JPG, WebP)", variant: "error" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image size must be less than 5MB", variant: "error" });
      return;
    }

    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast({ title: "Please provide both title and description", variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          category,
          priority,
          description: description.trim(),
          attachmentUrl: screenshotBase64,
          creatorName: user?.email?.split("@")[0] || "Store Admin",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit ticket.");
      }

      const generatedTicket = data.ticketNumber || data.ticket?.ticket_number || "SP-TICKET";
      setSubmittedTicket({ ticketNumber: generatedTicket });

      toast({
        title: "Issue Reported Successfully",
        description: `Ticket ${generatedTicket} logged with SeyalPro support team.`,
        variant: "success",
      });

      // Refresh tickets list
      fetchTickets();
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleResetForm() {
    setTitle("");
    setCategory("bug");
    setPriority("medium");
    setDescription("");
    setScreenshotBase64(null);
    setScreenshotName("");
    setSubmittedTicket(null);
  }

  function handleCloseModal() {
    handleResetForm();
    onClose();
  }

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesSearch =
      t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openTicketsCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const resolvedTicketsCount = tickets.filter((t) => t.status === "resolved").length;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden animate-in zoom-in-95 duration-200 my-6 max-h-[90vh] flex flex-col">
          
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 via-white to-indigo-50/30 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                    <LifeBuoy size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
                      SeyalPro Support Hub
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Store: <span className="font-bold text-zinc-800">{business?.name || "Your Store"}</span>
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => {
                  setActiveTab("list");
                  setSubmittedTicket(null);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                  activeTab === "list"
                    ? "bg-zinc-900 text-white shadow-md shadow-zinc-900/20"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                )}
              >
                <Clock size={14} />
                <span>Raised Issues & Status</span>
                {tickets.length > 0 && (
                  <span className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                    activeTab === "list" ? "bg-white/20 text-white" : "bg-zinc-300 text-zinc-800"
                  )}>
                    {tickets.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab("create");
                  setSubmittedTicket(null);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                  activeTab === "create"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                )}
              >
                <Plus size={14} />
                <span>Raise New Issue</span>
              </button>
            </div>
          </div>

          {/* Modal Body (Scrollable) */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">

            {/* ========================================================================= */}
            {/* TAB 1: LIST OF RAISED ISSUES & LIVE RESOLUTION STATUS                      */}
            {/* ========================================================================= */}
            {activeTab === "list" && (
              <div className="space-y-4">
                
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <Input
                      placeholder="Search tickets by ID, title, keyword..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs bg-zinc-50 border-zinc-200 focus:bg-white rounded-xl"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {(["all", "open", "in_progress", "resolved"] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all shrink-0",
                          statusFilter === st
                            ? "bg-zinc-800 text-white shadow-xs"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        )}
                      >
                        {st === "all" ? "All" : st.replace("_", " ")}
                      </button>
                    ))}

                    <button
                      onClick={fetchTickets}
                      disabled={loadingTickets}
                      className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
                      title="Refresh tickets"
                    >
                      <RefreshCw size={13} className={cn(loadingTickets && "animate-spin")} />
                    </button>
                  </div>
                </div>

                {/* Quick Status KPI Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 text-center">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Raised</p>
                    <p className="text-lg font-black text-zinc-900 mt-0.5">{tickets.length}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/70 text-center">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">In Progress / Open</p>
                    <p className="text-lg font-black text-amber-800 mt-0.5">{openTicketsCount}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 text-center">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Resolved</p>
                    <p className="text-lg font-black text-emerald-800 mt-0.5">{resolvedTicketsCount}</p>
                  </div>
                </div>

                {/* Ticket Cards List */}
                {loadingTickets ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
                    <Loader2 className="animate-spin text-indigo-600" size={24} />
                    <span>Loading your reported issues...</span>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="py-12 text-center rounded-2xl border-2 border-dashed border-zinc-200 p-6 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 size={24} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-zinc-800">
                        {searchQuery || statusFilter !== "all" ? "No matching tickets found" : "No issues reported yet"}
                      </h4>
                      <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                        {searchQuery || statusFilter !== "all"
                          ? "Try adjusting your search query or status filter."
                          : "Everything looks great! If you encounter any glitch or need support, raise an issue anytime."}
                      </p>
                    </div>
                    {!searchQuery && statusFilter === "all" && (
                      <Button
                        onClick={() => setActiveTab("create")}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl h-9 px-4"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Report an Issue Now
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTickets.map((ticket) => {
                      const CategoryInfo = CATEGORIES[ticket.category] || { label: ticket.category, icon: LifeBuoy };
                      const CategoryIcon = CategoryInfo.icon;

                      return (
                        <div
                          key={ticket.id}
                          className={cn(
                            "rounded-2xl border p-4 transition-all space-y-3",
                            ticket.status === "resolved"
                              ? "bg-emerald-50/20 border-emerald-200/80 shadow-xs"
                              : ticket.status === "in_progress"
                              ? "bg-indigo-50/20 border-indigo-200/80 shadow-xs"
                              : "bg-white border-zinc-200/90 shadow-xs"
                          )}
                        >
                          {/* Ticket Header Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                  #{ticket.ticket_number}
                                </span>

                                <span className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                                  <CategoryIcon size={12} className="text-zinc-400" />
                                  <span>{CategoryInfo.label}</span>
                                </span>

                                <span className="text-zinc-300">•</span>

                                <span className="text-[11px] text-zinc-400 font-medium">
                                  {new Date(ticket.created_at).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>

                              <h3 className="text-sm font-bold text-zinc-900 leading-snug">
                                {ticket.title}
                              </h3>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0">
                              {ticket.status === "resolved" && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs animate-in fade-in">
                                  <CheckCircle2 size={13} className="text-emerald-600 stroke-[3]" />
                                  <span>Resolved</span>
                                </span>
                              )}
                              {ticket.status === "in_progress" && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                  <Clock size={13} className="text-indigo-600 animate-spin" />
                                  <span>In Progress</span>
                                </span>
                              )}
                              {ticket.status === "open" && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <AlertTriangle size={13} className="text-amber-600" />
                                  <span>Open / Reviewing</span>
                                </span>
                              )}
                              {ticket.status === "closed" && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-300">
                                  <span>Closed</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap bg-zinc-50/80 p-3 rounded-xl border border-zinc-100">
                            {ticket.description}
                          </p>

                          {/* Screenshot Attachment Link */}
                          {ticket.attachment_url && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedImage(ticket.attachment_url)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-600 text-zinc-700 text-xs font-semibold border border-zinc-200 transition-colors"
                              >
                                <ImageIcon size={13} />
                                <span>View Attached Screenshot</span>
                              </button>
                            </div>
                          )}

                          {/* SEYALPRO RESOLUTION NOTE (Highlighted if present) */}
                          {ticket.resolution_notes && (
                            <div className="rounded-xl bg-emerald-50 border border-emerald-200/90 p-3.5 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-emerald-900 font-extrabold text-xs">
                                <Sparkles size={14} className="text-emerald-600" />
                                <span>SeyalPro Engineer Resolution / Note:</span>
                              </div>
                              <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap font-medium">
                                {ticket.resolution_notes}
                              </p>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: RAISE NEW ISSUE FORM                                              */}
            {/* ========================================================================= */}
            {activeTab === "create" && (
              <>
                {submittedTicket ? (
                  /* Success Screen */
                  <div className="text-center py-6 space-y-5 animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                      <CheckCircle2 size={36} className="animate-bounce" />
                    </div>

                    <div className="space-y-2">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Ticket Reference: #{submittedTicket.ticketNumber}
                      </span>
                      <h2 className="text-2xl font-extrabold text-zinc-900">
                        Issue Reported to SeyalPro!
                      </h2>
                      <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                        Thank you! Your issue report and screenshot have been directly delivered to SeyalPro engineering. You can track the status in real-time under the <strong>Raised Issues</strong> tab.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
                      <Button
                        onClick={() => {
                          handleResetForm();
                          setActiveTab("list");
                        }}
                        className="bg-zinc-900 hover:bg-black text-white font-bold px-6 h-10 rounded-xl shadow-md text-xs w-full sm:w-auto"
                      >
                        <Clock size={14} className="mr-1.5" />
                        View in Raised Issues List
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={handleResetForm}
                        className="text-xs font-bold rounded-xl h-10 w-full sm:w-auto"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Raise Another Issue
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Form */
                  <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Quick Topic Chips */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Quick Suggestions
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TOPICS.map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => setTitle(topic)}
                            className={cn(
                              "text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left font-medium",
                              title === topic
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-xs"
                                : "bg-zinc-50 border-zinc-200/80 text-zinc-600 hover:bg-zinc-100"
                            )}
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Issue Title *</label>
                      <Input
                        placeholder="e.g. Daily expense receipt scanner error"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className="h-10 bg-zinc-50 border-zinc-200 focus:bg-white text-xs rounded-xl"
                      />
                    </div>

                    {/* Category & Priority Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-700">Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold focus:bg-white text-zinc-800"
                        >
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-700">Priority / Severity</label>
                        <div className="grid grid-cols-4 gap-1">
                          {PRIORITIES.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPriority(p.id)}
                              className={cn(
                                "py-2 rounded-xl text-[11px] font-bold border transition-all text-center",
                                priority === p.id
                                  ? `${p.color} ring-2 ring-indigo-500 shadow-xs`
                                  : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                              )}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Description */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Description & Steps to Reproduce *</label>
                      <textarea
                        rows={3}
                        placeholder="Explain what happened, steps to reproduce, and any relevant details..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-zinc-900"
                      />
                    </div>

                    {/* Screenshot Attachment */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                        <span>Attach Screenshot (Optional)</span>
                        <span className="text-[11px] text-zinc-400 font-normal">Max 5MB (PNG/JPG)</span>
                      </label>

                      {screenshotBase64 ? (
                        <div className="relative rounded-2xl border border-indigo-200 p-2.5 bg-indigo-50/40 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <img
                              src={screenshotBase64}
                              alt="Screenshot preview"
                              className="w-12 h-12 object-cover rounded-xl border border-indigo-200 shrink-0"
                            />
                            <div className="truncate text-xs">
                              <p className="font-bold text-zinc-800 truncate">{screenshotName || "screenshot.png"}</p>
                              <p className="text-[10px] text-emerald-600 font-semibold">Ready to upload</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setScreenshotBase64(null);
                              setScreenshotName("");
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"
                            title="Remove attachment"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-2xl p-4 text-center cursor-pointer transition-all space-y-1"
                        >
                          <UploadCloud size={20} className="mx-auto text-zinc-400" />
                          <p className="text-xs font-bold text-zinc-700">Click to upload screenshot</p>
                          <p className="text-[11px] text-zinc-400">PNG, JPG, or WebP up to 5MB</p>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActiveTab("list")}
                        className="rounded-xl text-xs h-10"
                      >
                        Back to List
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-gradient-to-r from-sky-600 via-indigo-600 to-indigo-700 hover:from-sky-500 hover:to-indigo-600 text-white font-bold rounded-xl px-6 h-10 shadow-md shadow-indigo-200 flex items-center gap-2 text-xs"
                      >
                        {isSubmitting ? (
                          <Loader2 className="animate-spin" size={15} />
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Submit Issue to SeyalPro</span>
                          </>
                        )}
                      </Button>
                    </div>

                  </form>
                )}
              </>
            )}

          </div>

        </div>
      </div>

      {/* FULL ZOOM IMAGE MODAL */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl p-2 border border-zinc-700">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black flex items-center justify-center text-sm font-bold z-10 transition-colors"
            >
              ✕
            </button>
            <img
              src={selectedImage}
              alt="Full screenshot inspection"
              className="max-h-[85vh] max-w-full object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}
    </>
  );
}
