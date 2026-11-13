import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { TenantProvider } from "@/lib/context/TenantContext";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { PWARegister } from "@/components/offline/PWARegister";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://www.countercub.com"
  ),
  title: {
    default: "CounterCub — Business Operating System",
    template: "%s | CounterCub",
  },
  description:
    "Enterprise multi-tenant retail point-of-sale, inventory intelligence, timesheet tracking, billing, and automated staff payroll platform.",
  applicationName: "CounterCub",
  authors: [{ name: "CounterCub" }],
  keywords: [
    "POS",
    "Point of Sale",
    "Billing",
    "Inventory",
    "Retail Management",
    "Timesheet",
    "Payroll",
    "CounterCub",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CounterCub",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://www.countercub.com",
    siteName: "CounterCub",
    title: "CounterCub — Business Operating System",
    description:
      "Enterprise multi-tenant retail point-of-sale, inventory intelligence, timesheet tracking, billing, and automated staff payroll platform.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CounterCub — Business Operating System",
    description:
      "Enterprise multi-tenant retail point-of-sale, inventory intelligence, timesheet tracking, billing, and automated staff payroll platform.",
  },
};

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${plusJakartaSans.variable} ${geistMono.variable} font-sans antialiased bg-[#F8FAFC] text-[#0F172A] min-h-screen selection:bg-[#2563EB] selection:text-white`}
      >
        <TenantProvider>
          <QueryProvider>
            <ToastProvider>
              <ConfirmProvider>
                <PWARegister />
                <OfflineBanner />
                <AppShell>{children}</AppShell>
              </ConfirmProvider>
            </ToastProvider>
          </QueryProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
