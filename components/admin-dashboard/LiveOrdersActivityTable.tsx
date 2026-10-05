"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { format, isToday } from "date-fns";
import {
  Search,
  Calendar,
  Filter,
  Eye,
  XCircle,
  Printer,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  Clock,
  ArrowRight,
  ChevronDown,
  Sparkles,
  Layers,
  ArrowLeft
} from "lucide-react";
import { OrderReceiptModal, AdminOrderRecord } from "./OrderReceiptModal";
import Link from "next/link";

interface LiveOrdersActivityTableProps {
  orders: AdminOrderRecord[];
  isLoading: boolean;
  onRefresh: () => void;
  onAcceptOrder?: (orderId: string) => Promise<void>;
  onCancelOrder?: (orderId: string) => Promise<void>;
  storeName?: string;
  currencySymbol?: string;
}

export function LiveOrdersActivityTable({
  orders,
  isLoading,
  onRefresh,
  onAcceptOrder,
  onCancelOrder,
  storeName = "Main Store",
  currencySymbol = "₹",
}: LiveOrdersActivityTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [visibleCount, setVisibleCount] = useState<number>(10);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status match
      if (statusFilter !== "ALL") {
        const orderStatus = (order.status || "").toUpperCase();
        if (statusFilter === "WAITING" && !orderStatus.includes("WAIT") && !orderStatus.includes("PENDING")) {
          return false;
        }
        if (statusFilter === "ACCEPTED" && orderStatus !== "ACCEPTED") {
          return false;
        }
        if (statusFilter === "COMPLETED" && orderStatus !== "COMPLETED" && orderStatus !== "DELIVERED") {
          return false;
        }
        if (statusFilter === "CANCELLED" && orderStatus !== "CANCELLED") {
          return false;
        }
      }

      // Order type match
      if (orderTypeFilter !== "ALL") {
        const type = (order.table_number ? "DINE_IN" : (order.order_type || "TAKEAWAY")).toUpperCase();
        if (orderTypeFilter === "DINE_IN" && !type.includes("DINE")) return false;
        if (orderTypeFilter === "DELIVERY" && !type.includes("DELIV")) return false;
        if (orderTypeFilter === "TAKEAWAY" && (type.includes("DELIV") || type.includes("DINE"))) return false;
      }

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = order.id.toLowerCase().includes(q);
        const matchesCustomer = (order.customer_name || "").toLowerCase().includes(q);
        const matchesPhone = (order.customer_phone || "").toLowerCase().includes(q);
        const matchesTable = (order.table_number || "").toLowerCase().includes(q);
        if (!matchesId && !matchesCustomer && !matchesPhone && !matchesTable) {
          return false;
        }
      }

      return true;
    });
  }, [orders, statusFilter, orderTypeFilter, searchQuery]);

  const handleApplyFilter = () => {
    setVisibleCount(10);
  };

  const handleShowAll = () => {
    setStatusFilter("ALL");
    setOrderTypeFilter("ALL");
    setSearchQuery("");
    setVisibleCount(10);
  };

  const handleAcceptClick = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!onAcceptOrder) return;
    try {
      setUpdatingId(orderId);
      await onAcceptOrder(orderId);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenReceipt = (order: AdminOrderRecord) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
      {/* 1. PetPooja Header & Breadcrumb Bar */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span># Dashboard</span>
            <span>/</span>
            <span>Orders And Billing</span>
            <span>/</span>
            <span className="text-slate-800">Online Orders Activity</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 flex items-center gap-2">
            Online & Counter Orders Activity
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {filteredOrders.length} {filteredOrders.length === 1 ? "Order" : "Orders"}
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-all flex items-center gap-1.5 text-xs font-semibold shadow-2xs"
            title="Refresh Orders Feed"
          >
            <RefreshCw size={14} className={cn(isLoading && "animate-spin text-blue-600")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link
            href="/daily-sales"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 transition-all shadow-2xs"
          >
            <span>Full Analytics</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* 2. PetPooja Filter Bar (Direct reference to screenshot) */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Dropdown */}
          <div className="min-w-[150px] flex-1 sm:flex-initial">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="WAITING">Waiting For Acceptance</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="COMPLETED">Completed / Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="min-w-[130px] flex-1 sm:flex-initial">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="min-w-[130px] flex-1 sm:flex-initial">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              End Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          {/* Order No. or Search */}
          <div className="min-w-[170px] flex-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Order No. / Customer
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search order #, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          {/* Action Buttons: Apply & Show All */}
          <div className="flex items-end gap-2 pt-2 sm:pt-4 w-full sm:w-auto">
            <button
              onClick={handleApplyFilter}
              className="px-5 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition-all shadow-xs active:scale-95 flex-1 sm:flex-initial"
            >
              Apply
            </button>
            <button
              onClick={handleShowAll}
              className="px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs active:scale-95 flex-1 sm:flex-initial"
            >
              Show All
            </button>
          </div>
        </div>
      </div>

      {/* 3. PetPooja Styled Orders Table */}
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <th className="py-3.5 px-4 font-black">Order No.</th>
              <th className="py-3.5 px-4 font-black">Restaurant / Order From</th>
              <th className="py-3.5 px-4 font-black">Order Type</th>
              <th className="py-3.5 px-4 font-black">Customer Name</th>
              <th className="py-3.5 px-4 font-black">Date Time</th>
              <th className="py-3.5 px-4 font-black text-right">Total</th>
              <th className="py-3.5 px-4 font-black text-center">Status</th>
              <th className="py-3.5 px-4 font-black">Last Updated On</th>
              <th className="py-3.5 px-2 font-black text-center">AT</th>
              <th className="py-3.5 px-4 font-black text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center">
                  <div className="max-w-sm mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                      <ShoppingBag size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No Orders Found</p>
                    <p className="text-xs text-slate-500">
                      No matching sales or live counter orders found for the selected criteria.
                    </p>
                    <Link
                      href="/billing"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all shadow-xs"
                    >
                      <span>+ Create Live POS Bill</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              filteredOrders.slice(0, visibleCount).map((order) => {
                const totalRupees = (order.total_cents / 100).toFixed(2);
                const orderCode = order.id.slice(-7).toUpperCase();
                const paymentLabel = order.payment_mode === "cash" ? "Cash On Delivery" : "UPI Online Paid";
                const isWaiting = (order.status || "").toLowerCase().includes("wait") || (order.status || "").toLowerCase() === "pending";
                const isAccepted = (order.status || "").toLowerCase() === "accepted";
                const isCompleted = (order.status || "").toLowerCase() === "completed" || (order.status || "").toLowerCase() === "delivered";

                const dateFormatted = (() => {
                  try {
                    return format(new Date(order.created_at), "dd-MM-yyyy HH:mm:ss");
                  } catch {
                    return order.created_at;
                  }
                })();

                // Simulated or calculated elapsed minutes (AT)
                const elapsedMin = Math.max(1, Math.min(99, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)));

                return (
                  <tr
                    key={order.id}
                    onClick={() => handleOpenReceipt(order)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    {/* Order No. */}
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {orderCode}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        ({paymentLabel})
                      </div>
                    </td>

                    {/* Restaurant Order From */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">
                        {order.order_source || storeName}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Counter POS Register
                      </div>
                    </td>

                    {/* Order Type */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">
                        {order.table_number ? `Dine-in (Table ${order.table_number})` : order.order_type || "Delivery"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        [Advanced: No]
                      </div>
                    </td>

                    {/* Customer Name */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 truncate max-w-[130px]">
                        {order.customer_name || "Walk-in Guest"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {order.customer_phone ? `[${order.customer_phone}]` : "[Unregistered]"}
                      </div>
                    </td>

                    {/* Date Time */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {dateFormatted}
                    </td>

                    {/* Total Amount */}
                    <td className="py-3 px-4 text-right">
                      <span className="font-black text-sm text-slate-900">
                        {totalRupees}
                      </span>
                    </td>

                    {/* Status Badge (Matches PetPooja screenshot colors) */}
                    <td className="py-3 px-4 text-center">
                      {isWaiting ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-[#64748B] text-white font-extrabold text-[10px] uppercase tracking-wider shadow-2xs">
                          WAITING FOR ACCEPTANCE
                        </span>
                      ) : isAccepted ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-[#0284C7] text-white font-extrabold text-[10px] uppercase tracking-wider shadow-2xs">
                          ACCEPTED
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-[#16A34A] text-white font-extrabold text-[10px] uppercase tracking-wider shadow-2xs">
                          COMPLETED
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                          {order.status || "LOGGED"}
                        </span>
                      )}
                    </td>

                    {/* Last Updated On */}
                    <td className="py-3 px-4 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                      {dateFormatted}
                    </td>

                    {/* AT (Elapsed time in minutes) */}
                    <td className="py-3 px-2 text-center font-bold text-xs text-slate-700">
                      {elapsedMin}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {isWaiting && (
                          <button
                            onClick={(e) => handleAcceptClick(e, order.id)}
                            disabled={updatingId === order.id}
                            className="px-3 py-1 rounded bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs shadow-2xs transition-all active:scale-95"
                          >
                            {updatingId === order.id ? "..." : "Accept"}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenReceipt(order)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View Order Details"
                        >
                          <Eye size={16} />
                        </button>
                        {onCancelOrder && !isCompleted && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to cancel this order?")) {
                                onCancelOrder(order.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Cancel Order"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Bottom Footer with PetPooja "Load More" Button */}
      {filteredOrders.length > visibleCount && (
        <div className="p-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
          <button
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-bold shadow-2xs hover:shadow-xs transition-all active:scale-95"
          >
            Load More
          </button>
        </div>
      )}

      {/* Item Receipt Breakdown Modal */}
      <OrderReceiptModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOrder(null);
        }}
        storeName={storeName}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
