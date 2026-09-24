import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/ui/Toast";
import { TenantProvider } from "@/lib/context/TenantContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-100`}
      >
        <TenantProvider>
          <ToastProvider>
            <Navbar />
            <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24">
              {children}
            </div>
          </ToastProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
