import { formatCafeName } from "./bakerUtils.ts";

export interface WhatsAppSlipParams {
  slip: {
    invoiceNumber: string;
    date?: string;
    customerName: string;
    customerPhone?: string;
    totalAmount: number;
    status?: string;
    items: Array<{
      name: string;
      qty: number;
      rate: number;
      amount?: number;
    }>;
  };
  business?: {
    id?: string;
    name?: string;
    phone?: string | null;
    upi_id?: string | null;
  } | null;
  isReturn?: boolean;
}

export function formatSlipDisplayDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()] || d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatContactNumber(phoneStr?: string): string {
  if (!phoneStr) return "+91 98765 43210";
  const digits = phoneStr.replace(/[^0-9]/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phoneStr;
}

export function generateWhatsAppSlipMessage(params: WhatsAppSlipParams): { message: string; waUrl: string } {
  const { slip, business, isReturn } = params;

  // Resolve store contact and payment details from business profile & tenant cache
  let businessPhone = business?.phone?.trim() || "";
  let businessUpi = (business as any)?.upi_id?.trim() || "";

  if (typeof window !== "undefined" && business?.id) {
    try {
      const extraStr = localStorage.getItem(`bftone_tenant_extra_${business.id}`);
      if (extraStr) {
        const extra = JSON.parse(extraStr);
        if (!businessPhone && extra.phone) businessPhone = extra.phone.trim();
        if (!businessUpi && extra.upi_id) businessUpi = extra.upi_id.trim();
      }
    } catch {}
  }

  const bizDisplayName = (business?.name || "Royal Baker").toUpperCase();
  if (!businessUpi && (bizDisplayName.includes("ROYAL") || !business?.name)) {
    businessUpi = "royalbaker@okaxis";
  }

  const contactFormatted = formatContactNumber(businessPhone);
  const divider = "━━━━━━━━━━━━━━━━━━";
  const displayDate = formatSlipDisplayDate(slip.date);
  const formattedStore = formatCafeName(slip.customerName);
  const absTotal = Math.abs(slip.totalAmount || 0);

  const itemsLines = (slip.items || []).map((it) => {
    const itAmt = Math.abs(it.amount !== undefined ? it.amount : it.qty * it.rate);
    return `📦 ${it.qty} × ${it.name} @ ₹${it.rate} = ${isReturn ? "-" : ""}₹${itAmt.toLocaleString("en-IN")}`;
  });

  const paymentLines: string[] = [];
  if (businessUpi) {
    paymentLines.push(`💳 *UPI ID:* \`${businessUpi}\``);
  }
  if (contactFormatted) {
    paymentLines.push(`📞 *Contact:* ${contactFormatted}`);
  }
  const paymentBlock = paymentLines.length > 0 ? `\n\n${paymentLines.join("\n")}` : "";

  const message = isReturn
    ? `🔄 *RETURN & CREDIT SLIP – ${bizDisplayName}* 🧾\n\n` +
      `📅 *Date:* ${displayDate}\n` +
      `🏪 *Store:* ${formattedStore}\n` +
      `🔖 *Slip No:* ${slip.invoiceNumber}\n\n` +
      `📦 *Returned / Expired Items Taken Back:*\n\n` +
      `${itemsLines.join("\n")}\n\n` +
      `${divider}\n` +
      `📉 *Total Deducted Amount: -₹${absTotal.toLocaleString("en-IN")}*\n` +
      `📌 *Balance Adjustment:* Deducted from outstanding due balance\n` +
      `${divider}` +
      paymentBlock +
      `\n\n🙏 Thank you! Items successfully received & credited. 🤝✨`
    : `🧾 *DELIVERY SLIP – ${bizDisplayName}* 🍰\n\n` +
      `📅 *Date:* ${displayDate}\n` +
      `🏪 *Store:* ${formattedStore}\n` +
      `🔖 *Slip No:* ${slip.invoiceNumber}\n\n` +
      `📦 *Dispatched Items:*\n\n` +
      `${itemsLines.join("\n")}\n\n` +
      `${divider}\n` +
      `💰 *Total Amount: ₹${absTotal.toLocaleString("en-IN")}*\n` +
      `📌 *Payment Status:* ${slip.status === "paid" ? "✅ Settled (Paid)" : "⏳ Pending Settlement"}\n` +
      `${divider}` +
      paymentBlock +
      `\n\n🙏 Thank you for your business and continued support! 🤝✨`;

  const phoneClean = (slip.customerPhone || "").replace(/[^0-9]/g, "");
  const targetPhone = phoneClean ? (phoneClean.startsWith("91") ? phoneClean : `91${phoneClean}`) : "";

  // Direct api.whatsapp.com URL avoids wa.me 302 HTTP redirect which causes emoji character corruption
  const waUrl = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, waUrl };
}

/**
 * Normalizes a raw dispatch record (whether from relational b2b_dispatches or JSONB _b2b_data)
 * into a consistent, robust B2B dispatch contract with balance calculation and return detection.
 */
export function normalizeDispatch(inv: any) {
  if (!inv) return inv;
  const rawTotal = Number(inv.totalAmount !== undefined && inv.totalAmount !== null ? inv.totalAmount : (inv.total_amount ?? 0));
  const totalAmount = Number.isFinite(rawTotal) ? rawTotal : 0;

  const rawPaid = Number(inv.paidAmount !== undefined && inv.paidAmount !== null ? inv.paidAmount : (inv.paid_amount ?? 0));
  const paidAmount = Number.isFinite(rawPaid) ? rawPaid : 0;

  const rawDue = Number(inv.balanceDue !== undefined && inv.balanceDue !== null ? inv.balanceDue : (inv.balance_due ?? (totalAmount - paidAmount)));
  const balanceDue = Number.isFinite(rawDue) ? rawDue : Math.max(0, totalAmount - paidAmount);

  const customerName = inv.customerName || inv.client_name || inv.customer_name || "Partner Store";
  const invoiceNumber = inv.invoiceNumber || inv.slip_number || inv.invoice_number || `SLIP-${inv.id || "0"}`;
  const customerPhone = inv.customerPhone || inv.client_phone || inv.customer_phone || "";
  const customerAddress = inv.customerAddress || inv.client_address || inv.customer_address || "";
  const clientId = inv.clientId || inv.client_id || "";

  const rawStatus = String(inv.status || "").toLowerCase();
  const status = (rawStatus === "paid" || balanceDue <= 0) ? "paid" : "unpaid";

  const isReturn = Boolean(
    inv.isReturn ||
    (invoiceNumber || "").startsWith("RET-") ||
    (inv.title || "").includes("RETURN") ||
    totalAmount < 0
  );

  return {
    ...inv,
    id: inv.id || invoiceNumber,
    invoiceNumber,
    slip_number: invoiceNumber,
    customerName,
    client_name: customerName,
    customerPhone,
    client_phone: customerPhone,
    customerAddress,
    client_address: customerAddress,
    clientId,
    client_id: clientId,
    totalAmount,
    total_amount: totalAmount,
    paidAmount,
    paid_amount: paidAmount,
    balanceDue,
    balance_due: balanceDue,
    status,
    isReturn,
    title: inv.title || (isReturn ? "RETURN & CREDIT SLIP" : "DELIVERY SLIP"),
    date: inv.date || inv.invoice_date || (inv.created_at ? inv.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
  };
}

