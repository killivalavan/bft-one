import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { TenantProvider } from "@/lib/context/TenantContext";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { PWARegister } from "@/components/offline/PWARegister";

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

import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "SeyalPro — Business Operating System",
  description: "Client POS, Timesheets, Billing, Inventory & Payroll Management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SeyalPro",
  },
  formatDetection: {
    telephone: false,
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
        className={`${plusJakartaSans.variable} ${geistMono.variable} font-sans antialiased bg-[#F8FAFC] text-[#0F172A] min-h-screen selection:bg-[#2563EB] selection:text-white`}
      >
        <TenantProvider>
          <ToastProvider>
            <PWARegister />
            <OfflineBanner />
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
