"use client";

import React from "react";
import { X, Printer, CheckCircle2, Clock, MapPin, Phone, CreditCard, Banknote, Coffee } from "lucide-react";
import { format } from "date-fns";

export interface OrderDetailItem {
  id?: string;
  product_id?: string;
  name?: string;
  qty: number;
  price_cents: number;
  unit_label?: string;
}

export interface AdminOrderRecord {
  id: string;
  business_id?: string | null;
  total_cents: number;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  discount_cents?: number | null;
  status: string;
  payment_mode?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  table_number?: string | null;
  created_at: string;
  order_source?: string | null;
  order_type?: string | null;
  order_items?: OrderDetailItem[];
}

interface OrderReceiptModalProps {
  order: AdminOrderRecord | null;
  isOpen: boolean;
  onClose: () => void;
  storeName?: string;
  currencySymbol?: string;
}

export function OrderReceiptModal({
  order,
  isOpen,
  onClose,
  storeName = "SeyalPro Store",
  currencySymbol = "₹",
}: OrderReceiptModalProps) {
  if (!isOpen || !order) return null;

  const totalRupees = (order.total_cents / 100).toFixed(2);
  const subtotalRupees = ((order.subtotal_cents || order.total_cents) / 100).toFixed(2);
  const taxRupees = ((order.tax_cents || 0) / 100).toFixed(2);
  const discountRupees = ((order.discount_cents || 0) / 100).toFixed(2);

  const formattedDate = (() => {
    try {
      return format(new Date(order.created_at), "dd-MM-yyyy hh:mm a");
    } catch {
      return order.created_at;
    }
  })();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Coffee size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight">Order #{order.id.slice(-6).toUpperCase()}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {order.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">{storeName} • {formattedDate}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 divide-y divide-slate-100 text-slate-800">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Order Type</span>
              <span className="font-bold text-slate-900">
                {order.table_number ? `Dine-in (Table ${order.table_number})` : order.order_type || "Takeaway / Direct"}
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Payment Method</span>
              <span className="font-bold text-slate-900 flex items-center gap-1.5 capitalize">
                {order.payment_mode === "cash" ? (
                  <Banknote size={14} className="text-emerald-600" />
                ) : (
                  <CreditCard size={14} className="text-blue-600" />
                )}
                {order.payment_mode || "Counter Cash"}
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Customer</span>
              <span className="font-bold text-slate-900 truncate block">
                {order.customer_name || "Walk-in Guest"}
              </span>
              {order.customer_phone && (
                <span className="text-[11px] text-slate-500 font-medium block">{order.customer_phone}</span>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="pt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Itemized Bill</h4>
            {order.order_items && order.order_items.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {order.order_items.map((item, idx) => {
                      const itemTotal = ((item.price_cents * item.qty) / 100).toFixed(2);
                      const unitPrice = (item.price_cents / 100).toFixed(2);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{item.name || "Item"}</td>
                          <td className="py-2.5 px-3 text-center font-medium">{item.qty}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-600">{currencySymbol}{unitPrice}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">{currencySymbol}{itemTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center text-xs text-slate-500">
                Single bill register order (Total: {currencySymbol}{totalRupees})
              </div>
            )}
          </div>

          {/* Financial Summary */}
          <div className="pt-4 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-semibold">{currencySymbol}{subtotalRupees}</span>
            </div>
            {Number(discountRupees) > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount applied:</span>
                <span>-{currencySymbol}{discountRupees}</span>
              </div>
            )}
            {Number(taxRupees) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Taxes & GST:</span>
                <span className="font-semibold">{currencySymbol}{taxRupees}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-base font-extrabold text-slate-900">
              <span>Net Total Amount:</span>
              <span className="text-[#2563EB] text-xl">{currencySymbol}{totalRupees}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs"
          >
            <Printer size={15} />
            <span>Print Receipt</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
