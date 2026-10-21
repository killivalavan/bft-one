import { formatCafeName } from "./bakerUtils";

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
