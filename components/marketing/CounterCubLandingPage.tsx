"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { DM_Sans, Manrope } from "next/font/google";
import "./CounterCubLandingPage.css";
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
import { CounterCubMark } from "@/components/ui/SeyalLogo";

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
  return <CounterCubMark size={size} className={className} />;
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
      <span className="cc-brand-mark"><CounterCubMark size={20} /></span>
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
      <div className="cc-floating-notes">
        <div className="cc-floating-note cc-floating-note-top"><span><CheckCircle2 size={15} /></span><div><b>POS + GST + WhatsApp</b><small>Bills &amp; payslips in 1 click</small></div></div>
        <div className="cc-floating-note cc-floating-note-bottom"><span><Zap size={15} /></span><div><b>36+ Global Currencies</b><small>India ₹ · USD $ · AED · GBP · EUR</small></div></div>
      </div>
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

  const [clientPlatformUrl, setClientPlatformUrl] = useState(
    "https://app.countercub.com/super-admin"
  );
  useEffect(() => {
    if (!platformUrl) {
      setClientPlatformUrl(getPlatformAdminUrl("/super-admin"));
    }
  }, [platformUrl]);

  const resolvedPlatformUrl = platformUrl || clientPlatformUrl;
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
            <>
              <div className="cc-mobile-backdrop" onClick={closeMobileMenu} aria-hidden="true" />
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
            </>
          )}
        </div>
      </header>

      <main>
        <section className="cc-hero">
          <CubPawTrail className="cc-paw-trail-hero-top" />
          <CubPawTrail className="cc-paw-trail-hero" />
          <div className="cc-container">
            <div className="cc-hero-grid">
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
                  <CheckCircle2 size={14} />
                  <span>
                    Free plan available · Works offline · Already have a store?{" "}
                    <button type="button" className="cc-login" style={{ textDecoration: "underline" }} onClick={scrollToWorkspaceLogin}>
                      Log in
                    </button>
                  </span>
                </div>
              </div>
              <div className="cc-hero-visual"><DashboardPreview /></div>
            </div>
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

        <section className="cc-section cc-section-soft" id="workflows">
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
                      <tr><td>Full Cream Milk</td><td>8 L</td><td><span className="cc-showcase-pill" style={{ background: "#fff4e5", color: "#9a5b04" }}>Price +11%</span></td><td>Bulk lock</td></tr>
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
          <div className="cc-container">
            <div className="cc-workspace">
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
            <p style={{ textAlign: "center", color: "#667085", fontSize: "11px", marginTop: 18 }}>
              Official CounterCub plan limits (Free, Basic, Pro, Business) are billed in INR; international currency values are approximate guides.
            </p>
          </div>
        </section>

        <section className="cc-section cc-section-soft" id="book-demo">
          <CubPawTrail className="cc-paw-trail-demo" />
          <div className="cc-container">
            <div className="cc-demo-grid">
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
