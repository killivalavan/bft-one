"use client";

import { useState } from "react";
import { X, FileText, Download, User, MapPin, Calendar, Building2, ShieldCheck } from "lucide-react";
import { generateBillPdf, BillPdfData } from "@/lib/utils/billPdf";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";

interface InvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: {
    orderId: string;
    items: any[];
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    paymentMode: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    date?: string;
  } | null;
}

export function InvoiceDetailsModal({ isOpen, onClose, orderData }: InvoiceDetailsModalProps) {
  const { business } = useTenant();
  const { toast } = useToast();

  const now = new Date();
  const defaultMonthYear = `INVOICE ${now.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}`;
  const defaultInvoiceDate = now.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  const defaultDueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  const [invoiceTitle, setInvoiceTitle] = useState(defaultMonthYear);
  const [customerName, setCustomerName] = useState(orderData?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(orderData?.customerPhone || "");
  const [customerAddress, setCustomerAddress] = useState(orderData?.customerAddress || "");
  const [customerGstin, setCustomerGstin] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(defaultInvoiceDate);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [tdsAmount, setTdsAmount] = useState<string>("0");
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen || !orderData) return null;

  async function handleDownload() {
    setIsGenerating(true);
    try {
      const tdsCents = Math.round((parseFloat(tdsAmount) || 0) * 100);

      const payload: BillPdfData = {
        orderId: orderData?.orderId || "INV-001",
        items: orderData?.items || [],
        subtotalCents: orderData?.subtotalCents || 0,
        taxCents: orderData?.taxCents || 0,
        totalCents: orderData?.totalCents || 0,
        paymentMode: orderData?.paymentMode || "CASH",
        customerName: customerName.trim() || orderData?.customerName || "Protechsoft Technologies Pvt Ltd",
        customerPhone: customerPhone.trim() || orderData?.customerPhone || "",
        customerAddress: customerAddress.trim() || "PACIFICA TECH PARK, Survey No.76, No.23, 2nd Floor, Block-1, Module No.2E, Core-3, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130",
        customerGstin: customerGstin.trim(),
        date: invoiceDate,
        dueDate: dueDate,
        invoiceTitle: invoiceTitle.trim() || defaultMonthYear,
        businessName: business?.name || "Brown fening tea",
        businessAddress: (business as any)?.address || "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130",
        businessPhone: (business as any)?.phone || "",
        businessGstin: (business as any)?.gstin || "",
        logoUrl: business?.logo_url || null,
        signatureUrl: (business as any)?.signature_url || "/default-signature.svg",
        currencySymbol: business?.currency_symbol || "₹",
        tdsCents: tdsCents > 0 ? tdsCents : 0,
      };

      const savedName = await generateBillPdf(payload);
      toast({ title: "PDF Invoice Downloaded! 📄", description: `Saved as ${savedName}`, variant: "success" });
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to generate PDF", description: err?.message, variant: "error" });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-zinc-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black">Generate Official Invoice PDF</h3>
              <p className="text-xs text-indigo-100">Customise billed-to customer details &amp; dates (Optional)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Invoice Header Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="font-bold text-zinc-700 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-600" /> Title
              </label>
              <input
                type="text"
                value={invoiceTitle}
                onChange={(e) => setInvoiceTitle(e.target.value)}
                placeholder="e.g. INVOICE AUG 2026"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:border-indigo-600 outline-none text-xs font-bold text-zinc-900"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Invoice Date
              </label>
              <input
                type="text"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:border-indigo-600 outline-none text-xs font-semibold text-zinc-900"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Due Date
              </label>
              <input
                type="text"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:border-indigo-600 outline-none text-xs font-semibold text-zinc-900"
              />
            </div>
          </div>

          {/* Customer / Billed To Section */}
          <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                <Building2 className="w-4 h-4 text-indigo-600" /> Customer / Company Details (Billed To)
              </span>
              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-100 px-2 py-0.5 rounded-md">Optional</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-700">Client / Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Protechsoft Technologies Pvt Ltd"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:border-indigo-600 outline-none text-xs font-semibold text-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-700">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:border-indigo-600 outline-none text-xs font-semibold text-zinc-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700">Billing Address</label>
              <textarea
                rows={2}
                placeholder="e.g. PACIFICA TECH PARK, Survey No.76, 2nd Floor, Navalur, Chennai - 600130"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:border-indigo-600 outline-none text-xs text-zinc-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-700">Client GSTIN / Tax ID</label>
                <input
                  type="text"
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:border-indigo-600 outline-none text-xs text-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-700">TDS Deduction ₹ (Optional)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={tdsAmount}
                  onChange={(e) => setTdsAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:border-indigo-600 outline-none text-xs font-bold text-zinc-900"
                />
              </div>
            </div>
          </div>

          {/* Branding Info Notice */}
          <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-zinc-600 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Store Logo and Authorised Signature configured in <strong>Admin &gt; Store Profile</strong> will be included automatically.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            disabled={isGenerating}
            onClick={handleDownload}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download PDF Invoice</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
