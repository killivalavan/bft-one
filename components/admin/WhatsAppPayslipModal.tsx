"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Phone, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.031 2C6.516 2 2.022 6.495 2.022 12.01C2.022 13.774 2.482 15.503 3.355 17.022L2 22L7.126 20.672C8.614 21.488 10.297 21.919 12.027 21.919C17.544 21.919 22.038 17.424 22.038 11.909C22.038 6.495 17.544 2 12.031 2ZM12.031 20.219C10.518 20.219 9.043 19.814 7.747 19.043L7.442 18.862L4.398 19.659L5.213 16.697L5.014 16.381C4.167 15.032 3.722 13.538 3.722 12.01C3.722 7.433 7.452 3.702 12.031 3.702C16.611 3.702 20.34 7.433 20.34 12.01C20.34 16.587 16.611 20.219 12.031 20.219ZM16.592 14.542C16.342 14.417 15.118 13.817 14.893 13.734C14.668 13.651 14.501 13.609 14.334 13.859C14.167 14.109 13.692 14.668 13.546 14.835C13.4 15.002 13.254 15.023 13.004 14.898C12.754 14.773 11.947 14.509 10.993 13.659C10.249 12.996 9.749 12.179 9.599 11.929C9.449 11.679 9.584 11.543 9.709 11.418C9.822 11.305 9.959 11.126 10.084 10.98C10.209 10.834 10.251 10.73 10.334 10.563C10.417 10.396 10.375 10.25 10.313 10.125C10.251 10 9.751 8.771 9.543 8.271C9.34 7.784 9.134 7.85 8.977 7.842C8.831 7.834 8.664 7.834 8.497 7.834C8.33 7.834 8.059 7.896 7.83 8.146C7.601 8.396 6.955 9 6.955 10.23C6.955 11.46 7.851 12.648 7.976 12.815C8.101 12.982 9.73 15.492 12.219 16.568C12.811 16.824 13.27 16.976 13.631 17.091C14.225 17.28 14.767 17.253 15.195 17.189C15.672 17.118 16.662 16.59 16.87 16.007C17.078 15.424 17.078 14.924 17.016 14.819C16.954 14.714 16.842 14.667 16.592 14.542Z" />
    </svg>
  );
}

export function formatWhatsAppPhone(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, "");
  if (!clean) return "";
  // If 10-digit Indian mobile number, prefix with 91
  if (clean.length === 10) return `91${clean}`;
  return clean;
}

export interface WhatsAppPayslipModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  employeeName: string;
  contactNumber?: string | null;
  monthLabel: string;
  monthDate: Date;
  onDownloadPayslip: (userId: string, date: Date) => Promise<any>;
  onSavePhone?: (newPhone: string) => Promise<void>;
}

export function WhatsAppPayslipModal({
  open,
  onClose,
  userId,
  employeeName,
  contactNumber = "",
  monthLabel,
  monthDate,
  onDownloadPayslip,
  onSavePhone,
}: WhatsAppPayslipModalProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [phone, setPhone] = useState(contactNumber || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setPhone(contactNumber || "");
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, contactNumber]);

  if (!mounted || !open) return null;

  async function handleOpenWhatsApp() {
    const rawClean = phone.replace(/[^0-9]/g, "");
    if (!rawClean) {
      toast({
        title: "Phone Number Required",
        description: "Please enter the employee's WhatsApp number to open their chat.",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save phone number to profile so it's remembered
      if (onSavePhone && phone.trim()) {
        try {
          await onSavePhone(phone.trim());
        } catch (e) {
          console.warn("Could not save phone to profile:", e);
        }
      }

      // 2. Download payslip PDF
      const pdfResult = await onDownloadPayslip(userId, monthDate);

      let publicPdfUrl = "";
      if (pdfResult && pdfResult.blob) {
        try {
          const uploadData = new FormData();
          uploadData.append("file", pdfResult.blob, pdfResult.fileName || "payslip.pdf");
          uploadData.append("userId", userId);
          uploadData.append("monthLabel", monthLabel);

          const upRes = await fetch("/api/payslips/upload", {
            method: "POST",
            body: uploadData,
          });

          if (upRes.ok) {
            const data = await upRes.json();
            if (data.url) publicPdfUrl = data.url;
          }
        } catch (upErr) {
          console.warn("Could not upload PDF to cloud storage:", upErr);
        }
      }

      const cleanEmpName = employeeName
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const message = publicPdfUrl
        ? `📄 *Official Payslip — ${monthLabel.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
👤 *Employee:* ${cleanEmpName}
📅 *Period:* ${monthLabel}
━━━━━━━━━━━━━━━━━━━━
📥 *View & Download Payslip PDF:*
${publicPdfUrl}
━━━━━━━━━━━━━━━━━━━━
_Generated via SeyalPro Portal._`
        : `📄 *Official Payslip — ${monthLabel.toUpperCase()}*
👤 *Employee:* ${cleanEmpName}
(Payslip PDF document downloaded to device)`;

      // 3. Open WhatsApp Web directly to employee's chat with message ready to send
      const cleanPhone = formatWhatsAppPhone(phone);
      const encoded = encodeURIComponent(message);
      const webUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
      window.open(webUrl, "_blank");

      toast({
        title: "WhatsApp Web Opened 💬",
        description: "Payslip message with PDF link loaded in chat. Just press Send!",
        variant: "success",
      });

      onClose();
    } catch (e: any) {
      toast({
        title: "Download Failed",
        description: e?.message || "Could not generate payslip PDF.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const cleanEmpName = employeeName
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center text-white shrink-0">
              <WhatsAppIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Share to WhatsApp Web</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                {cleanEmpName} • {monthLabel}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div className="text-xs text-zinc-600 leading-relaxed">
            Enter <strong className="text-zinc-900">{cleanEmpName}&apos;s</strong> WhatsApp mobile number. Clicking continue will download the official PDF payslip and take you straight to their chat on WhatsApp Web.
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
              <Phone size={13} className="text-emerald-600" /> WhatsApp Number
            </label>
            <Input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleOpenWhatsApp();
                }
              }}
              autoFocus
              className="bg-zinc-50 border-zinc-300 focus:bg-white focus:border-emerald-600 focus:ring-emerald-500/20 text-sm font-medium h-10"
            />
            <p className="text-[11px] text-zinc-400">
              Standard 10-digit numbers will auto-prefix with +91.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-2.5">
          <Button
            variant="ghost"
            onClick={onClose}
            className="font-semibold text-zinc-600 hover:bg-zinc-200/80 text-xs sm:text-sm h-9.5"
          >
            Cancel
          </Button>

          <Button
            onClick={handleOpenWhatsApp}
            disabled={isSubmitting || !phone.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 text-xs sm:text-sm h-9.5 px-4 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Opening...</span>
              </>
            ) : (
              <>
                <WhatsAppIcon className="w-4 h-4" />
                <span>Open in WhatsApp Web</span>
                <ExternalLink size={13} className="opacity-80" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
