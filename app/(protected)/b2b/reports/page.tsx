"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { supabaseClient } from "@/lib/supabaseClient";
import { format, addMonths, subMonths } from "date-fns";
import {
  FileSpreadsheet, TrendingUp, TrendingDown, Store, Package, Receipt,
  Calendar, ArrowRight, Search, Download, CheckCircle2,
  PieChart, DollarSign, ChevronLeft, ChevronRight
} from "lucide-react";
import { INITIAL_BAKER_PRODUCTS, BakerProduct, capitalizeWords } from "../products/page";
import { formatCafeName } from "@/lib/utils/bakerUtils";

export default function BakerReportsPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const bizId = business?.id || "default";

  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [products, setProducts] = useState<BakerProduct[]>(INITIAL_BAKER_PRODUCTS);

  // Period Filters: "month" | "year" | "all"
  const [periodMode, setPeriodMode] = useState<"month" | "year" | "all">("month");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [selectedYear, setSelectedYear] = useState<string>(format(new Date(), "yyyy"));

  // Tab View: "cafe" | "product"
  const [activeView, setActiveView] = useState<"cafe" | "product">("cafe");
  const [searchQuery, setSearchQuery] = useState("");

  // Load Invoices, Expenses, Products
  useEffect(() => {
    try {
      // 1. Invoices
      const storedInvs = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (storedInvs) setInvoices(JSON.parse(storedInvs));

      // 2. Expenses
      const storedExp = localStorage.getItem(`bftone_baker_expenses_${bizId}`);
      if (storedExp) setExpenses(JSON.parse(storedExp));

      // 3. Products
      const storedProds = localStorage.getItem(`bftone_baker_products_${bizId}`);
      if (storedProds) {
        const parsed = JSON.parse(storedProds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
        }
      }
    } catch {}

    if (business?.id) {
      supabaseClient
        .from("invoices")
        .select("*")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            const mapped = data.map((d: any) => ({
              id: d.id,
              invoiceNumber: d.invoice_number,
              customerName: d.customer_name,
              totalAmount: (d.total_cents || 0) / 100,
              status: d.status || "unpaid",
              date: d.invoice_date || format(new Date(), "MMM dd, yyyy"),
              createdAt: d.created_at,
              items: d.items || [],
            }));
            setInvoices(mapped);
          }
        });
    }
  }, [bizId, business?.id]);

  // Product Map for quick cost lookup
  const productCostMap = useMemo(() => {
    const map: Record<string, { selling_price: number; making_cost: number; unit_profit: number }> = {};
    products.forEach((p) => {
      const cleanKey = p.name.trim().toLowerCase();
      map[cleanKey] = {
        selling_price: p.selling_price,
        making_cost: p.making_cost,
        unit_profit: p.unit_profit,
      };
    });
    return map;
  }, [products]);

  // Parse invoice date reliably
  const getInvoiceDateInfo = (inv: any) => {
    let d = new Date();
    if (inv.createdAt) {
      const parsed = new Date(inv.createdAt);
      if (!isNaN(parsed.getTime())) d = parsed;
    } else if (inv.date) {
      const parsed = new Date(inv.date);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
    return {
      dateObj: d,
      monthKey: format(d, "yyyy-MM"),
      monthLabel: format(d, "MMMM yyyy"),
      yearKey: format(d, "yyyy"),
    };
  };

  // Available Months & Years for Select Dropdowns
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      const { monthKey } = getInvoiceDateInfo(inv);
      set.add(monthKey);
    });
    // Ensure current month is present
    set.add(format(new Date(), "yyyy-MM"));
    return Array.from(set).sort().reverse();
  }, [invoices]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      const { yearKey } = getInvoiceDateInfo(inv);
      set.add(yearKey);
    });
    set.add(format(new Date(), "yyyy"));
    return Array.from(set).sort().reverse();
  }, [invoices]);

  // Filtered Invoices according to chosen Period
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const { monthKey, yearKey } = getInvoiceDateInfo(inv);
      if (periodMode === "month") {
        return monthKey === selectedMonth;
      }
      if (periodMode === "year") {
        return yearKey === selectedYear;
      }
      return true; // "all"
    });
  }, [invoices, periodMode, selectedMonth, selectedYear]);

  // 1. CAFÉ-WISE PROFIT BREAKDOWN
  const cafeProfitData = useMemo(() => {
    const map: Record<
      string,
      {
        cafeName: string;
        slipsCount: number;
        revenue: number;
        cost: number;
        profit: number;
        unpaidDues: number;
      }
    > = {};

    filteredInvoices.forEach((inv) => {
      const cafeName = formatCafeName(inv.customerName || "Store");
      if (!map[cafeName]) {
        map[cafeName] = {
          cafeName,
          slipsCount: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          unpaidDues: 0,
        };
      }

      map[cafeName].slipsCount += 1;
      const slipAmount = inv.totalAmount || 0;
      map[cafeName].revenue += slipAmount;

      if (inv.status === "unpaid") {
        map[cafeName].unpaidDues += slipAmount;
      }

      // Compute item-level cost and profit
      let slipCost = 0;
      (inv.items || []).forEach((it: any) => {
        const qty = Number(it.qty) || 0;
        const itName = (it.name || "").trim().toLowerCase();
        const pInfo = productCostMap[itName];
        const unitCost = pInfo ? pInfo.making_cost : (Number(it.rate) || 0) * 0.4;
        slipCost += qty * unitCost;
      });

      map[cafeName].cost += slipCost;
      map[cafeName].profit += slipAmount - slipCost;
    });

    const list = Object.values(map).map((c) => ({
      ...c,
      marginPct: c.revenue > 0 ? Math.round((c.profit / c.revenue) * 100) : 0,
    }));

    return list.sort((a, b) => b.profit - a.profit);
  }, [filteredInvoices, productCostMap]);

  // 2. PRODUCT-WISE PROFIT BREAKDOWN
  const productProfitData = useMemo(() => {
    const map: Record<
      string,
      {
        productName: string;
        piecesSold: number;
        sellingPrice: number;
        makingCost: number;
        revenue: number;
        cost: number;
        profit: number;
      }
    > = {};

    filteredInvoices.forEach((inv) => {
      (inv.items || []).forEach((it: any) => {
        const pName = capitalizeWords(it.name || "Product Item");
        const cleanKey = (it.name || "").trim().toLowerCase();
        const qty = Number(it.qty) || 0;
        const rate = Number(it.rate) || 0;
        const amount = Number(it.amount) || qty * rate;

        const pInfo = productCostMap[cleanKey];
        const unitCost = pInfo ? pInfo.making_cost : rate * 0.4;
        const totalCost = qty * unitCost;
        const profit = amount - totalCost;

        if (!map[cleanKey]) {
          map[cleanKey] = {
            productName: pName,
            piecesSold: 0,
            sellingPrice: rate || (pInfo ? pInfo.selling_price : 0),
            makingCost: unitCost,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }

        map[cleanKey].piecesSold += qty;
        map[cleanKey].revenue += amount;
        map[cleanKey].cost += totalCost;
        map[cleanKey].profit += profit;
      });
    });

    const list = Object.values(map).map((p) => ({
      ...p,
      marginPct: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0,
    }));

    return list.sort((a, b) => b.profit - a.profit);
  }, [filteredInvoices, productCostMap]);

  // Aggregate Metrics for Selected Period
  const periodTotalRevenue = useMemo(() => {
    return filteredInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  }, [filteredInvoices]);

  const periodTotalCost = useMemo(() => {
    return cafeProfitData.reduce((acc, c) => acc + c.cost, 0);
  }, [cafeProfitData]);

  const periodTotalProfit = periodTotalRevenue - periodTotalCost;
  const periodMarginPct =
    periodTotalRevenue > 0 ? Math.round((periodTotalProfit / periodTotalRevenue) * 100) : 0;
  const isProfitPositive = periodTotalProfit >= 0;
  const isMarginPositive = periodMarginPct >= 0;

  // Filtered views based on search query
  const filteredCafes = useMemo(() => {
    if (!searchQuery.trim()) return cafeProfitData;
    const q = searchQuery.toLowerCase();
    return cafeProfitData.filter((c) => c.cafeName.toLowerCase().includes(q));
  }, [cafeProfitData, searchQuery]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return productProfitData;
    const q = searchQuery.toLowerCase();
    return productProfitData.filter((p) => p.productName.toLowerCase().includes(q));
  }, [productProfitData, searchQuery]);

  // Current Month/Year keys for quick reset and future bounds
  const currentMonthKey = useMemo(() => format(new Date(), "yyyy-MM"), []);
  const currentYearKey = useMemo(() => format(new Date(), "yyyy"), []);
  const isCurrentMonth = selectedMonth === currentMonthKey;
  const isCurrentYear = selectedYear === currentYearKey;

  // Arrow Navigation: Month (-1 = Previous, +1 = Next)
  const handleNavigateMonth = (direction: -1 | 1) => {
    try {
      const [y, m] = selectedMonth.split("-").map(Number);
      const currentDate = new Date(y, m - 1, 1);
      const targetDate = direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
      setSelectedMonth(format(targetDate, "yyyy-MM"));
    } catch {
      setSelectedMonth(currentMonthKey);
    }
  };

  // Arrow Navigation: Year (-1 = Previous, +1 = Next)
  const handleNavigateYear = (direction: -1 | 1) => {
    try {
      const y = parseInt(selectedYear);
      setSelectedYear(String(y + direction));
    } catch {
      setSelectedYear(currentYearKey);
    }
  };

  // Period Title Label
  const periodLabel = useMemo(() => {
    if (periodMode === "month") {
      try {
        const [y, m] = selectedMonth.split("-");
        const dateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
        return format(dateObj, "MMMM yyyy");
      } catch {
        return selectedMonth;
      }
    }
    if (periodMode === "year") return `Year ${selectedYear}`;
    return "All Time";
  }, [periodMode, selectedMonth, selectedYear]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      toast({
        title: "No Data",
        description: "No delivery slips recorded for the selected period.",
        variant: "error",
      });
      return;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel

    if (activeView === "cafe") {
      // Export Café-wise Profit Breakdown
      csvContent += `CAFE PROFIT STATEMENT - ${periodLabel.toUpperCase()}\n`;
      csvContent += `Generated Date: ${format(new Date(), "dd-MMM-yyyy")}\n\n`;
      csvContent += "Cafe / Store Name,Delivery Slips,Billed Revenue (INR),Production Cost (INR),Net Profit (INR),Profit Margin (%),Pending Dues (INR)\n";

      cafeProfitData.forEach((c) => {
        csvContent += `"${c.cafeName}",${c.slipsCount},${c.revenue},${Math.round(c.cost)},${Math.round(c.profit)},${c.marginPct}%,${c.unpaidDues}\n`;
      });

      csvContent += `\nTOTAL,${filteredInvoices.length},${periodTotalRevenue},${Math.round(periodTotalCost)},${Math.round(periodTotalProfit)},${periodMarginPct}%,-\n`;
    } else {
      // Export Product-wise Profit Breakdown
      csvContent += `PRODUCT PROFIT STATEMENT - ${periodLabel.toUpperCase()}\n`;
      csvContent += `Generated Date: ${format(new Date(), "dd-MMM-yyyy")}\n\n`;
      csvContent += "Product Item,Pieces Dispatched,Unit Selling Price (INR),Unit Making Cost (INR),Total Revenue (INR),Total Cost (INR),Net Profit (INR),Profit Margin (%)\n";

      productProfitData.forEach((p) => {
        csvContent += `"${p.productName}",${p.piecesSold},${p.sellingPrice},${p.makingCost},${p.revenue},${Math.round(p.cost)},${Math.round(p.profit)},${p.marginPct}%\n`;
      });

      csvContent += `\nTOTAL,-,-,-,${periodTotalRevenue},${Math.round(periodTotalCost)},${Math.round(periodTotalProfit)},${periodMarginPct}%\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "_");
    link.download = `B2B_${activeView === "cafe" ? "Store" : "Product"}_Profit_${safePeriod}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Excel / CSV Exported! 📊",
      description: `Downloaded ${activeView === "cafe" ? "Café-wise" : "Product-wise"} profit report for ${periodLabel}.`,
      variant: "success",
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header - docks cleanly below AppShell mobile header on mobile */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-14 md:top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-lg sm:text-xl shadow-2xs shrink-0">
              📊
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h1 className="text-sm sm:text-xl font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                  Profit &amp; Analytics
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 shrink-0 whitespace-nowrap">
                  {periodLabel}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] hidden sm:block">
                Revenue, operational expenses, net margins &amp; store performance analytics
              </p>
            </div>
          </div>

          {/* Excel Export Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-extrabold bg-[#2563EB] hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet size={14} className="shrink-0" />
              <span>Export Financial Report (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* ==================================================== */}
        {/* PERIOD SELECTOR BAR (Month-wise / Year-wise / All)   */}
        {/* ==================================================== */}
        {/* ==================================================== */}
        {/* PERIOD SELECTOR BAR (Month-wise / Year-wise / All)   */}
        {/* ==================================================== */}
        <div className="bg-white p-4 rounded-3xl border border-[#E2E8F0] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Period Mode Pills - Full-width 3-way grid on mobile, flex on desktop */}
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200 w-full sm:w-auto shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => setPeriodMode("month")}
              className={cn(
                "w-full sm:w-auto px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap",
                periodMode === "month"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Calendar size={13} className="shrink-0" />
              <span>Month-wise</span>
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("year")}
              className={cn(
                "w-full sm:w-auto px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap",
                periodMode === "year"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <TrendingUp size={13} className="shrink-0" />
              <span>Year-wise</span>
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("all")}
              className={cn(
                "w-full sm:w-auto px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap",
                periodMode === "all"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <span>All Time</span>
            </button>
          </div>

          {/* Delivery Slips Indicator & Right-Aligned Calendar Arrow Navigator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-3 w-full lg:w-auto">
            {/* Delivery Slips Indicator (placed before months) */}
            <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap shrink-0">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                filteredInvoices.length > 0 ? "bg-blue-500" : "bg-slate-300"
              )} />
              <span>
                {filteredInvoices.length === 0 ? (
                  <>
                    <span className="text-slate-500 font-medium">No delivery</span>
                    {periodMode !== "all" && (
                      <span className="text-slate-400 font-medium"> in {periodLabel}</span>
                    )}
                  </>
                ) : (
                  <>
                    <strong className="text-[#0F172A] font-extrabold">{filteredInvoices.length}</strong> delivery {filteredInvoices.length === 1 ? "slip" : "slips"}
                    {periodMode !== "all" && (
                      <span className="text-slate-400 font-medium"> in {periodLabel}</span>
                    )}
                  </>
                )}
              </span>
            </div>

            {/* Calendar Left/Right Arrow Navigator (Pushed to the right) */}
            {periodMode === "month" && (
              <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-end">
                {/* Quick return to This Month (placed on the left of month navigator) */}
                {!isCurrentMonth && (
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(currentMonthKey)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-200/60 px-2.5 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap shadow-2xs active:scale-95"
                    title="Jump to Current Month"
                  >
                    This Month
                  </button>
                )}

                {/* Arrow Nav Pill Container (Far Right) */}
                <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/90 rounded-2xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleNavigateMonth(-1)}
                    className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-blue-600 hover:shadow-2xs transition-all cursor-pointer active:scale-95"
                    title="Previous Month"
                    aria-label="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="px-3 py-1 text-center min-w-[130px] sm:min-w-[155px] flex items-center justify-center gap-2">
                    <Calendar size={13} className="text-blue-600 shrink-0" />
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                      {periodLabel}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavigateMonth(1)}
                    disabled={isCurrentMonth}
                    className={cn(
                      "p-1.5 rounded-xl transition-all active:scale-95",
                      isCurrentMonth
                        ? "opacity-30 cursor-not-allowed text-slate-400"
                        : "hover:bg-white text-slate-600 hover:text-blue-600 hover:shadow-2xs cursor-pointer"
                    )}
                    title={isCurrentMonth ? "Current Month (Latest)" : "Next Month"}
                    aria-label="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {periodMode === "year" && (
              <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-end">
                {/* Quick return to This Year (placed on the left of year navigator) */}
                {!isCurrentYear && (
                  <button
                    type="button"
                    onClick={() => setSelectedYear(currentYearKey)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-200/60 px-2.5 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap shadow-2xs active:scale-95"
                    title="Jump to Current Year"
                  >
                    This Year
                  </button>
                )}

                {/* Arrow Nav Pill Container (Far Right) */}
                <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/90 rounded-2xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleNavigateYear(-1)}
                    className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-blue-600 hover:shadow-2xs transition-all cursor-pointer active:scale-95"
                    title="Previous Year"
                    aria-label="Previous Year"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="px-3 py-1 text-center min-w-[90px] sm:min-w-[110px] flex items-center justify-center gap-2">
                    <Calendar size={13} className="text-blue-600 shrink-0" />
                    <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] tracking-tight whitespace-nowrap">
                      Year {selectedYear}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavigateYear(1)}
                    disabled={isCurrentYear}
                    className={cn(
                      "p-1.5 rounded-xl transition-all active:scale-95",
                      isCurrentYear
                        ? "opacity-30 cursor-not-allowed text-slate-400"
                        : "hover:bg-white text-slate-600 hover:text-blue-600 hover:shadow-2xs cursor-pointer"
                    )}
                    title={isCurrentYear ? "Current Year (Latest)" : "Next Year"}
                    aria-label="Next Year"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* SUMMARY KPI CARDS (2x2 Mobile, 4-Col Desktop)        */}
        {/* ==================================================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Gross Sales */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">Gross Sales</p>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
                <Receipt size={18} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-[#0F172A] tabular-nums tracking-tight">
                ₹{periodTotalRevenue.toLocaleString("en-IN")}
              </h3>
              <p className="text-[10px] sm:text-xs text-blue-600 font-semibold mt-0.5 truncate">Dispatched to clients</p>
            </div>
          </div>

          {/* Card 2: Production Cost */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">Production Cost</p>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold shrink-0">
                <Package size={18} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-xl sm:text-2xl font-black text-slate-700 tabular-nums tracking-tight">
                ₹{Math.round(periodTotalCost).toLocaleString("en-IN")}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-0.5 truncate">Direct material &amp; packaging costs</p>
            </div>
          </div>

          {/* Card 3: Net Take-Home Profit (Dynamic Sentiment) */}
          <div className={cn(
            "p-3.5 sm:p-4 rounded-2xl border shadow-2xs flex flex-col justify-between transition-all",
            isProfitPositive
              ? "bg-emerald-50/70 border-emerald-200/80"
              : "bg-rose-50/80 border-rose-200/90"
          )}>
            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate",
                isProfitPositive ? "text-emerald-800" : "text-rose-800"
              )}>
                Net Profit
              </p>
              <div className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold shadow-2xs shrink-0 text-white",
                isProfitPositive ? "bg-emerald-600" : "bg-rose-600"
              )}>
                {isProfitPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </div>
            </div>
            <div className="mt-2">
              <h3 className={cn(
                "text-xl sm:text-2xl font-black tabular-nums tracking-tight",
                isProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}>
                {isProfitPositive ? "+" : ""}₹{Math.round(periodTotalProfit).toLocaleString("en-IN")}
              </h3>
              <p className={cn(
                "text-[10px] sm:text-xs font-semibold mt-0.5 truncate",
                isProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}>
                {isProfitPositive ? `Earned in ${periodLabel}` : `Net loss in ${periodLabel}`}
              </p>
            </div>
          </div>

          {/* Card 4: Profit Margin */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">Avg Margin</p>
              <div className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold shrink-0",
                isMarginPositive ? "bg-purple-50 text-purple-600 border border-purple-100" : "bg-rose-50 text-rose-600 border border-rose-200"
              )}>
                <PieChart size={18} />
              </div>
            </div>
            <div className="mt-2">
              <h3 className={cn(
                "text-xl sm:text-2xl font-black tabular-nums tracking-tight",
                isMarginPositive ? "text-[#0F172A]" : "text-rose-600"
              )}>
                {periodMarginPct}%
              </h3>
              <p className={cn(
                "text-[10px] sm:text-xs font-semibold mt-0.5 truncate",
                isMarginPositive ? "text-emerald-600" : "text-rose-500"
              )}>
                {isMarginPositive ? "Across dispatched items" : "Below breakeven target"}
              </p>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* VIEW SELECTOR: CAFÉ-WISE vs PRODUCT-WISE BREAKDOWN   */}
        {/* ==================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveView("cafe")}
              className={cn(
                "w-full sm:w-auto px-2.5 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeView === "cafe"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Store size={15} className="shrink-0 text-blue-600" />
              <span>Café Profit ({cafeProfitData.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("product")}
              className={cn(
                "w-full sm:w-auto px-2.5 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap",
                activeView === "product"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Package size={15} className="shrink-0 text-blue-600" />
              <span>Product Profit ({productProfitData.length})</span>
            </button>
          </div>

          <div className="relative flex-1 max-w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeView === "cafe" ? "Search client or store name..." : "Search product name..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: CAFÉ-WISE PROFIT                              */}
        {/* ==================================================== */}
        {activeView === "cafe" && (
          <div className="space-y-3">
            {/* Mobile Cards View (Visible on < md) */}
            <div className="block md:hidden space-y-3">
              {filteredCafes.map((c, idx) => (
                <div key={c.cafeName} className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-[#0F172A] tracking-tight truncate">
                          {formatCafeName(c.cafeName)}
                        </h4>
                        <span className="text-[10px] text-[#64748B] font-medium">Partner Store</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold shrink-0">
                      {c.slipsCount} slip{c.slipsCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Billed</p>
                      <p className="text-xs font-black text-[#0F172A] tabular-nums mt-0.5">₹{c.revenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Cost</p>
                      <p className="text-xs font-bold text-slate-600 tabular-nums mt-0.5">₹{Math.round(c.cost).toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Net Profit</p>
                      <p className={cn(
                        "text-xs font-black tabular-nums mt-0.5",
                        c.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {c.profit >= 0 ? "+" : ""}₹{Math.round(c.profit).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-black border",
                      c.marginPct >= 0
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    )}>
                      {c.marginPct}% Margin
                    </span>

                    <div>
                      {c.unpaidDues > 0 ? (
                        <span className="font-extrabold text-rose-600 text-xs tabular-nums">
                          Dues: ₹{c.unpaidDues.toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-600 text-xs">
                          ✓ Settled
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredCafes.length === 0 && (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 font-medium text-xs">
                  No café sales recorded for {periodLabel}.
                </div>
              )}

              {/* Mobile Total Card */}
              {filteredCafes.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>Period Total ({periodLabel})</span>
                    <span>{filteredInvoices.length} Slips</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-center">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Total Sales</p>
                      <p className="text-xs font-black text-white tabular-nums mt-0.5">₹{periodTotalRevenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Total Cost</p>
                      <p className="text-xs font-bold text-slate-300 tabular-nums mt-0.5">₹{Math.round(periodTotalCost).toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Net Profit</p>
                      <p className={cn(
                        "text-xs font-black tabular-nums mt-0.5",
                        isProfitPositive ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {isProfitPositive ? "+" : ""}₹{Math.round(periodTotalProfit).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Table View (Hidden on mobile, visible on >= md) */}
            <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider whitespace-nowrap">
                      <th className="py-3.5 px-4 min-w-[200px] whitespace-nowrap">Partner Café</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap">Deliveries</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Billed Revenue (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Making Cost (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Net Profit (₹)</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap">Profit Margin</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Pending Dues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                    {filteredCafes.map((c, idx) => (
                      <tr key={c.cafeName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px] shrink-0">
                              #{idx + 1}
                            </span>
                            <div>
                              <p className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap">{formatCafeName(c.cafeName)}</p>
                              <span className="text-[11px] text-[#64748B] font-medium whitespace-nowrap">Partner Store</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap">
                            {c.slipsCount} slip{c.slipsCount === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#0F172A] whitespace-nowrap tabular-nums">
                          ₹{c.revenue.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-600 whitespace-nowrap tabular-nums">
                          ₹{Math.round(c.cost).toLocaleString("en-IN")}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-black whitespace-nowrap text-sm tabular-nums",
                          c.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {c.profit >= 0 ? "+" : ""}₹{Math.round(c.profit).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap",
                            c.marginPct >= 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          )}>
                            {c.marginPct}% Margin
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums">
                          {c.unpaidDues > 0 ? (
                            <span className="font-extrabold text-rose-600 text-xs whitespace-nowrap">
                              ₹{c.unpaidDues.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-600 text-xs whitespace-nowrap">
                              ✓ Settled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredCafes.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold whitespace-nowrap">
                          No café sales recorded for {periodLabel}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {/* Total Summary Footer Row */}
                  {filteredCafes.length > 0 && (
                    <tfoot className="bg-[#F8FAFC] border-t-2 border-slate-200 font-extrabold text-xs text-[#0F172A]">
                      <tr>
                        <td className="py-3 px-4">Period Total ({periodLabel})</td>
                        <td className="py-3 px-4 text-center">{filteredInvoices.length} Slips</td>
                        <td className="py-3 px-4 text-right font-black tabular-nums">₹{periodTotalRevenue.toLocaleString("en-IN")}</td>
                        <td className="py-3 px-4 text-right text-slate-600 tabular-nums">₹{Math.round(periodTotalCost).toLocaleString("en-IN")}</td>
                        <td className={cn(
                          "py-3 px-4 text-right text-sm font-black tabular-nums",
                          isProfitPositive ? "text-emerald-700" : "text-rose-600"
                        )}>
                          {isProfitPositive ? "+" : ""}₹{Math.round(periodTotalProfit).toLocaleString("en-IN")}
                        </td>
                        <td className={cn(
                          "py-3 px-4 text-center",
                          isMarginPositive ? "text-emerald-700" : "text-rose-600"
                        )}>
                          {periodMarginPct}% Avg
                        </td>
                        <td className="py-3 px-4 text-right">-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: PRODUCT-WISE PROFIT                           */}
        {/* ==================================================== */}
        {activeView === "product" && (
          <div className="space-y-3">
            {/* Mobile Cards View (Visible on < md) */}
            <div className="block md:hidden space-y-3">
              {filteredProducts.map((p, idx) => (
                <div key={p.productName} className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-[#0F172A] tracking-tight truncate">
                          {capitalizeWords(p.productName)}
                        </h4>
                        <span className="text-[10px] text-[#64748B] font-medium">Catalog Item</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-black shrink-0">
                      {p.piecesSold} pcs
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-1 border-y border-slate-100">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Selling Price:</span>
                      <strong className="text-[#0F172A] tabular-nums">₹{p.sellingPrice}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Production Cost:</span>
                      <strong className="text-slate-700 tabular-nums">₹{p.makingCost}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Revenue</p>
                      <p className="text-xs font-black text-[#0F172A] tabular-nums mt-0.5">₹{p.revenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Total Cost</p>
                      <p className="text-xs font-bold text-slate-600 tabular-nums mt-0.5">₹{Math.round(p.cost).toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Net Profit</p>
                      <p className={cn(
                        "text-xs font-black tabular-nums mt-0.5",
                        p.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {p.profit >= 0 ? "+" : ""}₹{Math.round(p.profit).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-black border",
                      p.marginPct >= 0
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    )}>
                      {p.marginPct}% Margin
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      ₹{(p.sellingPrice - p.makingCost)} profit / unit
                    </span>
                  </div>
                </div>
              ))}

              {filteredProducts.length === 0 && (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 font-medium text-xs">
                  No product sales recorded for {periodLabel}.
                </div>
              )}

              {/* Mobile Total Card */}
              {filteredProducts.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>Period Total ({periodLabel})</span>
                    <span>{filteredProducts.reduce((acc, p) => acc + p.piecesSold, 0)} pcs sold</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-center">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Total Sales</p>
                      <p className="text-xs font-black text-white tabular-nums mt-0.5">₹{periodTotalRevenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Total Cost</p>
                      <p className="text-xs font-bold text-slate-300 tabular-nums mt-0.5">₹{Math.round(periodTotalCost).toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Net Profit</p>
                      <p className={cn(
                        "text-xs font-black tabular-nums mt-0.5",
                        isProfitPositive ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {isProfitPositive ? "+" : ""}₹{Math.round(periodTotalProfit).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Table View (Hidden on mobile, visible on >= md) */}
            <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider whitespace-nowrap">
                      <th className="py-3.5 px-4 min-w-[200px] whitespace-nowrap">Catalog Product</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap">Pieces Dispatched</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Selling Price (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Production Cost (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Total Revenue (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Total Cost (₹)</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Net Profit (₹)</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap">Margin (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
                    {filteredProducts.map((p, idx) => (
                      <tr key={p.productName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                              #{idx + 1}
                            </span>
                            <div>
                              <p className="font-extrabold text-sm text-[#0F172A] tracking-tight font-sans whitespace-nowrap">{capitalizeWords(p.productName)}</p>
                              <span className="text-[11px] text-[#64748B] font-medium whitespace-nowrap">Catalog Item</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap font-black text-blue-600 tabular-nums">
                          {p.piecesSold} pcs
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap text-[#0F172A] tabular-nums">
                          ₹{p.sellingPrice}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap text-slate-500 tabular-nums">
                          ₹{p.makingCost}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#0F172A] whitespace-nowrap tabular-nums">
                          ₹{p.revenue.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-600 whitespace-nowrap tabular-nums">
                          ₹{Math.round(p.cost).toLocaleString("en-IN")}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-black whitespace-nowrap text-sm tabular-nums",
                          p.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {p.profit >= 0 ? "+" : ""}₹{Math.round(p.profit).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap",
                            p.marginPct >= 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          )}>
                            {p.marginPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold whitespace-nowrap">
                          No product sales recorded for {periodLabel}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {/* Total Summary Footer Row */}
                  {filteredProducts.length > 0 && (
                    <tfoot className="bg-[#F8FAFC] border-t-2 border-slate-200 font-extrabold text-xs text-[#0F172A]">
                      <tr>
                        <td className="py-3 px-4 whitespace-nowrap">Period Total ({periodLabel})</td>
                        <td className="py-3 px-4 text-center text-blue-700 font-black whitespace-nowrap tabular-nums">
                          {filteredProducts.reduce((acc, p) => acc + p.piecesSold, 0)} pcs
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">-</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">-</td>
                        <td className="py-3 px-4 text-right font-black whitespace-nowrap tabular-nums">₹{periodTotalRevenue.toLocaleString("en-IN")}</td>
                        <td className="py-3 px-4 text-right text-slate-600 whitespace-nowrap tabular-nums">₹{Math.round(periodTotalCost).toLocaleString("en-IN")}</td>
                        <td className={cn(
                          "py-3 px-4 text-right text-sm font-black whitespace-nowrap tabular-nums",
                          isProfitPositive ? "text-emerald-700" : "text-rose-600"
                        )}>
                          {isProfitPositive ? "+" : ""}₹{Math.round(periodTotalProfit).toLocaleString("en-IN")}
                        </td>
                        <td className={cn(
                          "py-3 px-4 text-center whitespace-nowrap",
                          isMarginPositive ? "text-emerald-700" : "text-rose-600"
                        )}>
                          {periodMarginPct}% Avg
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
