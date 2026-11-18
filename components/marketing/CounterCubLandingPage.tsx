"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { DM_Sans, Manrope } from "next/font/google";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  BrainCircuit,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Coffee,
  FileSpreadsheet,
  FileText,
  Gauge,
  Globe,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Pill,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { validateTenantSlug } from "@/lib/utils/slugValidator";
import { getPlatformAdminUrl, getTenantUrl } from "@/lib/tenant/hostUrls";
import { CURRENCY_OPTIONS } from "@/lib/utils/currencies";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cc-dm-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cc-manrope",
  display: "swap",
});

export type LandingFaqItem = {
  question: string;
  answer: string;
};

type Partner = {
  name: string;
  category?: string;
  /** Use a transparent SVG/PNG logo in /public/partners, e.g. /partners/acme.svg */
  logoUrl?: string;
  websiteUrl?: string;
};

type CounterCubLandingPageProps = {
  /** Platform login URL. Defaults to the CounterCub app subdomain. */
  platformUrl?: string;
  /** Optional signup/onboarding URL. Defaults to the platform URL. */
  signupUrl?: string;
  /** Actual approved partner names/logos. Keep empty until verified partner details are ready. */
  partners?: Partner[];
  /** FAQ items passed from app/site/page.tsx to stay synced with FAQPage JSON-LD. */
  faqs?: LandingFaqItem[];
};

type HeroPreviewModeId = "cafe" | "pharmacy" | "b2b";
type PricingCurrencyCode = "INR" | "USD" | "AED" | "GBP" | "EUR";

const ROTATING_PROBLEMS = [
  "handwritten paper bills?",
  "slow counter queues?",
  "rush-hour order chaos?",
  "WhatsApp order confusion?",
  "scattered Excel sheets?",
];

const HERO_PREVIEW_MODES: Record<
  HeroPreviewModeId,
  {
    id: HeroPreviewModeId;
    tabLabel: string;
    storeLabel: string;
    greetingTitle: string;
    greetingSub: string;
    metrics: { label: string; value: string; note: string; tone: "positive" | "warning" }[];
    chartTitle: string;
    chartTotal: string;
    bars: number[];
    activities: {
      title: string;
      subtitle: string;
      rightLabel?: string;
      tone: "blue" | "green" | "violet";
      icon: "receipt" | "package" | "users" | "truck";
    }[];
  }
> = {
  cafe: {
    id: "cafe",
    tabLabel: "Cafe & Restaurant POS",
    storeLabel: "Brew & Bean Cafe",
    greetingTitle: "Cafe counter live",
    greetingSub: "Fast billing, recipe stock & GPS staff check-ins.",
    metrics: [
      { label: "Today's sales", value: "₹18,450", note: "↗ 12.8% vs yesterday", tone: "positive" },
      { label: "Orders billed", value: "126", note: "↗ 8.4% peak rush", tone: "positive" },
      { label: "Recipe alerts", value: "03", note: "Milk & tea low", tone: "warning" },
    ],
    chartTitle: "Counter revenue",
    chartTotal: "₹82,640",
    bars: [38, 55, 43, 76, 60, 88, 69, 96, 72, 84, 63, 92],
    activities: [
      {
        title: "Order #1048 billed & sent",
        subtitle: "WhatsApp receipt · Just now",
        rightLabel: "₹840",
        tone: "blue",
        icon: "receipt",
      },
      {
        title: "Recipe stock auto-deducted",
        subtitle: "Milk powder · 8 min ago",
        tone: "green",
        icon: "package",
      },
      {
        title: "GPS geofenced check-in",
        subtitle: "Barista shift · 15 min ago",
        tone: "violet",
        icon: "users",
      },
    ],
  },
  pharmacy: {
    id: "pharmacy",
    tabLabel: "Pharmacy & Retail Billing",
    storeLabel: "CarePlus Pharmacy",
    greetingTitle: "Billing desk ready",
    greetingSub: "Rapid SKU search, GST invoices & supplier POs.",
    metrics: [
      { label: "Counter sales", value: "₹42,890", note: "↗ 16.2% UPI & cash", tone: "positive" },
      { label: "GST bills", value: "194", note: "100% synced", tone: "positive" },
      { label: "Low-stock SKUs", value: "04", note: "PO suggested", tone: "warning" },
    ],
    chartTitle: "Weekly retail sales",
    chartTotal: "₹2,48,120",
    bars: [52, 68, 61, 80, 74, 92, 85, 79, 94, 88, 76, 98],
    activities: [
      {
        title: "Tax Invoice #INV-2094",
        subtitle: "WhatsApp GST PDF · 2 min ago",
        rightLabel: "₹1,420",
        tone: "blue",
        icon: "receipt",
      },
      {
        title: "Supplier PO #PO-418 received",
        subtitle: "MedSupply Co · 18 min ago",
        tone: "green",
        icon: "package",
      },
      {
        title: "AI Smart Import synced",
        subtitle: "350 SKUs mapped · 1 hr ago",
        tone: "violet",
        icon: "users",
      },
    ],
  },
  b2b: {
    id: "b2b",
    tabLabel: "Bakery & B2B Wholesale",
    storeLabel: "Royal Wholesale Hub",
    greetingTitle: "Dispatch routes active",
    greetingSub: "Wholesale dispatches, ledgers & 3D City view.",
    metrics: [
      { label: "Route dispatch", value: "₹96,400", note: "↗ 14.5% today", tone: "positive" },
      { label: "Client stores", value: "38", note: "34 delivered", tone: "positive" },
      { label: "Collections due", value: "₹14,200", note: "Statements ready", tone: "warning" },
    ],
    chartTitle: "Wholesale volume",
    chartTotal: "₹5,94,800",
    bars: [48, 62, 70, 66, 82, 75, 91, 86, 95, 89, 84, 97],
    activities: [
      {
        title: "Morning dispatch slip sent",
        subtitle: "Green Mart · WhatsApp",
        rightLabel: "₹6,450",
        tone: "blue",
        icon: "truck",
      },
      {
        title: "Combined PDF ledger built",
        subtitle: "Monthly statement · 12 min",
        tone: "green",
        icon: "package",
      },
      {
        title: "3D City store status live",
        subtitle: "All 4 delivery vans active",
        tone: "violet",
        icon: "users",
      },
    ],
  },
};

const INDUSTRIES = [
  {
    id: "cafes",
    icon: Coffee,
    name: "Cafes, Tea Shops & QSR",
    badge: "F&B POS",
    summary: "3-tap rush-hour billing with automatic recipe stock deduction.",
    bullets: ["3-Tap POS", "Recipe Auto-Stock", "WhatsApp Bills"],
  },
  {
    id: "pharmacy",
    icon: Pill,
    name: "Pharmacies & Medical Stores",
    badge: "Healthcare",
    summary: "Instant medicine SKU search, GST bills, and supplier PO tracking.",
    bullets: ["Fast SKU Search", "GST Tax Bills", "Supplier POs"],
  },
  {
    id: "supermarket",
    icon: ShoppingCart,
    name: "Supermarkets & Kirana",
    badge: "Grocery POS",
    summary: "High-speed counter checkout, bulk Excel import, and offline sync.",
    bullets: ["AI Excel Import", "Price Spike Alerts", "Offline PWA"],
  },
  {
    id: "retail",
    icon: ShoppingBag,
    name: "Apparel, Electronics & Retail",
    badge: "Retail GST",
    summary: "Branded GSTIN invoices, category stock audits, and multi-currency.",
    bullets: ["GSTIN Invoices", "Stock Audits", "36+ Currencies"],
  },
  {
    id: "bakery",
    icon: Store,
    name: "Bakeries, Sweet Shops & Kitchens",
    badge: "Retail + B2B",
    summary: "Front-counter POS paired with kitchen production and route dispatch.",
    bullets: ["Cafe + Baker Mode", "Wastage Logs", "GPS Staff Shifts"],
  },
  {
    id: "b2b",
    icon: Truck,
    name: "B2B Wholesale & Distributors",
    badge: "Wholesale ERP",
    summary: "Daily client route dispatches, automated PDF ledgers, and 3D City.",
    bullets: ["Route Dispatch", "PDF Statements", "3D City Command"],
  },
];

const FEATURES = [
  {
    icon: Receipt,
    title: "All-in-One POS & GST Billing",
    description:
      "Fast counter checkout with official GST invoices, UPI QR, and WhatsApp bills.",
    tag: "Every billing workflow",
    chips: ["Counter POS", "GST Invoices", "WhatsApp Bills"],
  },
  {
    icon: Package,
    title: "Inventory, Recipes & Supplier POs",
    description:
      "Real-time stock ledger for SKUs, kitchen recipes, purchase orders, and wastage.",
    tag: "Zero stock guesswork",
    chips: ["Recipe Costing", "Supplier POs", "Wastage Logs"],
  },
  {
    icon: MapPin,
    title: "GPS Geofenced Staff & Payroll",
    description:
      "Verify store-radius check-ins, automate salary deductions, and send PDF payslips.",
    tag: "Accurate shift payroll",
    chips: ["GPS Check-In", "Auto Payroll", "PDF Payslips"],
  },
  {
    icon: BrainCircuit,
    title: "AI Expense Advisor & Smart Import",
    description:
      "Catch supplier price inflation early and import Excel catalogs with 1-click rollback.",
    tag: "Built-in AI intelligence",
    chips: ["Inflation Alerts", "Excel Import", "1-Click Rollback"],
  },
  {
    icon: CloudOff,
    title: "Offline-First PWA Billing",
    description:
      "Keep billing during internet drops with IndexedDB storage and automatic sync.",
    tag: "Never miss a sale",
    chips: ["Offline Checkout", "Local IndexedDB", "Auto Sync"],
  },
  {
    icon: Truck,
    title: "B2B Dispatch, Ledgers & 3D City",
    description:
      "Manage wholesale routes, client credit statements, broadcasts, and 3D City live view.",
    tag: "Built for scale",
    chips: ["Route Dispatch", "Client Ledgers", "3D City Live"],
  },
];

const PLANS = [
  {
    name: "Free",
    inrPrice: 0,
    description: "A simple place to test and start billing.",
    features: ["Up to 5 active products", "1 store admin account", "POS & PDF billing", "Standard support"],
    cta: "Start for free",
    featured: false,
  },
  {
    name: "Basic",
    inrPrice: 199,
    description: "For single-counter cafes, pharmacies & shops.",
    features: ["Up to 20 active products", "Up to 5 employee seats", "GPS attendance & payroll", "Standard support"],
    cta: "Choose Basic",
    featured: false,
  },
  {
    name: "Pro",
    inrPrice: 299,
    description: "Full power for busy retail, F&B & wholesale teams.",
    features: ["Up to 250 active products", "Up to 25 employee seats", "AI Advisor & Smart Import", "Standard support"],
    cta: "Choose Pro",
    featured: true,
  },
  {
    name: "Business",
    inrPrice: 499,
    description: "Unlimited catalog scale for multi-team operations.",
    features: ["Unlimited active products", "Up to 50 employee seats", "Cafe + B2B + 3D City", "Priority support"],
    cta: "Choose Business",
    featured: false,
  },
];

const PRICING_CURRENCIES: {
  code: PricingCurrencyCode;
  label: string;
  symbol: string;
  rateFromInr: number;
}[] = [
  { code: "INR", label: "India (INR ₹)", symbol: "₹", rateFromInr: 1 },
  { code: "USD", label: "Global (USD $)", symbol: "$", rateFromInr: 1 / 84 },
  { code: "AED", label: "UAE (AED د.إ)", symbol: "AED ", rateFromInr: 1 / 23 },
  { code: "GBP", label: "UK (GBP £)", symbol: "£", rateFromInr: 1 / 106 },
  { code: "EUR", label: "Europe (EUR €)", symbol: "€", rateFromInr: 1 / 91 },
];

const DEFAULT_FAQS: LandingFaqItem[] = [
  {
    question: "Which businesses can use CounterCub POS & billing software?",
    answer:
      "CounterCub works for cafes, tea shops, bakeries, pharmacies and medical stores, supermarkets and kirana grocery stores, apparel/electronics/hardware retail shops, and B2B wholesale distributors or manufacturers.",
  },
  {
    question: "Can I generate GST or tax invoices and send bills on WhatsApp?",
    answer:
      "Yes. You can create counter POS bills and official GST/tax invoices with your store GSTIN, UPI ID checkout, and digital signature, then share PDF receipts or bills directly to customers on WhatsApp.",
  },
  {
    question: "Does CounterCub work offline when the internet drops?",
    answer:
      "Yes. CounterCub is an offline-first Progressive Web App (PWA) with an IndexedDB local store and sync engine so supported counter billing workflows continue during internet outages and sync automatically once connectivity returns.",
  },
  {
    question: "How does GPS geofenced staff attendance and automated payroll work?",
    answer:
      "Store admins set the shop's GPS location and radius. Staff punch in only when inside the configured store geofence, and their attendance feeds directly into timesheets, deductions, salary settlements, and 1-click WhatsApp PDF payslips.",
  },
  {
    question: "Can I import my existing pharmacy, grocery, or cafe product list from Excel or CSV?",
    answer:
      "Yes. CounterCub includes AI Smart Import that analyzes Excel and CSV files, maps your product names, SKUs, prices, and categories automatically, validates rows before saving, and supports 1-click rollback.",
  },
  {
    question: "Does CounterCub support both Indian (₹ INR, UPI, GST) and international currencies?",
    answer:
      "Yes. CounterCub supports Indian GST invoices, UPI checkout, and INR by default, plus 36+ global currencies including USD, AED, GBP, EUR, SGD, MYR, SAR, QAR, AUD, and CAD with per-store timezone settings.",
  },
];

const FEATURED_GLOBAL_CURRENCIES = CURRENCY_OPTIONS.slice(0, 12);

const DEFAULT_CLIENTS: Partner[] = [
  {
    name: "Brown Fening Tea",
    category: "Cafe & Tea Lounge · Navalur, Chennai",
  },
  {
    name: "Royal Baker Wholesale",
    category: "Bakery & B2B Dispatch · Chennai",
  },
];

function formatPlanPrice(inrPrice: number, currencyCode: PricingCurrencyCode): string {
  const cfg = PRICING_CURRENCIES.find((c) => c.code === currencyCode) || PRICING_CURRENCIES[0];
  if (inrPrice === 0) return `${cfg.symbol}0`;
  if (cfg.code === "INR") return `₹${inrPrice}`;
  const converted = Math.max(1, Math.round(inrPrice * cfg.rateFromInr));
  return `~${cfg.symbol}${converted}`;
}

function CubPawIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="5.2" cy="8.8" rx="1.9" ry="2.55" transform="rotate(-18 5.2 8.8)" />
      <ellipse cx="9.6" cy="5.7" rx="2.0" ry="2.75" transform="rotate(-6 9.6 5.7)" />
      <ellipse cx="14.4" cy="5.7" rx="2.0" ry="2.75" transform="rotate(6 14.4 5.7)" />
      <ellipse cx="18.8" cy="8.8" rx="1.9" ry="2.55" transform="rotate(18 18.8 8.8)" />
      <path d="M12 10.6c-3.45 0-6.2 2.45-6.2 5.35 0 2.05 1.55 3.65 3.65 3.65 1.1 0 1.85-.48 2.55-.48s1.45.48 2.55.48c2.1 0 3.65-1.6 3.65-3.65 0-2.9-2.75-5.35-6.2-5.35z" />
    </svg>
  );
}

const PAW_STEPS = [
  { left: "4%", top: "68%", rot: "42deg", size: 22, delay: "0s" },
  { left: "23%", top: "40%", rot: "54deg", size: 23, delay: "0.25s" },
  { left: "44%", top: "52%", rot: "38deg", size: 24, delay: "0.5s" },
  { left: "64%", top: "22%", rot: "50deg", size: 25, delay: "0.75s" },
  { left: "83%", top: "8%", rot: "34deg", size: 26, delay: "1s" },
];

function CubPawTrail({
  className = "",
  variant = "blue",
}: {
  className?: string;
  variant?: "blue" | "light";
}) {
  return (
    <div
      className={`cc-paw-trail${variant === "light" ? " cc-paw-light" : ""} ${className}`}
      aria-hidden="true"
    >
      {PAW_STEPS.map((step, index) => (
        <span
          key={index}
          className="cc-paw-step"
          style={{
            left: step.left,
            top: step.top,
            transform: `rotate(${step.rot})`,
            animationDelay: step.delay,
          }}
        >
          <CubPawIcon size={step.size} />
        </span>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <a href="#top" className="cc-brand" aria-label="CounterCub home">
      <span className="cc-brand-mark"><CubPawIcon size={17} /></span>
      <span>Counter<span className="cc-brand-cub">Cub</span></span>
    </a>
  );
}

function ActivityIcon({ kind }: { kind: "receipt" | "package" | "users" | "truck" }) {
  if (kind === "receipt") return <Receipt size={13} />;
  if (kind === "package") return <Package size={13} />;
  if (kind === "truck") return <Truck size={13} />;
  return <Users size={13} />;
}

function DashboardPreview() {
  const [activeMode, setActiveMode] = useState<HeroPreviewModeId>("cafe");
  const mode = HERO_PREVIEW_MODES[activeMode];

  return (
    <div className="cc-dashboard-shell" aria-label="Interactive CounterCub dashboard preview">
      <div className="cc-preview-tabs" role="tablist" aria-label="Switch dashboard preview mode">
        {(Object.keys(HERO_PREVIEW_MODES) as HeroPreviewModeId[]).map((key) => {
          const item = HERO_PREVIEW_MODES[key];
          const isSelected = activeMode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveMode(key)}
              className={`cc-preview-tab${isSelected ? " cc-preview-tab-active" : ""}`}
            >
              {key === "cafe" && <Coffee size={12} />}
              {key === "pharmacy" && <Pill size={12} />}
              {key === "b2b" && <Truck size={12} />}
              <span>{item.tabLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="cc-window-bar">
        <div className="cc-window-dots"><i /><i /><i /></div>
        <div className="cc-window-address"><ShieldCheck size={12} /> yourstore.countercub.com</div>
        <div className="cc-window-avatar">CC</div>
      </div>

      <div className="cc-dashboard">
        <aside className="cc-dash-sidebar">
          <div className="cc-dash-brand"><span className="cc-mini-mark">C</span><span>CounterCub</span></div>
          <div className="cc-dash-store"><Store size={12} /> <span className="cc-truncate">{mode.storeLabel}</span> <ChevronDown size={11} /></div>
          <div className="cc-dash-nav-item cc-active"><Gauge size={13} /> Overview</div>
          <div className="cc-dash-nav-item"><Receipt size={13} /> {activeMode === "b2b" ? "Dispatch" : "POS Billing"}</div>
          <div className="cc-dash-nav-item"><Package size={13} /> Inventory</div>
          <div className="cc-dash-nav-item"><Users size={13} /> Staff &amp; GPS</div>
          <div className="cc-dash-nav-item"><BarChart3 size={13} /> Reports</div>
          <div className="cc-dash-sidebar-bottom"><span className="cc-status-dot" /> Offline PWA ready</div>
        </aside>
        <main className="cc-dash-main">
          <div className="cc-dash-heading">
            <div>
              <span className="cc-dash-eyebrow">LIVE STORE WORKSPACE</span>
              <h3>{mode.greetingTitle}</h3>
              <p>{mode.greetingSub}</p>
            </div>
            <span className="cc-period">This month <ChevronDown size={12} /></span>
          </div>
          <div className="cc-metric-grid">
            {mode.metrics.map((m) => (
              <div className="cc-metric" key={m.label}>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
                <small className={m.tone === "positive" ? "cc-positive" : "cc-warning"}>{m.note}</small>
              </div>
            ))}
          </div>
          <div className="cc-dash-lower">
            <div className="cc-chart-card">
              <div className="cc-card-heading"><div><b>{mode.chartTitle}</b><small>7-day trend</small></div><span>Weekly</span></div>
              <div className="cc-chart-total">{mode.chartTotal} <small>sample data</small></div>
              <div className="cc-chart-bars" aria-hidden="true">
                {mode.bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
              </div>
              <div className="cc-chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
            </div>
            <div className="cc-activity-card">
              <div className="cc-card-heading"><div><b>Recent activity</b><small>Real-time store feed</small></div><ArrowUpRight size={14} /></div>
              {mode.activities.map((act) => (
                <div className="cc-activity-row" key={act.title}>
                  <span className={`cc-activity-icon ${act.tone}`}><ActivityIcon kind={act.icon} /></span>
                  <div><b>{act.title}</b><small>{act.subtitle}</small></div>
                  {act.rightLabel ? <strong>{act.rightLabel}</strong> : <Check size={14} />}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
      <div className="cc-floating-note cc-floating-note-top"><span><CheckCircle2 size={15} /></span><div><b>POS + GST + WhatsApp</b><small>Bills &amp; payslips in 1 click</small></div></div>
      <div className="cc-floating-note cc-floating-note-bottom"><span><Zap size={15} /></span><div><b>36+ Global Currencies</b><small>India ₹ · USD $ · AED · GBP · EUR</small></div></div>
    </div>
  );
}

function PartnerSection({ partners }: { partners: Partner[] }) {
  const displayPartners = partners.length > 0 ? partners : DEFAULT_CLIENTS;
  const baseSet =
    displayPartners.length >= 4
      ? displayPartners
      : [...displayPartners, ...displayPartners, ...displayPartners];
  const trackItems = [...baseSet, ...baseSet];

  return (
    <section className="cc-partner-section" aria-labelledby="partners-title">
      <div className="cc-section-label">TRUSTED BY REAL COUNTERS &amp; SUPPLIERS</div>
      <h2 id="partners-title">From local counters to <span>global commerce.</span></h2>
      <p className="cc-section-copy">Powering daily POS billing, recipe stock, staff payroll, and wholesale dispatch across growing stores.</p>
      <div className="cc-partner-track-wrap">
        <div className="cc-partner-track">
          {trackItems.map((partner, index) => {
            const initials = partner.name
              .split(" ")
              .filter(Boolean)
              .map((word) => word[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const content = (
              <div className="cc-client-inner">
                {partner.logoUrl ? (
                  <img src={partner.logoUrl} alt={`${partner.name} logo`} />
                ) : (
                  <span className="cc-client-badge" aria-hidden="true">{initials}</span>
                )}
                <div className="cc-client-meta">
                  <strong>{partner.name}</strong>
                  {partner.category && <small>{partner.category}</small>}
                </div>
              </div>
            );
            return partner.websiteUrl ? (
              <a className="cc-partner-logo" href={partner.websiteUrl} target="_blank" rel="noreferrer" key={`${partner.name}-${index}`}>
                {content}
              </a>
            ) : (
              <div className="cc-partner-logo" key={`${partner.name}-${index}`}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cc-trust-strip" style={{ marginTop: 20 }}>
        <span><Receipt size={14} /> GST &amp; Tax Invoices</span>
        <span><MessageCircle size={14} /> WhatsApp Receipts &amp; Payslips</span>
        <span><MapPin size={14} /> GPS Geofenced Attendance</span>
        <span><CloudOff size={14} /> Offline-First PWA</span>
        <span><Globe size={14} /> 36+ Currencies</span>
      </div>
    </section>
  );
}

export function CounterCubLandingPage({
  platformUrl,
  signupUrl,
  partners = [],
  faqs,
}: CounterCubLandingPageProps) {
  const [problemIndex, setProblemIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeSlug, setStoreSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState(INDUSTRIES[0].id);
  const [pricingCurrency, setPricingCurrency] = useState<PricingCurrencyCode>("INR");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [demoName, setDemoName] = useState("");
  const [demoPhone, setDemoPhone] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoStoreName, setDemoStoreName] = useState("");
  const [demoCity, setDemoCity] = useState("");
  const [demoIndustry, setDemoIndustry] = useState(INDUSTRIES[0].id);
  const [demoPlan, setDemoPlan] = useState("Free");
  const [demoHoneypot, setDemoHoneypot] = useState("");
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  const resolvedPlatformUrl = platformUrl || getPlatformAdminUrl("/super-admin");
  const resolvedSignupUrl = signupUrl || "#book-demo";
  const faqItems = faqs && faqs.length > 0 ? faqs : DEFAULT_FAQS;
  const activeIndustry = INDUSTRIES.find((i) => i.id === selectedIndustry) || INDUSTRIES[0];
  const selectedDemoIndustryName =
    INDUSTRIES.find((i) => i.id === demoIndustry)?.name || INDUSTRIES[0].name;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;
    const interval = window.setInterval(() => {
      setProblemIndex((current) => (current + 1) % ROTATING_PROBLEMS.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, []);

  const openStoreWorkspace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const check = validateTenantSlug(storeSlug);
    if (!check.valid || !check.normalizedSlug) {
      setSlugError(check.error || "Enter a valid store URL using letters, numbers or hyphens.");
      return;
    }
    setSlugError("");
    // Navigates to the validated shop workspace login (<slug>.countercub.com/login in prod, <slug>.localhost:PORT/login in dev)
    window.location.assign(getTenantUrl(check.normalizedSlug, "/login"));
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const scrollToWorkspaceLogin = () => {
    closeMobileMenu();
    const el = document.getElementById("workspace");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document.getElementById("cc-store-slug")?.focus({ preventScroll: true });
    }, 280);
  };

  const scrollToDemoForm = (opts?: { industryId?: string; planName?: string }) => {
    closeMobileMenu();
    if (opts?.industryId) setDemoIndustry(opts.industryId);
    if (opts?.planName) setDemoPlan(opts.planName);
    setDemoSubmitted(false);
    setDemoError("");
    const el = document.getElementById("book-demo");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document.getElementById("cc-demo-name")?.focus({ preventScroll: true });
    }, 280);
  };

  const handleDemoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (demoSubmitting) return;
    if (
      !demoName.trim() ||
      !demoPhone.trim() ||
      !demoStoreName.trim() ||
      !demoCity.trim() ||
      !demoEmail.trim()
    ) {
      setDemoError(
        "Please fill in your name, phone/WhatsApp, store name, city/country, and email."
      );
      return;
    }

    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,20}$/.test(demoEmail.trim())) {
      setDemoError("Please enter a valid contact email address.");
      return;
    }

    setDemoError("");
    setDemoSubmitting(true);

    try {
      const response = await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: demoName.trim(),
          phone: demoPhone.trim(),
          email: demoEmail.trim(),
          storeName: demoStoreName.trim(),
          city: demoCity.trim(),
          industryId: demoIndustry,
          plan: demoPlan,
          currency: pricingCurrency,
          website: demoHoneypot,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        delivered?: boolean;
        error?: string;
      } | null;

      if (response.ok && data?.ok) {
        setDemoSubmitted(true);
        return;
      }

      setDemoError(
        data?.error || "Unable to send demo request right now. Please try again in a moment."
      );
    } catch {
      setDemoError("Network error while sending your request. Please try again.");
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className={`cc-site ${dmSans.variable} ${manrope.variable}`} id="top">
      <style jsx global>{`
        :root { --cc-blue:#2563eb; --cc-blue-dark:#1747bb; --cc-ink:#101828; --cc-muted:#667085; --cc-line:#e7ebf2; --cc-soft:#f5f8ff; }
        * { box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { margin:0; }
        .cc-site { color:var(--cc-ink); background:#fff; font-family:var(--font-cc-dm-sans),'DM Sans',Arial,sans-serif; overflow-x:clip; }
        .cc-site a { color:inherit; text-decoration:none; }
        .cc-container { width:min(1160px, calc(100% - 48px)); margin:0 auto; position:relative; z-index:1; }
        .cc-nav { height:64px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(231,235,242,.85); position:relative; z-index:20; background:rgba(255,255,255,.94); }
        .cc-brand { display:inline-flex; align-items:center; gap:10px; font:800 21px var(--font-cc-manrope),'Manrope',sans-serif; letter-spacing:-.9px; }
        .cc-brand-cub { color:var(--cc-blue); }
        .cc-brand-mark { width:32px; height:32px; border-radius:11px; background:var(--cc-blue); color:#fff; display:grid; place-items:center; box-shadow:0 5px 14px rgba(37,99,235,.25); transform:rotate(-5deg); }
        .cc-paw-trail { position:absolute; pointer-events:none; color:rgba(37,99,235,.09); z-index:0; }
        .cc-paw-trail.cc-paw-light { color:rgba(255,255,255,.13); }
        .cc-paw-step { position:absolute; display:grid; place-items:center; animation:cc-paw-fade 4.5s ease-in-out infinite; }
        @keyframes cc-paw-fade { 0%,100% { opacity:.55; } 50% { opacity:1; } }
        .cc-paw-trail-hero { left:34%; bottom:12px; width:240px; height:112px; }
        .cc-paw-trail-hero-top { left:28%; top:14px; width:195px; height:88px; opacity:.72; transform:scaleX(-1); }
        .cc-paw-trail-way { right:14px; bottom:10px; width:175px; height:84px; color:rgba(37,99,235,.075); }
        .cc-paw-trail-section-tr { right:26px; top:16px; width:215px; height:94px; color:rgba(37,99,235,.065); }
        .cc-paw-trail-section-tl { left:26px; top:16px; width:215px; height:94px; color:rgba(37,99,235,.065); transform:scaleX(-1); }
        .cc-paw-trail-section-bl { left:24px; bottom:12px; width:215px; height:94px; color:rgba(37,99,235,.065); }
        .cc-paw-trail-offline { right:120px; bottom:10px; width:220px; height:96px; }
        .cc-paw-trail-demo { left:26px; bottom:14px; width:210px; height:92px; color:rgba(37,99,235,.07); }
        .cc-paw-trail-cta { left:24px; bottom:16px; width:210px; height:96px; }
        .cc-paw-trail-cta-right { right:24px; top:14px; width:210px; height:96px; transform:scaleX(-1); }
        .cc-nav-links { display:flex; align-items:center; gap:26px; color:#475467; font-size:13px; font-weight:600; }
        .cc-nav-links a:hover { color:var(--cc-blue); }
        .cc-nav-actions { display:flex; align-items:center; gap:16px; font-size:13px; font-weight:700; }
        .cc-login { color:#344054; background:transparent; border:0; padding:0; font:inherit; cursor:pointer; }
        .cc-login:hover { color:var(--cc-blue); }
        .cc-primary-btn,.cc-secondary-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; border-radius:10px; padding:12px 18px; font-size:13px; font-weight:700; transition:transform .2s, box-shadow .2s, background .2s; cursor:pointer; border:1px solid transparent; }
        .cc-primary-btn { background:var(--cc-blue); color:#fff !important; box-shadow:0 7px 16px rgba(37,99,235,.18); }
        .cc-primary-btn:hover { background:var(--cc-blue-dark); transform:translateY(-2px); box-shadow:0 10px 22px rgba(37,99,235,.24); }
        .cc-secondary-btn { background:#fff; border-color:#d9e0eb; color:#344054 !important; }
        .cc-secondary-btn:hover { border-color:#a9bce3; background:#f8faff; transform:translateY(-2px); }
        .cc-menu-btn { display:none; background:#fff; border:1px solid var(--cc-line); border-radius:9px; padding:9px; color:#344054; cursor:pointer; }
        .cc-mobile-menu { display:none; }
        .cc-hero { position:relative; min-height:calc(100vh - 64px); display:flex; align-items:center; padding:52px 0 48px; background:radial-gradient(ellipse at 78% 34%, rgba(219,232,255,.78), transparent 37%), linear-gradient(180deg,#fbfdff 0%,#fff 100%); }
        .cc-hero:before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.32; background-image:linear-gradient(rgba(37,99,235,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.055) 1px,transparent 1px); background-size:48px 48px; mask-image:linear-gradient(90deg,transparent,black 70%,transparent); }
        .cc-hero-grid { position:relative; display:grid; grid-template-columns:.92fr 1.08fr; align-items:center; gap:42px; }
        .cc-eyebrow { display:inline-flex; align-items:center; gap:8px; color:#2457c5; font-size:10px; font-weight:800; letter-spacing:1.1px; text-transform:uppercase; padding:6px 11px; border:1px solid #dbe7ff; background:#f4f8ff; border-radius:99px; }
        .cc-eyebrow-dot { width:7px; height:7px; border-radius:50%; background:#3478f6; box-shadow:0 0 0 4px rgba(52,120,246,.12); flex:none; }
        .cc-hero h1 { font:800 clamp(26px,2.65vw,35px)/1.18 var(--font-cc-manrope),'Manrope',sans-serif; letter-spacing:-1.2px; margin:12px 0 11px; max-width:600px; }
        .cc-hero h1 .cc-blue-line { color:var(--cc-blue); display:block; }
        .cc-rotating-problem { color:var(--cc-blue); display:block; animation:cc-fade-up .42s ease both; }
        @keyframes cc-fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .cc-hero-copy { max-width:520px; color:#667085; font-size:14px; line-height:1.65; margin:0 0 16px; }
        .cc-hero-actions { display:flex; flex-wrap:wrap; gap:11px; }
        .cc-trust-note { display:flex; align-items:center; gap:8px; color:#667085; font-size:11px; margin-top:12px; flex-wrap:wrap; }
        .cc-trust-note svg { color:#16a36a; flex:none; }
        .cc-hero-visual { position:relative; min-width:0; padding:36px 5px 18px 0; }
        .cc-dashboard-shell { position:relative; background:#fff; border:1px solid #e1e8f4; border-radius:17px; box-shadow:0 28px 70px rgba(31,62,116,.16),0 3px 10px rgba(16,24,40,.04); overflow:visible; transform:perspective(1200px) rotateY(-3deg) rotateX(1.5deg); }
        .cc-preview-tabs { display:flex; gap:6px; padding:9px 11px; background:#f5f8ff; border-bottom:1px solid #e6edf9; border-radius:17px 17px 0 0; overflow-x:auto; }
        .cc-preview-tab { display:inline-flex; align-items:center; gap:5px; padding:6px 10px; border-radius:8px; border:1px solid transparent; background:transparent; color:#526071; font:700 10px 'DM Sans',sans-serif; cursor:pointer; white-space:nowrap; transition:all .18s; }
        .cc-preview-tab:hover { background:#fff; color:#1d4ed8; }
        .cc-preview-tab-active { background:#fff; border-color:#cbdcff; color:#1d4ed8; box-shadow:0 2px 6px rgba(37,99,235,.08); }
        .cc-window-bar { height:35px; border-bottom:1px solid #edf0f5; display:flex; align-items:center; justify-content:space-between; padding:0 13px; background:#fcfdff; }
        .cc-window-dots { display:flex; gap:5px; }.cc-window-dots i { width:7px;height:7px;border-radius:50%;background:#d6dce7; }
        .cc-window-address { display:flex; align-items:center; gap:5px; color:#98a2b3; background:#f3f5f9; border-radius:5px; padding:3px 26px; font-size:8px; }
        .cc-window-address svg { color:#16a36a; }
        .cc-window-avatar { display:grid;place-items:center;width:21px;height:21px;border-radius:7px;background:#eaf1ff;color:#245bd4;font-size:8px;font-weight:800; }
        .cc-dashboard { display:grid; grid-template-columns:138px 1fr; min-height:285px; }
        .cc-dash-sidebar { background:#fbfcfe; border-right:1px solid #edf0f5; padding:14px 10px 12px; border-radius:0 0 0 17px; position:relative; }
        .cc-dash-brand { display:flex; align-items:center; gap:7px; font:800 10px var(--font-cc-manrope),'Manrope',sans-serif; margin:1px 3px 14px; }
        .cc-mini-mark { background:var(--cc-blue);color:#fff;border-radius:5px;width:18px;height:18px;display:grid;place-items:center;font-size:10px; }
        .cc-dash-store { border:1px solid #e9edf4; border-radius:6px; padding:6px; display:flex; align-items:center; gap:5px; font-size:8px; color:#475467; margin-bottom:12px; }
        .cc-truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
        .cc-dash-nav-item { display:flex; align-items:center; gap:7px; padding:7px 7px; color:#7b8494; font-size:8px; border-radius:6px; margin:2px 0; }
        .cc-dash-nav-item.cc-active { background:#edf3ff;color:#245bd4;font-weight:700; }
        .cc-dash-sidebar-bottom { position:absolute;bottom:11px;left:12px;display:flex;align-items:center;gap:5px;color:#8993a3;font-size:7px; }
        .cc-status-dot { width:6px;height:6px;border-radius:50%;background:#22b573; }
        .cc-dash-main { padding:16px 16px 14px; min-width:0; }
        .cc-dash-heading { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:13px; }
        .cc-dash-eyebrow { color:#98a2b3;letter-spacing:.7px;font-size:6px;font-weight:800; }
        .cc-dash-heading h3 { font:800 16px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-.5px;margin:3px 0 2px; }
        .cc-dash-heading p { margin:0;color:#98a2b3;font-size:8px; }
        .cc-period { display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #e8edf5;border-radius:6px;color:#667085;font-size:7px; white-space:nowrap; }
        .cc-metric-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px; }
        .cc-metric { border:1px solid #edf0f5;border-radius:8px;padding:9px 9px 8px;min-width:0; }
        .cc-metric>span { display:block;color:#8993a3;font-size:7px;margin-bottom:5px; }
        .cc-metric strong { display:block;font:800 16px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-.7px; }
        .cc-metric small { display:block;font-size:7px;margin-top:5px; }
        .cc-positive { color:#16a36a; }.cc-warning { color:#d58a19; }
        .cc-dash-lower { display:grid;grid-template-columns:1.08fr .92fr;gap:9px;margin-top:9px; }
        .cc-chart-card,.cc-activity-card { border:1px solid #edf0f5;border-radius:8px;padding:10px;min-width:0; }
        .cc-card-heading { display:flex;justify-content:space-between;align-items:flex-start; }
        .cc-card-heading b { display:block;font-size:8px; }.cc-card-heading small { display:block;font-size:6px;color:#a0a8b5;margin-top:2px; }.cc-card-heading>span { color:#7f8a9b;font-size:7px; }
        .cc-chart-total { font:800 14px var(--font-cc-manrope),'Manrope',sans-serif;margin-top:8px; }.cc-chart-total small { color:#a0a8b5;font:500 6px var(--font-cc-dm-sans),'DM Sans',sans-serif;margin-left:4px; }
        .cc-chart-bars { height:76px;display:flex;align-items:flex-end;gap:5px;padding:8px 2px 0;border-bottom:1px solid #edf0f5;background:repeating-linear-gradient(to bottom,transparent 0,transparent 24px,#f2f4f8 25px); }
        .cc-chart-bars i { flex:1;max-width:17px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#6d9cff,#2d68e8);opacity:.88;transition:height .25s ease; }
        .cc-chart-bars i:nth-child(3n) { background:linear-gradient(180deg,#b9d0ff,#78a2f6); }
        .cc-chart-days { display:flex;justify-content:space-between;color:#a0a8b5;font-size:6px;padding-top:5px; }
        .cc-activity-row { display:flex;align-items:center;gap:6px;margin-top:11px;min-width:0; }
        .cc-activity-icon { width:21px;height:21px;border-radius:6px;display:grid;place-items:center;flex:none; }.cc-activity-icon.blue { background:#eef4ff;color:#326be2; }.cc-activity-icon.green { background:#eaf8f1;color:#16a36a; }.cc-activity-icon.violet { background:#f2efff;color:#7856cf; }
        .cc-activity-row div { min-width:0;flex:1; }.cc-activity-row b { display:block;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }.cc-activity-row small { display:block;font-size:6px;color:#a0a8b5;margin-top:2px;white-space:nowrap; }.cc-activity-row strong {font-size:7px;white-space:nowrap;}.cc-activity-row>svg {color:#16a36a;flex:none;}
        .cc-floating-note { position:absolute;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e8edf5;border-radius:11px;padding:9px 12px;box-shadow:0 12px 28px rgba(31,62,116,.13);z-index:2;animation:cc-float 4s ease-in-out infinite; }
        .cc-floating-note>span { width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#edf4ff;color:var(--cc-blue); }.cc-floating-note b {display:block;font-size:10px;}.cc-floating-note small {display:block;color:#98a2b3;font-size:8px;margin-top:2px;}.cc-floating-note-top {right:-10px;top:-36px;}.cc-floating-note-bottom {left:-18px;bottom:0;animation-delay:-1.7s;}
        @keyframes cc-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-7px); } }
        .cc-partner-section { padding:38px 24px 44px;text-align:center;border-bottom:1px solid #f0f2f6;background:#fff; }
        .cc-section-label { color:#2563eb;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase; }
        .cc-partner-section h2 { font:800 25px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1px;margin:9px 0 8px; }.cc-partner-section h2 span {color:var(--cc-blue);}.cc-section-copy {color:#7b8494;font-size:13px;line-height:1.7;max-width:640px;margin:0 auto 20px;}
        .cc-trust-strip { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; max-width:920px; margin:0 auto; }
        .cc-trust-strip span { display:inline-flex; align-items:center; gap:7px; padding:8px 13px; border-radius:99px; border:1px solid #e4ebf7; background:#f8faff; color:#344054; font-size:11px; font-weight:700; }
        .cc-trust-strip svg { color:var(--cc-blue); }
        .cc-partner-track-wrap {overflow:hidden;max-width:1040px;margin:0 auto;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent); }.cc-partner-track {display:flex;align-items:center;gap:14px;width:max-content;animation:cc-marquee 26s linear infinite;}.cc-partner-track:hover {animation-play-state:paused;}.cc-partner-logo {min-width:235px;height:66px;display:flex;align-items:center;justify-content:center;border:1px solid #e6ecf6;border-radius:12px;background:#fff;padding:10px 16px;box-shadow:0 4px 14px rgba(31,62,116,.04);}.cc-client-inner {display:flex;align-items:center;gap:11px;text-align:left;}.cc-client-badge {width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#eff4ff,#dbe7ff);color:var(--cc-blue);font:800 12px var(--font-cc-manrope),'Manrope',sans-serif;display:grid;place-items:center;flex:none;}.cc-client-meta strong {display:block;color:#1e293b;font:800 13px var(--font-cc-manrope),'Manrope',sans-serif;line-height:1.2;}.cc-client-meta small {display:block;font-size:10px;color:#667085;margin-top:2px;white-space:nowrap;}.cc-partner-logo img {max-width:125px;max-height:31px;object-fit:contain;}
        @keyframes cc-marquee { to { transform:translateX(-50%); } }
        .cc-section { padding:28px 0 44px; position:relative; overflow:hidden; }.cc-section[id] { scroll-margin-top:0px; }.cc-section-soft {background:#f7f9fd;}.cc-section-heading {max-width:700px;margin:0 auto 22px;text-align:center;}.cc-section-heading h2 {font:800 clamp(26px,3.4vw,36px)/1.17 var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1.4px;margin:8px 0 8px;}.cc-section-heading h2 span {color:var(--cc-blue);}.cc-section-heading p {color:#667085;font-size:14px;line-height:1.65;margin:0;}
        #industries.cc-section { padding:24px 0 32px; }
        #industries .cc-section-heading { margin-bottom:18px; max-width:760px; }
        .cc-industry-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .cc-industry-card { text-align:left; border:1px solid #e6ebf4; background:#fff; border-radius:15px; padding:16px 18px; display:flex; flex-direction:column; transition:transform .2s, border-color .2s, box-shadow .2s; cursor:pointer; }
        .cc-industry-card:hover { transform:translateY(-3px); border-color:#b8cdfa; box-shadow:0 12px 26px rgba(31,62,116,.07); }
        .cc-industry-card.cc-industry-active { border-color:var(--cc-blue); background:linear-gradient(155deg,#f6f9ff,#fff); box-shadow:0 14px 30px rgba(37,99,235,.1); }
        .cc-industry-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .cc-industry-icon { width:34px; height:34px; border-radius:10px; background:#edf4ff; color:var(--cc-blue); display:grid; place-items:center; }
        .cc-industry-badge { font-size:9px; font-weight:800; color:#2563eb; background:#eff5ff; border:1px solid #dbe7ff; padding:4px 9px; border-radius:99px; }
        .cc-industry-card h3 { font:800 15px var(--font-cc-manrope),'Manrope',sans-serif; margin:0 0 5px; letter-spacing:-.3px; }
        .cc-industry-card p { font-size:12px; color:#667085; line-height:1.5; margin:0 0 12px; flex:1; }
        .cc-industry-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .cc-industry-chips span { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:99px; background:#f8faff; border:1px solid #e3ebf7; font-size:10px; color:#344054; font-weight:700; }
        .cc-industry-chips svg { color:#16a36a; flex:none; }
        .cc-industry-spotlight { margin-top:14px; border:1px solid #d7e4ff; background:#fff; border-radius:14px; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; }
        .cc-industry-spotlight b { font:800 14px var(--font-cc-manrope),'Manrope',sans-serif; display:block; }
        .cc-industry-spotlight span { font-size:12px; color:#667085; }
        .cc-transformation {display:grid;grid-template-columns:1fr 70px 1fr;gap:16px;align-items:center;max-width:960px;margin:0 auto;}.cc-way-card {height:100%;border:1px solid #e7ebf2;background:#fff;border-radius:17px;padding:25px;}.cc-way-kicker {font-size:10px;font-weight:800;letter-spacing:1.1px;color:#8993a3;}.cc-way-card h3 {font:800 22px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-.7px;margin:9px 0 17px;}.cc-way-list {display:grid;gap:12px;}.cc-way-item {display:flex;align-items:center;gap:10px;color:#475467;font-size:12px;}.cc-way-icon {width:30px;height:30px;border-radius:8px;background:#f3f5f8;color:#7c8798;display:grid;place-items:center;flex:none;}.cc-way-card.cc-way-new {background:linear-gradient(145deg,#f8fbff,#eef4ff);border-color:#cbdcff;box-shadow:0 12px 32px rgba(37,99,235,.07);position:relative;overflow:hidden;}.cc-way-new .cc-way-kicker {color:#2563eb;display:inline-flex;align-items:center;gap:6px;}.cc-way-new .cc-way-icon {background:#fff;color:#2563eb;}.cc-way-new .cc-way-item {color:#344054;position:relative;z-index:1;}.cc-way-new h3 {position:relative;z-index:1;}.cc-way-arrow {width:48px;height:48px;border-radius:50%;background:#2563eb;color:#fff;display:grid;place-items:center;margin:auto;box-shadow:0 8px 18px rgba(37,99,235,.22);}
        #features .cc-section-heading { margin-bottom:18px; max-width:760px; }
        .cc-feature-grid {display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}.cc-feature-card {border:1px solid #e9edf4;border-radius:15px;padding:16px 18px;background:#fff;display:flex;flex-direction:column;transition:transform .22s,border-color .22s,box-shadow .22s;}.cc-feature-card:hover {transform:translateY(-4px);border-color:#bfd2fb;box-shadow:0 14px 30px rgba(31,62,116,.08);}.cc-feature-card h3 {font:800 15px var(--font-cc-manrope),'Manrope',sans-serif;margin:0 0 5px;letter-spacing:-.35px;}.cc-feature-card p {color:#667085;font-size:12px;line-height:1.5;margin:0 0 12px;flex:1;}
        .cc-product-showcase {display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:center;margin:24px 0 64px;}.cc-product-showcase:last-child {margin-bottom:0;}.cc-product-showcase.cc-reverse .cc-showcase-visual {order:2;}.cc-showcase-visual {position:relative;min-width:0;background:linear-gradient(145deg,#edf4ff,#f9fbff);border:1px solid #e0eaff;border-radius:19px;padding:24px;min-height:265px;display:grid;place-items:center;overflow:hidden;}.cc-showcase-window {width:100%;max-width:450px;background:#fff;border:1px solid #e2e8f2;border-radius:10px;padding:14px;box-shadow:0 15px 35px rgba(34,69,129,.12);}.cc-showcase-top {display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf0f5;padding-bottom:10px;font-size:9px;font-weight:700;}.cc-showcase-top span:last-child {color:#2563eb;background:#edf4ff;padding:5px 7px;border-radius:5px;font-size:8px;}.cc-showcase-table {width:100%;border-collapse:collapse;margin-top:9px;font-size:8px;color:#667085;}.cc-showcase-table th {text-align:left;color:#98a2b3;font-size:7px;font-weight:600;padding:8px 4px;border-bottom:1px solid #edf0f5;}.cc-showcase-table td {padding:10px 4px;border-bottom:1px solid #f1f3f7;}.cc-showcase-table td:last-child {text-align:right;color:#344054;font-weight:700;}.cc-showcase-pill {background:#eaf8f1;color:#15945f;border-radius:99px;padding:3px 6px;font-size:7px;}.cc-showcase-copy .cc-section-label {display:block;margin-bottom:12px;}.cc-showcase-copy h3 {font:800 28px/1.18 var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1px;margin:0 0 13px;}.cc-showcase-copy p {font-size:13px;color:#667085;line-height:1.8;margin:0 0 18px;}.cc-check-list {display:grid;gap:10px;}.cc-check-list span {display:flex;align-items:center;gap:9px;color:#475467;font-size:12px;}.cc-check-list svg {color:#16a36a;flex:none;}
        .cc-mode-grid {display:grid;grid-template-columns:1fr 1fr;gap:18px;}.cc-mode-card {border-radius:17px;padding:26px;border:1px solid #e3eaf5;background:#fff;overflow:hidden;position:relative;}.cc-mode-card.cc-mode-blue {background:linear-gradient(145deg,#f2f7ff,#fff);}.cc-mode-top {display:flex;justify-content:space-between;align-items:center;margin-bottom:17px;}.cc-mode-number {font:800 11px var(--font-cc-manrope),'Manrope',sans-serif;color:#2563eb;letter-spacing:1px;}.cc-mode-icon {width:39px;height:39px;border-radius:11px;background:#eaf1ff;color:#2563eb;display:grid;place-items:center;}.cc-mode-card h3 {font:800 21px var(--font-cc-manrope),'Manrope',sans-serif;margin:0 0 9px;letter-spacing:-.6px;}.cc-mode-card p {font-size:12px;color:#758093;line-height:1.75;margin:0 0 17px;}.cc-mode-tags {display:flex;flex-wrap:wrap;gap:7px;}.cc-mode-tags span {background:#fff;border:1px solid #e6ebf3;border-radius:99px;padding:6px 9px;color:#526071;font-size:9px;font-weight:600;}.cc-city-preview {height:133px;margin-top:18px;border-radius:11px;background:radial-gradient(circle at 50% 15%,#d8e7ff,#eaf2ff 58%,#f7faff);position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;gap:8px;padding-bottom:0;}.cc-city-building {width:38px;background:linear-gradient(180deg,#8eb2f7,#4c80e7);border:1px solid rgba(255,255,255,.8);border-radius:4px 4px 0 0;position:relative;box-shadow:0 7px 13px rgba(37,99,235,.12);}.cc-city-building:after {content:'';position:absolute;inset:8px 7px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.8) 0 4px,transparent 4px 10px),repeating-linear-gradient(0deg,transparent 0 12px,rgba(255,255,255,.4) 12px 14px);}.cc-city-building:nth-child(1){height:53px}.cc-city-building:nth-child(2){height:85px;width:48px}.cc-city-building:nth-child(3){height:66px}.cc-city-building:nth-child(4){height:105px;width:44px}.cc-city-building:nth-child(5){height:58px}.cc-city-glow {position:absolute;width:210px;height:36px;bottom:0;background:rgba(57,111,220,.13);filter:blur(15px);}
        .cc-global-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .cc-global-card { border:1px solid #e3eaf5; background:#fff; border-radius:17px; padding:26px; }
        .cc-global-card h3 { font:800 20px var(--font-cc-manrope),'Manrope',sans-serif; margin:10px 0 8px; letter-spacing:-.5px; }
        .cc-global-card p { font-size:12px; color:#667085; line-height:1.75; margin:0 0 16px; }
        .cc-currency-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }
        .cc-currency-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:99px; background:#f8faff; border:1px solid #e2eaf8; font-size:10px; font-weight:700; color:#344054; }
        .cc-currency-chip b { color:var(--cc-blue); }
        .cc-offline-band {background:#101e3a;color:#fff;border-radius:20px;padding:36px 39px;display:grid;grid-template-columns:1fr auto;gap:25px;align-items:center;position:relative;overflow:hidden;}.cc-offline-band:after {content:'';position:absolute;width:300px;height:300px;border-radius:50%;background:rgba(37,99,235,.2);filter:blur(40px);right:9%;top:-190px;}.cc-offline-band h2 {font:800 25px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-.8px;margin:0 0 9px;position:relative;z-index:1;}.cc-offline-band p {color:#bdc9dd;font-size:12px;line-height:1.7;margin:0;max-width:650px;position:relative;z-index:1;}.cc-offline-icon {width:64px;height:64px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:17px;display:grid;place-items:center;color:#9fc0ff;position:relative;z-index:1;}
        .cc-workspace {display:grid;grid-template-columns:.9fr 1.1fr;gap:45px;align-items:center;}.cc-workspace h2 {font:800 34px/1.17 var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1.4px;margin:11px 0 14px;}.cc-workspace p {font-size:13px;color:#667085;line-height:1.8;margin:0 0 19px;}.cc-url-demo {border:1px solid #e0e8f5;background:#fff;border-radius:15px;padding:20px;box-shadow:0 14px 35px rgba(31,62,116,.07);}.cc-url-label {font-size:10px;color:#667085;font-weight:700;margin-bottom:9px;display:block;}.cc-url-field {display:flex;align-items:center;border:1px solid #dce3ee;border-radius:9px;overflow:hidden;}.cc-url-field input {width:100%;min-width:0;border:0;outline:0;padding:13px 12px;font:600 12px var(--font-cc-dm-sans),'DM Sans',sans-serif;color:#344054;}.cc-url-suffix {padding:0 11px;color:#667085;background:#f8faff;font-size:11px;white-space:nowrap;border-left:1px solid #e5eaf2;}.cc-url-submit {width:100%;margin-top:10px;border:0;}.cc-url-hint {font-size:10px;color:#98a2b3;margin-top:9px;}.cc-url-error {color:#d92d20;font-size:10px;margin-top:8px;}
        .cc-currency-switcher { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin:0 auto 18px; }
        .cc-currency-btn { border:1px solid #dce4f2; background:#fff; color:#475467; border-radius:99px; padding:7px 13px; font:700 11px 'DM Sans',sans-serif; cursor:pointer; transition:all .15s; }
        .cc-currency-btn:hover { border-color:#9bb8f7; color:#1d4ed8; }
        .cc-currency-btn-active { background:var(--cc-blue); color:#fff; border-color:var(--cc-blue); box-shadow:0 4px 12px rgba(37,99,235,.22); }
        .cc-pricing-grid {display:grid;grid-template-columns:repeat(4,1fr);gap:13px;align-items:stretch;}.cc-price-card {border:1px solid #e5eaf2;border-radius:15px;padding:17px 16px;background:#fff;display:flex;flex-direction:column;position:relative;}.cc-price-card.cc-price-featured {border:1.5px solid #6b97f5;box-shadow:0 12px 30px rgba(37,99,235,.1);}.cc-price-popular {position:absolute;top:-11px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#2563eb;color:#fff;border-radius:99px;padding:5px 10px;font-size:8px;font-weight:800;letter-spacing:.4px;}.cc-price-card h3 {font:800 16px var(--font-cc-manrope),'Manrope',sans-serif;margin:0 0 5px;}.cc-price-description {font-size:10px;color:#8993a3;min-height:28px;}.cc-price-amount {font:800 28px var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1px;margin:12px 0 2px;}.cc-price-amount small {font:500 10px var(--font-cc-dm-sans),'DM Sans',sans-serif;color:#8993a3;letter-spacing:0;}.cc-price-period {color:#98a2b3;font-size:9px;padding-bottom:12px;border-bottom:1px solid #edf0f5;}.cc-price-features {display:grid;gap:8px;margin:13px 0 15px;flex:1;}.cc-price-features span {display:flex;gap:7px;align-items:flex-start;color:#526071;font-size:10px;line-height:1.45;}.cc-price-features svg {color:#16a36a;flex:none;}.cc-price-card .cc-primary-btn,.cc-price-card .cc-secondary-btn {width:100%;padding:11px 8px;font-size:11px;}
        .cc-demo-grid { display:grid; grid-template-columns:.92fr 1.08fr; gap:40px; align-items:center; }
        .cc-demo-copy h2 { font:800 clamp(26px,3.4vw,35px)/1.17 var(--font-cc-manrope),'Manrope',sans-serif; letter-spacing:-1.3px; margin:10px 0 12px; }
        .cc-demo-copy h2 span { color:var(--cc-blue); }
        .cc-demo-copy p { font-size:13px; color:#667085; line-height:1.75; margin:0 0 18px; }
        .cc-demo-contact { margin-top:18px; display:inline-flex; align-items:center; gap:9px; padding:10px 14px; border-radius:10px; border:1px solid #dce5f5; background:#fff; font-size:12px; color:#344054; font-weight:600; }
        .cc-demo-contact a { color:var(--cc-blue); font-weight:700; }
        .cc-demo-card { border:1px solid #dfe7f5; background:#fff; border-radius:17px; padding:24px; box-shadow:0 16px 38px rgba(31,62,116,.08); }
        .cc-demo-fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .cc-demo-field { display:flex; flex-direction:column; gap:5px; }
        .cc-demo-field-full { grid-column:1 / -1; }
        .cc-demo-honeypot { position:absolute; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none; }
        .cc-primary-btn:disabled { opacity:.65; cursor:not-allowed; transform:none; }
        .cc-demo-field label { font-size:11px; font-weight:700; color:#344054; }
        .cc-demo-field input, .cc-demo-field select { width:100%; border:1px solid #d9e1ef; border-radius:9px; padding:10px 12px; font:600 12px var(--font-cc-dm-sans),'DM Sans',sans-serif; color:#101828; background:#fff; outline:none; }
        .cc-demo-field input:focus, .cc-demo-field select:focus { border-color:var(--cc-blue); box-shadow:0 0 0 3px rgba(37,99,235,.12); }
        .cc-demo-success { text-align:left; display:grid; gap:12px; }
        .cc-demo-success-head { display:flex; align-items:center; gap:10px; color:#15803d; font:800 16px var(--font-cc-manrope),'Manrope',sans-serif; }
        .cc-demo-summary { border:1px solid #e4ebf7; background:#f8faff; border-radius:11px; padding:13px 15px; display:grid; gap:5px; font-size:12px; color:#344054; }
        .cc-demo-success-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:4px; }
        .cc-faq-list { max-width:820px; margin:0 auto; display:grid; gap:8px; }
        .cc-faq-item { border:1px solid #e5eaf2; background:#fff; border-radius:13px; overflow:hidden; }
        .cc-faq-q { width:100%; background:#fff; border:0; padding:14px 18px; text-align:left; display:flex; align-items:center; justify-content:space-between; gap:14px; font:700 14px var(--font-cc-manrope),'Manrope',sans-serif; color:var(--cc-ink); cursor:pointer; }
        .cc-faq-q svg { flex:none; color:#667085; transition:transform .2s; }
        .cc-faq-item.cc-faq-open .cc-faq-q svg { transform:rotate(180deg); color:var(--cc-blue); }
        .cc-faq-a { padding:0 18px 14px; font-size:12.5px; color:#667085; line-height:1.65; }
        .cc-final-cta {background:linear-gradient(120deg,#123b91,#2563eb 65%,#4f83f2);border-radius:21px;padding:48px 28px;text-align:center;color:#fff;position:relative;overflow:hidden;}.cc-final-cta:before,.cc-final-cta:after {content:'';position:absolute;border:1px solid rgba(255,255,255,.12);border-radius:50%;width:330px;height:330px;}.cc-final-cta:before {left:-150px;top:-210px;}.cc-final-cta:after {right:-100px;bottom:-250px;width:400px;height:400px;}.cc-final-cta h2 {font:800 clamp(27px,4vw,38px)/1.15 var(--font-cc-manrope),'Manrope',sans-serif;letter-spacing:-1.3px;max-width:720px;margin:0 auto 12px;position:relative;z-index:1;}.cc-final-cta p {color:#dce8ff;font-size:13px;line-height:1.7;max-width:600px;margin:0 auto 22px;position:relative;z-index:1;}.cc-final-cta .cc-primary-btn {background:#fff;color:#1747bb !important;position:relative;z-index:1;box-shadow:none;}.cc-final-cta .cc-primary-btn:hover {background:#edf4ff;}
        .cc-footer {padding:50px 0 25px;background:#fbfcfe;border-top:1px solid #edf0f5;}.cc-footer-top {display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:35px;padding-bottom:35px;}.cc-footer-brand p {font-size:11px;color:#8993a3;line-height:1.8;max-width:270px;margin:14px 0 0;}.cc-footer-col b {font-size:11px;display:block;margin-bottom:13px;}.cc-footer-col a {display:block;color:#758093;font-size:10px;margin:10px 0;}.cc-footer-col a:hover {color:#2563eb;}.cc-footer-bottom {border-top:1px solid #edf0f5;padding-top:18px;display:flex;justify-content:space-between;gap:15px;color:#98a2b3;font-size:9px;}.cc-footer-bottom a {color:#667085;}
        @media (max-width: 980px) { .cc-hero-grid {gap:30px;grid-template-columns:.9fr 1.1fr}.cc-dashboard {grid-template-columns:115px 1fr;}.cc-dash-main{padding:15px 12px}.cc-dashboard{min-height:300px}.cc-floating-note-top{right:-5px}.cc-pricing-grid{grid-template-columns:repeat(2,1fr);row-gap:22px}.cc-industry-grid,.cc-feature-grid{grid-template-columns:repeat(2,1fr)}.cc-product-showcase{gap:30px}.cc-nav-links{gap:16px} }
        @media (max-width: 760px) { .cc-paw-trail-hero{left:auto;right:12px;bottom:8px;width:180px;height:86px}.cc-container{width:min(100% - 34px,560px)}.cc-nav{height:67px}.cc-nav-links,.cc-nav-actions{display:none}.cc-menu-btn{display:grid;place-items:center}.cc-mobile-menu{display:flex;position:absolute;top:66px;left:0;right:0;background:#fff;border:1px solid #edf0f5;border-radius:0 0 13px 13px;padding:12px 18px 18px;box-shadow:0 15px 25px rgba(16,24,40,.08);flex-direction:column;gap:0}.cc-mobile-menu a,.cc-mobile-menu button.cc-mobile-link{padding:12px 4px;border-bottom:1px solid #f0f2f6;font-size:13px;font-weight:600;color:#475467;background:transparent;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;width:100%;}.cc-mobile-menu .cc-primary-btn{margin-top:12px;color:#fff}.cc-hero{min-height:auto;display:block;padding:36px 0 46px}.cc-hero-grid{grid-template-columns:1fr;gap:38px}.cc-hero h1{font-size:clamp(31px,8.5vw,44px);letter-spacing:-1.4px;margin-top:14px}.cc-hero-copy{font-size:14px}.cc-hero-visual{padding:36px 7px 24px}.cc-dashboard-shell{transform:none}.cc-dashboard{grid-template-columns:105px 1fr;min-height:290px}.cc-dash-main{padding:13px 10px}.cc-dash-heading h3{font-size:14px}.cc-metric strong{font-size:14px}.cc-floating-note-bottom{left:-7px}.cc-floating-note-top{right:-4px;top:-38px}.cc-partner-section{padding:32px 18px 36px}.cc-section{padding:24px 0 36px}.cc-section-heading{margin-bottom:20px}.cc-section-heading h2{font-size:28px}.cc-industry-grid,.cc-feature-grid{grid-template-columns:1fr}.cc-transformation{grid-template-columns:1fr;gap:12px}.cc-way-card{padding:21px}.cc-way-arrow{transform:rotate(90deg);width:40px;height:40px}.cc-product-showcase,.cc-workspace,.cc-global-grid,.cc-demo-grid{grid-template-columns:1fr;gap:24px;margin:0 0 48px}.cc-demo-grid{margin:0}.cc-demo-fields{grid-template-columns:1fr}.cc-product-showcase.cc-reverse .cc-showcase-visual{order:0}.cc-showcase-visual{min-height:220px;padding:17px}.cc-showcase-copy h3{font-size:25px}.cc-mode-grid{grid-template-columns:1fr}.cc-offline-band{grid-template-columns:1fr;padding:27px 24px}.cc-offline-icon{position:absolute;right:20px;top:20px;width:48px;height:48px}.cc-offline-band h2{max-width:75%;font-size:22px}.cc-workspace{gap:28px}.cc-workspace h2{font-size:28px}.cc-pricing-grid{grid-template-columns:repeat(2,1fr);gap:12px}.cc-price-card{padding:19px 14px}.cc-price-amount{font-size:24px}.cc-final-cta{padding:39px 20px}.cc-footer-top{grid-template-columns:1fr 1fr;gap:28px 20px}.cc-footer-brand{grid-column:1/-1}.cc-footer-bottom{flex-direction:column}.cc-url-suffix{font-size:9px;padding:0 7px} }
        @media (max-width: 420px) { .cc-hero-actions{flex-direction:column;align-items:stretch}.cc-hero-actions a,.cc-hero-actions button{width:100%}.cc-dashboard{grid-template-columns:82px 1fr;min-height:275px}.cc-dash-sidebar{padding:12px 6px}.cc-dash-brand{font-size:8px;gap:4px}.cc-dash-store{font-size:7px;gap:3px;padding:6px 3px}.cc-dash-nav-item{font-size:7px;gap:5px;padding:7px 4px}.cc-dash-sidebar-bottom{left:7px;font-size:6px}.cc-dash-main{padding:12px 7px}.cc-window-address{padding:4px 13px}.cc-dash-heading h3{font-size:12px}.cc-dash-heading p{font-size:7px}.cc-metric-grid{gap:4px}.cc-metric{padding:8px 6px}.cc-metric>span{font-size:6px}.cc-metric strong{font-size:12px}.cc-metric small{font-size:6px}.cc-dash-lower{grid-template-columns:1fr;}.cc-activity-card{display:none}.cc-floating-note{padding:8px 9px}.cc-floating-note b{font-size:8px}.cc-floating-note small{font-size:7px}.cc-feature-grid{grid-template-columns:1fr}.cc-price-card{padding:17px 11px}.cc-price-card h3{font-size:14px}.cc-price-description{font-size:9px}.cc-price-features span{font-size:9px}.cc-price-card .cc-primary-btn,.cc-price-card .cc-secondary-btn{font-size:10px}.cc-url-field input{font-size:10px;padding:12px 8px} }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after {scroll-behavior:auto !important;animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;} }
      `}</style>

      <header className="cc-nav">
        <div className="cc-container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%" }}>
          <Logo />
          <nav className="cc-nav-links" aria-label="Main navigation">
            <a href="#industries">Industries</a>
            <a href="#features">Features</a>
            <a href="#modes">Modes</a>
            <a href="#global">India &amp; Global</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="cc-nav-actions">
            <button type="button" className="cc-login" onClick={scrollToWorkspaceLogin}>Store login</button>
            <button type="button" className="cc-primary-btn" onClick={() => scrollToDemoForm()}>Book free demo <ArrowRight size={15} /></button>
          </div>
          <button className="cc-menu-btn" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {mobileMenuOpen && (
            <nav className="cc-mobile-menu" aria-label="Mobile navigation">
              <a href="#industries" onClick={closeMobileMenu}>Industries</a>
              <a href="#features" onClick={closeMobileMenu}>Features</a>
              <a href="#modes" onClick={closeMobileMenu}>Business modes</a>
              <a href="#global" onClick={closeMobileMenu}>India &amp; Global</a>
              <a href="#pricing" onClick={closeMobileMenu}>Pricing</a>
              <a href="#faq" onClick={closeMobileMenu}>FAQ</a>
              <button type="button" className="cc-mobile-link" onClick={scrollToWorkspaceLogin}>Store login</button>
              <button type="button" className="cc-primary-btn" onClick={() => scrollToDemoForm()}>Book free demo <ArrowRight size={15} /></button>
            </nav>
          )}
        </div>
      </header>

      <main>
        <section className="cc-hero">
          <CubPawTrail className="cc-paw-trail-hero-top" />
          <CubPawTrail className="cc-paw-trail-hero" />
          <div className="cc-container cc-hero-grid">
            <div>
              <div className="cc-eyebrow">
                <CubPawIcon size={12} />
                Zero-Trust Multi-Tenant Retail &amp; Cafe Operating System
              </div>
              <h1>
                Still running your business on
                <span className="cc-rotating-problem" key={problemIndex}>{ROTATING_PROBLEMS[problemIndex]}</span>
                <span className="cc-blue-line">One POS for every counter.</span>
              </h1>
              <p className="cc-hero-copy">
                Built for <strong>cafes, pharmacies, supermarkets, bakeries, retail shops, and B2B wholesale</strong>. Handle GST/tax billing, WhatsApp receipts, inventory, GPS staff payroll, and wholesale dispatch in India and 36+ currencies.
              </p>
              <div className="cc-hero-actions">
                <button type="button" className="cc-primary-btn" onClick={() => scrollToDemoForm({ planName: "Free" })}>
                  Book a free demo <ArrowRight size={16} />
                </button>
                <a className="cc-secondary-btn" href="#industries">Explore billing types <ArrowUpRight size={15} /></a>
              </div>
              <div className="cc-trust-note">
                <CheckCircle2 size={14} /> Free plan available · Works offline · Already have a store?{" "}
                <button type="button" className="cc-login" style={{ textDecoration: "underline" }} onClick={scrollToWorkspaceLogin}>
                  Log in
                </button>
              </div>
            </div>
            <div className="cc-hero-visual"><DashboardPreview /></div>
          </div>
        </section>

        <PartnerSection partners={partners} />

        <section className="cc-section" id="industries">
          <CubPawTrail className="cc-paw-trail-section-tr" />
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">ALL TYPES OF BILLING &amp; OPERATIONS</div>
              <h2>Built for every counter <span>and supply chain.</span></h2>
              <p>Pick your business type to see how CounterCub powers your daily operations.</p>
            </div>

            <div className="cc-industry-grid">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon;
                const isActive = selectedIndustry === industry.id;
                return (
                  <button
                    key={industry.id}
                    type="button"
                    onClick={() => setSelectedIndustry(industry.id)}
                    className={`cc-industry-card${isActive ? " cc-industry-active" : ""}`}
                  >
                    <div className="cc-industry-top">
                      <span className="cc-industry-icon"><Icon size={18} /></span>
                      <span className="cc-industry-badge">{industry.badge}</span>
                    </div>
                    <h3>{industry.name}</h3>
                    <p>{industry.summary}</p>
                    <div className="cc-industry-chips">
                      {industry.bullets.map((bullet) => (
                        <span key={bullet}><CheckCircle2 size={11} /> {bullet}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="cc-industry-spotlight">
              <div>
                <b>Selected workflow: {activeIndustry.name}</b>
                <span>Includes POS billing, GST/tax invoicing, stock management, staff attendance &amp; payroll out of the box.</span>
              </div>
              <button
                type="button"
                className="cc-primary-btn"
                onClick={() => scrollToDemoForm({ industryId: activeIndustry.id })}
              >
                Launch for {activeIndustry.badge} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="solutions">
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">FROM MANUAL TO MANAGEABLE</div>
              <h2>Less juggling. <span>More control.</span></h2>
              <p>When bills, stock, staff shifts, and wholesale accounts live in separate notebooks and spreadsheets, errors pile up. CounterCub connects them in one workspace.</p>
            </div>
            <div className="cc-transformation">
              <div className="cc-way-card">
                <div className="cc-way-kicker">THE OLD WAY</div>
                <h3>Too many tools and manual errors.</h3>
                <div className="cc-way-list">
                  <div className="cc-way-item"><span className="cc-way-icon"><FileText size={16} /></span>Paper bills, slow calculators &amp; billing errors</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><MessageCircle size={16} /></span>Lost WhatsApp orders &amp; untracked credit dues</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><FileSpreadsheet size={16} /></span>Disconnected Excel stock &amp; payroll sheets</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><Calculator size={16} /></span>Hours spent tallying daily cash &amp; UPI totals</div>
                </div>
              </div>
              <div className="cc-way-arrow"><ArrowRight size={20} /></div>
              <div className="cc-way-card cc-way-new">
                <CubPawTrail className="cc-paw-trail-way" />
                <div className="cc-way-kicker"><CubPawIcon size={12} /> THE COUNTERCUB WAY</div>
                <h3>Every counter &amp; team in one place.</h3>
                <div className="cc-way-list">
                  <div className="cc-way-item"><span className="cc-way-icon"><Receipt size={16} /></span>Instant POS, GST invoices &amp; WhatsApp receipts</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><Boxes size={16} /></span>Live SKU, recipe &amp; supplier stock updates</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><MapPin size={16} /></span>GPS-verified staff attendance &amp; auto payroll</div>
                  <div className="cc-way-item"><span className="cc-way-icon"><BarChart3 size={16} /></span>Real-time profit, expenses &amp; B2B ledgers</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cc-section" id="features">
          <CubPawTrail className="cc-paw-trail-section-bl" />
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">ONE CONNECTED WORKSPACE</div>
              <h2>Everything your store needs, <span>all together.</span></h2>
              <p>POS billing, stock control, AI tools, GPS staff payroll, offline sync, and B2B wholesale in one platform.</p>
            </div>
            <div className="cc-feature-grid">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article className="cc-feature-card" key={feature.title}>
                    <div className="cc-industry-top">
                      <span className="cc-industry-icon"><Icon size={18} /></span>
                      <span className="cc-industry-badge">{feature.tag}</span>
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    <div className="cc-industry-chips">
                      {feature.chips.map((chip) => (
                        <span key={chip}><CheckCircle2 size={11} /> {chip}</span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="workspace">
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">BUILT FOR DAILY WORK</div>
              <h2>See how every workflow <span>comes together.</span></h2>
              <p>Four connected pillars built directly into your store workspace.</p>
            </div>

            <div className="cc-product-showcase">
              <div className="cc-showcase-visual">
                <div className="cc-showcase-window">
                  <div className="cc-showcase-top"><span>Recent POS &amp; GST bills</span><span>+ New bill</span></div>
                  <table className="cc-showcase-table">
                    <thead><tr><th>INVOICE</th><th>TYPE</th><th>STATUS</th><th>AMOUNT</th></tr></thead>
                    <tbody>
                      <tr><td>#CC-1048</td><td>Cafe Counter (UPI)</td><td><span className="cc-showcase-pill">WhatsApp Sent</span></td><td>₹840</td></tr>
                      <tr><td>#RX-2094</td><td>Pharmacy Tax Bill</td><td><span className="cc-showcase-pill">Paid</span></td><td>₹1,420</td></tr>
                      <tr><td>#RT-5120</td><td>Retail GST Invoice</td><td><span className="cc-showcase-pill">Paid</span></td><td>₹3,250</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-showcase-copy">
                <span className="cc-section-label">01 / ALL-IN-ONE POS &amp; GST/TAX BILLING</span>
                <h3>Speed through any counter queue.</h3>
                <p>Bill walk-in customers, hold pending orders, generate official GST/tax invoices with your store GSTIN and digital signature, accept UPI or multi-currency payments, and send digital bills on WhatsApp.</p>
                <div className="cc-check-list">
                  <span><CheckCircle2 size={15} /> Cafe, pharmacy, supermarket &amp; retail counter POS</span>
                  <span><CheckCircle2 size={15} /> Official GST &amp; tax invoice generator + PDF receipts</span>
                  <span><CheckCircle2 size={15} /> 1-click WhatsApp digital bill sharing</span>
                </div>
              </div>
            </div>

            <div className="cc-product-showcase cc-reverse">
              <div className="cc-showcase-visual">
                <div className="cc-showcase-window">
                  <div className="cc-showcase-top"><span>Stock &amp; AI Expense Advisor</span><span>360° Control</span></div>
                  <table className="cc-showcase-table">
                    <thead><tr><th>ITEM / SKU</th><th>STOCK</th><th>SIGNAL</th><th>ACTION</th></tr></thead>
                    <tbody>
                      <tr><td>Amoxicillin 500mg</td><td>18 boxes</td><td><span className="cc-showcase-pill">Healthy</span></td><td>In stock</td></tr>
                      <tr><td>Full Cream Milk</td><td>8 L</td><td><span className="cc-showcase-pill" style={{ background: "#fff4e5", color: "#b76e08" }}>Price +11%</span></td><td>Bulk lock</td></tr>
                      <tr><td>Arabica Beans</td><td>24 kg</td><td><span className="cc-showcase-pill">Recipe Auto</span></td><td>Tracked</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-showcase-copy">
                <span className="cc-section-label">02 / INVENTORY, SUPPLIER POs, RECIPES &amp; AI ADVISOR</span>
                <h3>Control stock and catch hidden cost spikes.</h3>
                <p>Manage retail SKUs, kitchen recipes, raw materials, supplier purchase orders, and wastage logs. Import hundreds of items from Excel/CSV using AI Smart Import (with 1-click rollback) and get AI savings recommendations.</p>
                <div className="cc-check-list">
                  <span><CheckCircle2 size={15} /> Raw materials, recipes, purchase orders &amp; stock audits</span>
                  <span><CheckCircle2 size={15} /> AI Expense Advisor detects supplier price inflation</span>
                  <span><CheckCircle2 size={15} /> AI Smart Import maps Excel/CSV sheets with rollback</span>
                </div>
              </div>
            </div>

            <div className="cc-product-showcase">
              <div className="cc-showcase-visual">
                <div className="cc-showcase-window">
                  <div className="cc-showcase-top"><span>Staff Geofence &amp; Payroll</span><span>GPS Verified</span></div>
                  <table className="cc-showcase-table">
                    <thead><tr><th>TEAM MEMBER</th><th>CHECK-IN</th><th>STATUS</th><th>PAYOUT</th></tr></thead>
                    <tbody>
                      <tr><td>Arjun K. (Cashier)</td><td>08:58 AM · 18m</td><td><span className="cc-showcase-pill">Inside Zone</span></td><td>₹18,500</td></tr>
                      <tr><td>Priya S. (Pharmacist)</td><td>09:02 AM · 12m</td><td><span className="cc-showcase-pill">Inside Zone</span></td><td>₹26,000</td></tr>
                      <tr><td>Karthik R. (Baker)</td><td>05:30 AM · 9m</td><td><span className="cc-showcase-pill">Settled</span></td><td>WhatsApp PDF</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-showcase-copy">
                <span className="cc-section-label">03 / GPS GEOFENCED ATTENDANCE, EMPLOYEE HUB &amp; PAYROLL</span>
                <h3>Verified shifts and stress-free salary days.</h3>
                <p>Ensure staff punch in from your actual store location using GPS geofencing. Attendance flows straight into timesheets, deductions, the Employee Hub career timeline, and WhatsApp PDF payslips.</p>
                <div className="cc-check-list">
                  <span><CheckCircle2 size={15} /> Store GPS radius check-in verification</span>
                  <span><CheckCircle2 size={15} /> Automated salary, advance &amp; deduction settlement</span>
                  <span><CheckCircle2 size={15} /> Employee Hub + WhatsApp PDF payslip sharing</span>
                </div>
              </div>
            </div>

            <div className="cc-product-showcase cc-reverse">
              <div className="cc-showcase-visual">
                <div className="cc-showcase-window">
                  <div className="cc-showcase-top"><span>B2B Dispatch &amp; Ledgers</span><span>3D City Live</span></div>
                  <table className="cc-showcase-table">
                    <thead><tr><th>WHOLESALE CLIENT</th><th>DISPATCH</th><th>LEDGER</th><th>BALANCE</th></tr></thead>
                    <tbody>
                      <tr><td>Green Basket Mart</td><td>42 trays</td><td><span className="cc-showcase-pill">Slip Sent</span></td><td>₹12,400</td></tr>
                      <tr><td>City Medical Hub</td><td>18 boxes</td><td><span className="cc-showcase-pill">PDF Ready</span></td><td>₹24,800</td></tr>
                      <tr><td>Metro Cafe Chain</td><td>65 loaves</td><td><span className="cc-showcase-pill">Paid</span></td><td>₹0</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-showcase-copy">
                <span className="cc-section-label">04 / B2B WHOLESALE DISPATCH, LEDGERS &amp; 3D CITY</span>
                <h3>Scale wholesale accounts without spreadsheet chaos.</h3>
                <p>Coordinate daily route dispatches, helper logs, client credit balances, broadcasts, combined PDF statements, and WhatsApp dispatch slips — plus explore every client live inside the 3D Business City dashboard.</p>
                <div className="cc-check-list">
                  <span><CheckCircle2 size={15} /> Client dispatch schedules, payments &amp; broadcasts</span>
                  <span><CheckCircle2 size={15} /> Combined PDF ledgers &amp; monthly client statements</span>
                  <span><CheckCircle2 size={15} /> Interactive Three.js 3D Business City command view</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cc-section" id="modes">
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">FLEXIBLE FOR YOUR BUSINESS</div>
              <h2>Two operating modes. <span>One CounterCub.</span></h2>
              <p>Switch cleanly between counter retail/cafe operations and wholesale dispatch — or enable both inside the same store.</p>
            </div>
            <div className="cc-mode-grid">
              <article className="cc-mode-card cc-mode-blue">
                <CubPawTrail className="cc-paw-trail-way" />
                <div className="cc-mode-top">
                  <span className="cc-mode-number">MODE 01</span>
                  <span className="cc-mode-icon"><Store size={19} /></span>
                </div>
                <h3>Cafe, Pharmacy &amp; Retail POS</h3>
                <p>Built for walk-in billing counters — manage fast POS checkout, GST invoices, recipe/SKU stock, supplier POs, AI expense audits, and GPS-verified team payroll.</p>
                <div className="cc-mode-tags">
                  <span>POS Billing</span>
                  <span>GST Invoices</span>
                  <span>Inventory &amp; Recipes</span>
                  <span>GPS Payroll</span>
                </div>
              </article>
              <article className="cc-mode-card">
                <div className="cc-mode-top">
                  <span className="cc-mode-number">MODE 02</span>
                  <span className="cc-mode-icon"><Boxes size={19} /></span>
                </div>
                <h3>Baker &amp; B2B Wholesale</h3>
                <p>Built for B2B suppliers and distributors — coordinate client deliveries, helpers, credit ledgers, payment collections, broadcasts, and live 3D City monitoring.</p>
                <div className="cc-mode-tags">
                  <span>Dispatch</span>
                  <span>Customer Ledgers</span>
                  <span>PDF Statements</span>
                  <span>3D City View</span>
                </div>
                <div className="cc-city-preview" aria-label="Decorative preview of the 3D business city dashboard">
                  <div className="cc-city-glow" />
                  <i className="cc-city-building" />
                  <i className="cc-city-building" />
                  <i className="cc-city-building" />
                  <i className="cc-city-building" />
                  <i className="cc-city-building" />
                </div>
                <div style={{ fontSize: "9px", color: "#2563eb", fontWeight: 700, marginTop: 8 }}>Explore the interactive 3D business city</div>
              </article>
            </div>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="global">
          <CubPawTrail className="cc-paw-trail-section-tr" />
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">INDIA-FIRST &amp; GLOBAL-READY</div>
              <h2>Built in India. <span>Ready for 36+ currencies worldwide.</span></h2>
              <p>Whether your counter runs in Chennai, Mumbai, Bengaluru, Dubai, London, Singapore, or New York, CounterCub adapts to your local currency and timezone.</p>
            </div>

            <div className="cc-global-grid">
              <article className="cc-global-card">
                <span className="cc-section-label">FOR INDIAN BUSINESSES (EN-IN)</span>
                <h3>GST, UPI &amp; WhatsApp workflows built right in</h3>
                <p>Designed around real Indian retail, pharmacy, cafe, and wholesale operations — from GSTIN tax headers and UPI ID billing to instant WhatsApp bills and staff payslips in Indian Rupees (₹).</p>
                <div className="cc-check-list">
                  <span><CheckCircle2 size={15} /> Store GSTIN &amp; authorized signature on invoices</span>
                  <span><CheckCircle2 size={15} /> Native UPI ID checkout &amp; ₹ INR formatting</span>
                  <span><CheckCircle2 size={15} /> WhatsApp bill, dispatch slip &amp; salary PDF sharing</span>
                </div>
              </article>

              <article className="cc-global-card">
                <span className="cc-section-label">FOR INTERNATIONAL STORES (36+ CURRENCIES)</span>
                <h3>Multi-currency &amp; timezone support across 6 continents</h3>
                <p>Configure your store currency and timezone from day one. Supporting businesses across the UAE &amp; GCC, UK, Europe, North America, Southeast Asia, Australia, and beyond.</p>
                <div className="cc-currency-chips">
                  {FEATURED_GLOBAL_CURRENCIES.map((cur) => (
                    <span className="cc-currency-chip" key={cur.code}>
                      <b>{cur.symbol}</b> {cur.code} · {cur.country}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="cc-section">
          <div className="cc-container">
            <div className="cc-offline-band">
              <CubPawTrail className="cc-paw-trail-offline" variant="light" />
              <div>
                <h2>Business doesn’t stop when the internet does.</h2>
                <p>CounterCub runs as an offline-first Progressive Web App (PWA) with an IndexedDB local store and sync engine — keeping supported counter billing running during connectivity drops and syncing automatically when back online.</p>
              </div>
              <div className="cc-offline-icon"><CloudOff size={29} /></div>
            </div>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="workspace">
          <div className="cc-container cc-workspace">
            <div>
              <div className="cc-section-label">YOUR BUSINESS. YOUR WORKSPACE.</div>
              <h2>A dedicated digital address for every store.</h2>
              <p>Each business gets its own isolated CounterCub subdomain, role-based admin and staff logins, and zero-trust tenant data isolation.</p>
              <div className="cc-check-list">
                <span><CheckCircle2 size={15} /> Dedicated workspace URL (&lt;store&gt;.countercub.com)</span>
                <span><CheckCircle2 size={15} /> Role-based admin, staff &amp; B2B helper access</span>
                <span><CheckCircle2 size={15} /> Audit logs &amp; strict multi-tenant isolation</span>
              </div>
            </div>
            <form className="cc-url-demo" onSubmit={openStoreWorkspace}>
              <label className="cc-url-label" htmlFor="cc-store-slug">Already have a CounterCub store?</label>
              <div className="cc-url-field">
                <input
                  id="cc-store-slug"
                  autoComplete="off"
                  value={storeSlug}
                  onChange={(event) => { setStoreSlug(event.target.value); setSlugError(""); }}
                  placeholder="Enter your store name"
                />
                <span className="cc-url-suffix">.countercub.com</span>
              </div>
              {slugError && <div className="cc-url-error" role="alert">{slugError}</div>}
              <button type="submit" className="cc-primary-btn cc-url-submit">Open my workspace <ArrowRight size={15} /></button>
              <div className="cc-url-hint">Example: yourstore.countercub.com/login</div>
            </form>
          </div>
        </section>

        <section className="cc-section" id="pricing">
          <CubPawTrail className="cc-paw-trail-section-tl" />
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">SIMPLE, TRANSPARENT PLANS</div>
              <h2>Start free. <span>Scale as your counters grow.</span></h2>
              <p>Clear monthly pricing based on your active products and team seats. Preview plans in Indian Rupees or global currencies.</p>
            </div>

            <div className="cc-currency-switcher" role="group" aria-label="Preview plan pricing currency">
              {PRICING_CURRENCIES.map((cur) => (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => setPricingCurrency(cur.code)}
                  className={`cc-currency-btn${pricingCurrency === cur.code ? " cc-currency-btn-active" : ""}`}
                >
                  {cur.label}
                </button>
              ))}
            </div>

            <div className="cc-pricing-grid">
              {PLANS.map((plan) => (
                <article className={`cc-price-card${plan.featured ? " cc-price-featured" : ""}`} key={plan.name}>
                  {plan.featured && <div className="cc-price-popular">POPULAR CHOICE</div>}
                  <h3>{plan.name}</h3>
                  <div className="cc-price-description">{plan.description}</div>
                  <div className="cc-price-amount">
                    {formatPlanPrice(plan.inrPrice, pricingCurrency)}
                    <small> / month</small>
                  </div>
                  <div className="cc-price-period">
                    {pricingCurrency === "INR" ? "Billed monthly (INR)" : `Approx. (official billing ₹${plan.inrPrice}/mo)`}
                  </div>
                  <div className="cc-price-features">
                    {plan.features.map((feature) => (
                      <span key={feature}><Check size={13} />{feature}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => scrollToDemoForm({ planName: plan.name })}
                    className={plan.featured ? "cc-primary-btn" : "cc-secondary-btn"}
                  >
                    {plan.cta} <ArrowRight size={13} />
                  </button>
                </article>
              ))}
            </div>
            <p style={{ textAlign: "center", color: "#98a2b3", fontSize: "10px", marginTop: 18 }}>
              Official CounterCub plan limits (`Free`, `Basic`, `Pro`, `Business`) are billed in INR; international currency values are approximate guides.
            </p>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="book-demo">
          <CubPawTrail className="cc-paw-trail-demo" />
          <div className="cc-container cc-demo-grid">
            <div className="cc-demo-copy">
              <div className="cc-section-label">BOOK A FREE DEMO &amp; STORE SETUP</div>
              <h2>See CounterCub tailored to your counter <span>in 15 minutes.</span></h2>
              <p>Tell us about your cafe, pharmacy, supermarket, retail store, or wholesale business. Our team will walk you through POS billing, GST invoices, inventory import, and set up your dedicated store workspace.</p>
              <div className="cc-check-list">
                <span><CheckCircle2 size={15} /> Dedicated &lt;yourstore&gt;.countercub.com workspace</span>
                <span><CheckCircle2 size={15} /> Assisted Excel/CSV catalog import with AI Smart Import</span>
                <span><CheckCircle2 size={15} /> Live POS, WhatsApp bills &amp; GPS payroll walkthrough</span>
              </div>
              <div className="cc-demo-contact">
                <MessageCircle size={16} style={{ color: "#2563eb" }} />
                <span>Direct team inbox: <strong>support@countercub.com</strong></span>
              </div>
            </div>

            <div className="cc-demo-card">
              {demoSubmitted ? (
                <div className="cc-demo-success" role="status">
                  <div className="cc-demo-success-head">
                    <CheckCircle2 size={21} />
                    <span>Demo request sent to our team!</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475467", lineHeight: 1.65 }}>
                    Thank you, <strong>{demoName}</strong>. Your demo request has been sent to{" "}
                    <strong>support@countercub.com</strong> — our onboarding team will reach out shortly.
                  </p>
                  <div className="cc-demo-summary">
                    <span><strong>Store:</strong> {demoStoreName}{demoCity.trim() ? ` (${demoCity.trim()})` : ""}</span>
                    <span><strong>Phone / WhatsApp:</strong> {demoPhone}</span>
                    {demoEmail.trim() && <span><strong>Email:</strong> {demoEmail.trim()}</span>}
                    <span><strong>Business Type:</strong> {selectedDemoIndustryName}</span>
                    <span><strong>Selected Plan:</strong> {demoPlan} ({pricingCurrency})</span>
                  </div>
                  <div className="cc-demo-success-actions">
                    <button
                      type="button"
                      className="cc-primary-btn"
                      onClick={() => setDemoSubmitted(false)}
                    >
                      Submit another request
                    </button>
                  </div>
                </div>
              ) : (
                <form id="cc-demo-form" onSubmit={handleDemoSubmit} noValidate>
                  <div className="cc-demo-honeypot" aria-hidden="true">
                    <label htmlFor="cc-demo-website">Website</label>
                    <input
                      id="cc-demo-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={demoHoneypot}
                      onChange={(e) => setDemoHoneypot(e.target.value)}
                    />
                  </div>
                  <div className="cc-demo-fields">
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-name">Full Name *</label>
                      <input
                        id="cc-demo-name"
                        type="text"
                        required
                        maxLength={100}
                        value={demoName}
                        onChange={(e) => { setDemoName(e.target.value); setDemoError(""); }}
                        placeholder="e.g., Arjun Kumar"
                      />
                    </div>
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-phone">Phone / WhatsApp *</label>
                      <input
                        id="cc-demo-phone"
                        type="tel"
                        required
                        maxLength={30}
                        value={demoPhone}
                        onChange={(e) => { setDemoPhone(e.target.value); setDemoError(""); }}
                        placeholder="e.g., +91 98765 43210"
                      />
                    </div>
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-store">Business / Store Name *</label>
                      <input
                        id="cc-demo-store"
                        type="text"
                        required
                        maxLength={120}
                        value={demoStoreName}
                        onChange={(e) => { setDemoStoreName(e.target.value); setDemoError(""); }}
                        placeholder="e.g., CarePlus Pharmacy"
                      />
                    </div>
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-city">City / Country *</label>
                      <input
                        id="cc-demo-city"
                        type="text"
                        required
                        maxLength={100}
                        value={demoCity}
                        onChange={(e) => { setDemoCity(e.target.value); setDemoError(""); }}
                        placeholder="e.g., Chennai, India / Dubai, UAE"
                      />
                    </div>
                    <div className="cc-demo-field cc-demo-field-full">
                      <label htmlFor="cc-demo-email">Contact Email *</label>
                      <input
                        id="cc-demo-email"
                        type="email"
                        required
                        maxLength={120}
                        value={demoEmail}
                        onChange={(e) => { setDemoEmail(e.target.value); setDemoError(""); }}
                        placeholder="e.g., owner@yourstore.com"
                      />
                    </div>
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-industry">Business Type</label>
                      <select
                        id="cc-demo-industry"
                        value={demoIndustry}
                        onChange={(e) => setDemoIndustry(e.target.value)}
                      >
                        {INDUSTRIES.map((ind) => (
                          <option key={ind.id} value={ind.id}>{ind.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="cc-demo-field">
                      <label htmlFor="cc-demo-plan">Interested Plan</label>
                      <select
                        id="cc-demo-plan"
                        value={demoPlan}
                        onChange={(e) => setDemoPlan(e.target.value)}
                      >
                        {PLANS.map((plan) => (
                          <option key={plan.name} value={plan.name}>
                            {plan.name} ({formatPlanPrice(plan.inrPrice, pricingCurrency)}/mo)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {demoError && <div className="cc-url-error" role="alert" style={{ marginTop: 10 }}>{demoError}</div>}
                  <button
                    type="submit"
                    className="cc-primary-btn"
                    disabled={demoSubmitting}
                    style={{ width: "100%", marginTop: 14 }}
                  >
                    {demoSubmitting ? "Sending demo request..." : "Book My Free Demo"} {!demoSubmitting && <ArrowRight size={15} />}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="cc-section" id="faq">
          <div className="cc-container">
            <div className="cc-section-heading">
              <div className="cc-section-label">FREQUENTLY ASKED QUESTIONS</div>
              <h2>Answers for <span>cafes, pharmacies, retail &amp; B2B teams.</span></h2>
              <p>Everything you need to know about billing, GST invoices, offline mode, GPS attendance, and global currencies.</p>
            </div>

            <div className="cc-faq-list">
              {faqItems.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div className={`cc-faq-item${isOpen ? " cc-faq-open" : ""}`} key={item.question}>
                    <button
                      type="button"
                      className="cc-faq-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    >
                      <span>{item.question}</span>
                      <ChevronDown size={17} />
                    </button>
                    {isOpen && <div className="cc-faq-a">{item.answer}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="cc-section cc-section-soft">
          <div className="cc-container">
            <div className="cc-final-cta">
              <CubPawTrail className="cc-paw-trail-cta" variant="light" />
              <CubPawTrail className="cc-paw-trail-cta-right" variant="light" />
              <h2>One operating system for your cafe, pharmacy, retail shop &amp; B2B supply.</h2>
              <p>Start on the free plan today. Bill faster, control inventory, verify staff shifts, and grow across India or worldwide.</p>
              <button type="button" onClick={() => scrollToDemoForm()} className="cc-primary-btn">
                <Sparkles size={15} /> Book your free demo <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="cc-footer">
        <div className="cc-container">
          <div className="cc-footer-top">
            <div className="cc-footer-brand">
              <Logo />
              <p>Multi-tenant POS billing, GST invoicing, inventory intelligence, GPS staff payroll, and B2B wholesale operating system for India and global businesses.</p>
            </div>
            <div className="cc-footer-col">
              <b>Solutions</b>
              <a href="#industries">Cafe &amp; Pharmacy POS</a>
              <a href="#features">Inventory &amp; AI Tools</a>
              <a href="#modes">Baker &amp; B2B Modes</a>
              <a href="#global">India &amp; Global (36+ Currencies)</a>
            </div>
            <div className="cc-footer-col">
              <b>Platform</b>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
              <a href="#workspace">Store Workspace Login</a>
              <a href={resolvedPlatformUrl}>Platform Admin Login</a>
            </div>
            <div className="cc-footer-col">
              <b>Support</b>
              <a href="#book-demo" onClick={(e) => { e.preventDefault(); scrollToDemoForm(); }}>support@countercub.com</a>
              <a href={resolvedSignupUrl} onClick={(e) => { if (!signupUrl) { e.preventDefault(); scrollToDemoForm(); } }}>Book a free demo</a>
              <a href="#top">Back to top</a>
            </div>
          </div>
          <div className="cc-footer-bottom">
            <span>© {new Date().getFullYear()} CounterCub. All rights reserved.</span>
            <span>Cafe POS · Pharmacy Billing · Retail GST · B2B Wholesale OS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default CounterCubLandingPage;
