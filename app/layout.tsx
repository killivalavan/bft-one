import type { Metadata } from "next";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/600.css";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className="font-sans antialiased bg-[#F8FAFC] text-[#0F172A] min-h-screen selection:bg-[#2563EB] selection:text-white"
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
