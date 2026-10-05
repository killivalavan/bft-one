import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { TenantProvider } from "@/lib/context/TenantContext";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { PWARegister } from "@/components/offline/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#F8FAFC] text-[#0F172A] min-h-screen selection:bg-[#2563EB] selection:text-white`}
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
