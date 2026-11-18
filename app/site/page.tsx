import type { Metadata } from "next";
import { CounterCubLandingPage, type LandingFaqItem } from "@/components/marketing/CounterCubLandingPage";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.countercub.com";

export const metadata: Metadata = {
  title: {
    absolute:
      "CounterCub — POS Billing Software for Cafes, Pharmacies, Retail, Bakeries & B2B Wholesale",
  },
  description:
    "All-in-one cloud & offline POS billing, GST invoicing, inventory, recipe & stock control, GPS geofenced staff attendance, automated payroll, and B2B wholesale dispatch software for cafes, pharmacies, supermarkets, bakeries, retail shops, and distributors across India and 36+ global currencies.",
  keywords: [
    "POS billing software India",
    "cafe POS software India",
    "pharmacy billing software India",
    "medical store billing software",
    "supermarket grocery kirana POS",
    "tea shop bakery billing software",
    "GST invoice billing software",
    "UPI WhatsApp billing POS",
    "staff geofence attendance payroll software India",
    "B2B wholesale dispatch ledger software",
    "cloud POS system",
    "pharmacy and retail point of sale",
    "restaurant and cafe POS software",
    "bakery wholesale ERP",
    "offline PWA billing software",
    "multi-currency POS system",
    "retail inventory and payroll software UAE UK USA Singapore Malaysia",
  ],
  alternates: {
    canonical: BASE_URL,
    languages: {
      "en-IN": BASE_URL,
      "en-US": BASE_URL,
      "en-AE": BASE_URL,
      "en-GB": BASE_URL,
      "en-SG": BASE_URL,
      "x-default": BASE_URL,
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    alternateLocale: ["en_US", "en_GB", "en_AE", "en_SG"],
    url: BASE_URL,
    siteName: "CounterCub",
    title:
      "CounterCub — POS Billing Software for Cafes, Pharmacies, Retail, Bakeries & B2B Wholesale",
    description:
      "Fast POS billing, GST/tax invoices, WhatsApp receipts, inventory & recipe tracking, GPS geofenced staff attendance, automated payroll, and B2B wholesale dispatch across India and 36+ currencies.",
    images: [
      {
        url: "/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "CounterCub — POS Billing, Inventory, Payroll & B2B Wholesale OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "CounterCub — POS Billing for Cafes, Pharmacies, Retail & B2B Wholesale",
    description:
      "Cloud & offline-ready POS billing, GST invoicing, WhatsApp bills, inventory, GPS staff payroll, and B2B dispatch in India and 36+ currencies.",
    images: ["/icon-512x512.png"],
  },
};

const SITE_FAQS: LandingFaqItem[] = [
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
    question:
      "Can I import my existing pharmacy, grocery, or cafe product list from Excel or CSV?",
    answer:
      "Yes. CounterCub includes AI Smart Import that analyzes Excel and CSV files, maps your product names, SKUs, prices, and categories automatically, validates rows before saving, and supports 1-click rollback.",
  },
  {
    question:
      "Does CounterCub support both Indian (₹ INR, UPI, GST) and international currencies?",
    answer:
      "Yes. CounterCub supports Indian GST invoices, UPI checkout, and INR by default, plus 36+ global currencies including USD, AED, GBP, EUR, SGD, MYR, SAR, QAR, AUD, and CAD with per-store timezone settings.",
  },
];

const JSON_LD_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "CounterCub",
      url: BASE_URL,
      email: "support@countercub.com",
      description:
        "Zero-Trust Multi-Tenant POS Billing, Inventory, Staff Attendance, Payroll, and B2B Wholesale Operating System.",
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "CounterCub",
      publisher: { "@id": `${BASE_URL}/#organization` },
      inLanguage: ["en-IN", "en-US", "en-GB", "en-AE", "en-SG"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${BASE_URL}/#software`,
      name: "CounterCub",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Point of Sale, Billing, Inventory, Payroll & B2B ERP",
      operatingSystem: "Web, PWA, Windows, macOS, Android, iOS",
      url: BASE_URL,
      publisher: { "@id": `${BASE_URL}/#organization` },
      areaServed: [
        "IN",
        "US",
        "AE",
        "GB",
        "SG",
        "MY",
        "SA",
        "AU",
        "CA",
        "EU",
      ],
      featureList: [
        "Cafe, Tea Shop & Restaurant POS Billing",
        "Pharmacy & Medical Store Billing & Stock Tracking",
        "Supermarket, Kirana & General Retail GST Invoicing",
        "WhatsApp Digital Receipts, Dispatch Slips & Payslips",
        "UPI QR Checkout & 36+ International Currencies",
        "Inventory, Recipes, Supplier Purchase Orders & Wastage Control",
        "GPS Geofenced Staff Attendance, Timesheets & Automated Payroll",
        "AI Expense Inflation Advisor & AI Smart Excel/CSV Import",
        "Offline-First PWA Billing & IndexedDB Sync Engine",
        "B2B Wholesale Dispatch, Customer Ledgers & 3D Business City Dashboard",
      ],
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Basic",
          price: "199",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "299",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Business",
          price: "499",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${BASE_URL}/#faq`,
      mainEntity: SITE_FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
};

/**
 * Public landing page. The edge router rewrites `/` on the marketing host
 * (localhost / countercub.com / www.countercub.com) to this route, and redirects
 * `/site` on shop and platform admin hosts, so it only ever renders on the public website.
 */
export default function SitePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_GRAPH) }}
      />
      <CounterCubLandingPage faqs={SITE_FAQS} />
    </>
  );
}
