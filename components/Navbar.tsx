"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import { cn } from "@/lib/utils/cn";
import {
  Home, CalendarCheck2, CalendarDays, Coffee, ClipboardList, Shield,
  User, LogOut, ChevronDown, Bell, Wallet, TrendingUp, Globe, Sparkles, Store
} from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const { flags } = useProfile();
  const { business, isModuleEnabled } = useTenant();

  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Persistence & Auth Logic
  useEffect(() => {
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem('bftone_display_email') : null;
      if (cached) setUserEmail(cached);
    } catch { }
  }, []);

  useEffect(() => {
    if (user) {
      setUserEmail(user.email);
      try { localStorage.setItem('bftone_display_email', user.email!); } catch { }
    } else if (!loading) {
      setUserEmail(undefined);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
      if (pathname !== "/login") {
        try { router.replace("/login"); } catch { }
      }
    }
  }, [user, loading, pathname, router]);

  // Click Outside Dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Hide on login page
  if (pathname === "/login") return null;

  const displayName = userEmail ? userEmail.split("@")[0] : null;
  const initial = displayName ? displayName[0].toUpperCase() : "?";
  const isSuperAdminView = flags?.isSuperAdmin && pathname.startsWith("/super-admin");

  // Standard Desktop / Mobile Navigation Links
  const allLinks = isSuperAdminView
    ? [
        { href: "/super-admin", label: "Super Admin Hub", icon: Globe },
      ]
    : [
        { href: "/", label: "Dashboard", icon: Home },
        ...(flags?.isAdmin
          ? [{ href: "/admin/fill-timesheet", label: "Fill Timesheet", icon: CalendarCheck2 }]
          : isModuleEnabled("sales") ? [{ href: "/sales", label: "Daily Sales", icon: TrendingUp }] : []),
        { href: "/calendar", label: "Calendar", icon: CalendarDays },
        ...(flags?.isAdmin
          ? [{ href: "/admin", label: "Admin Panel", icon: Shield }]
          : isModuleEnabled("salary") ? [{ href: "/mysalary", label: "My Salary", icon: Wallet }] : []),
      ];

  // Focus Mode Links for fast-paced Cashier/Billing screen
  const focusLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/pending", label: "Pending Orders", icon: ClipboardList },
    { href: "/billing", label: "Billing / POS", icon: Coffee },
  ];

  const isFocusMode = (pathname.startsWith("/billing") || pathname.startsWith("/pending")) && isModuleEnabled("billing");
  const visibleLinks = isFocusMode ? focusLinks : allLinks;

  async function handleLogout() {
    try {
      await Promise.race([
        supabaseClient.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.error("Logout error/timeout", e);
    } finally {
      setMenuOpen(false);
      try { localStorage.removeItem('bftone_display_email'); } catch { }
      try { localStorage.removeItem('bftone_tenant_cache'); } catch { }
      try { localStorage.removeItem('bftone_flags'); } catch { }
      if (typeof document !== 'undefined') {
        document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
      }
      window.location.href = '/login';
    }
  }

  return (
    <>
      {/* Top Desktop Navigation Bar */}
      <nav className={cn(
        "sticky top-0 z-50 transition-all duration-300 backdrop-blur-xl",
        isSuperAdminView
          ? "bg-slate-950/90 border-b border-slate-800/80 text-white shadow-lg shadow-black/20"
          : "bg-white/90 border-b border-zinc-200/80 text-zinc-900 shadow-sm"
      )}>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-12">
          <div className={cn("flex items-center h-16 sm:h-18", isFocusMode ? "justify-center" : "justify-between")}>
            
            {/* Left: Brand Identity & Connected Store Pill */}
            {!isFocusMode && (
              <div className="flex-shrink-0 flex items-center gap-3">
                <Link
                  href={flags?.isSuperAdmin ? "/super-admin" : "/"}
                  className="flex items-center gap-2.5 group"
                >
                  {/* Brand Gem Icon */}
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-sky-600/20 group-hover:scale-105 group-hover:shadow-sky-600/30 transition-all">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "font-extrabold text-lg sm:text-xl tracking-tight leading-tight transition-colors",
                      isSuperAdminView
                        ? "text-white group-hover:text-sky-300"
                        : "text-zinc-900 group-hover:text-sky-600"
                    )}>
                      SeyalPro
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase hidden sm:block">
                      Business OS
                    </span>
                  </div>
                </Link>

                {/* Live Branch / Super Admin Badge */}
                {isSuperAdminView ? (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm">
                    <Globe size={13} className="text-indigo-400 animate-spin-slow" />
                    <span>Super Admin Platform</span>
                  </span>
                ) : business?.name ? (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-sm max-w-[240px] truncate"
                    title={business.name}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <Store size={13} className="text-emerald-600 shrink-0" />
                    <span className="truncate">{business.name}</span>
                  </span>
                ) : null}
              </div>
            )}

            {/* Middle: Desktop Nav Pill Tabs */}
            <div className={cn("flex items-center space-x-1 sm:space-x-1.5", !isFocusMode && "hidden md:flex")}>
              {visibleLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all duration-200",
                      isSuperAdminView
                        ? isActive
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                          : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                        : isActive
                          ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <link.icon size={16} className={isActive ? "text-white" : isSuperAdminView ? "text-slate-400" : "text-zinc-400"} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Right: Actions, Notifications & User Profile */}
            {!isFocusMode && (
              <div className="flex-shrink-0 flex items-center gap-2.5 sm:gap-3">
                {/* Notification Bell */}
                <Link
                  href="/notifications"
                  className={cn(
                    "relative p-2 rounded-xl border transition-all",
                    isSuperAdminView
                      ? "text-slate-300 hover:text-white hover:bg-slate-800 border-slate-800"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200/80"
                  )}
                  title="Notifications"
                >
                  <Bell size={18} />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white">
                    <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-75" />
                  </span>
                </Link>

                {/* User Menu Trigger */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className={cn(
                      "flex items-center gap-2 p-1.5 sm:pl-3 rounded-full border transition-all focus:outline-none focus:ring-2",
                      isSuperAdminView
                        ? "border-slate-700 bg-slate-800/80 hover:bg-slate-800 focus:ring-indigo-400/20"
                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100/80 focus:ring-sky-500/20"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-bold leading-tight max-w-[120px] truncate hidden sm:block capitalize",
                      isSuperAdminView ? "text-white" : "text-zinc-900"
                    )}>
                      {displayName || "Guest"}
                    </span>

                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center text-xs font-extrabold shadow-sm">
                      {initial}
                    </div>
                    <ChevronDown size={14} className={isSuperAdminView ? "text-slate-400 mr-1" : "text-zinc-400 mr-1"} />
                  </button>

                  {/* Dropdown Menu */}
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-zinc-200 p-1.5 animate-in fade-in zoom-in-95 duration-200 origin-top-right z-50">
                      <div className="px-3.5 py-3 border-b border-zinc-100">
                        <p className="text-sm font-bold text-zinc-900 capitalize">{displayName}</p>
                        <p className="text-xs text-zinc-500 truncate">{userEmail}</p>
                        <div className="mt-1.5">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700">
                            {flags?.isSuperAdmin ? "👑 Platform Super Admin" : flags?.isAdmin ? "🛡️ Store Admin" : "👤 Staff Member"}
                          </span>
                        </div>
                      </div>

                      <div className="py-1 space-y-0.5">
                        <Link
                          href="/profile"
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 font-medium rounded-xl hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          <User size={16} className="text-zinc-400" />
                          <span>My Profile</span>
                        </Link>

                        {flags?.isSuperAdmin && (
                          <Link
                            href="/super-admin"
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-purple-700 font-semibold rounded-xl hover:bg-purple-50 transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            <Globe size={16} className="text-purple-600" />
                            <span>Super Admin Hub</span>
                          </Link>
                        )}
                      </div>

                      <div className="pt-1 border-t border-zinc-100">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-rose-600 font-medium rounded-xl hover:bg-rose-50 transition-colors"
                        >
                          <LogOut size={16} />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Modern Mobile Bottom Navigation Bar */}
      {!isFocusMode && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around h-16 px-2">
            {allLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-full h-full py-1 transition-all",
                    isActive ? "text-sky-600" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-xl transition-all duration-200",
                    isActive ? "bg-sky-50 scale-110" : "bg-transparent"
                  )}>
                    <Icon size={20} className={isActive ? "stroke-[2.5]" : "stroke-[1.75]"} />
                  </div>
                  <span className={cn(
                    "text-[10px] tracking-tight mt-0.5",
                    isActive ? "font-bold text-sky-600" : "font-medium text-zinc-500"
                  )}>
                    {link.label}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-sky-600 absolute bottom-1.5" />
                  )}
                </Link>
              );
            })}

            <Link
              href="/profile"
              className={cn(
                "relative flex flex-col items-center justify-center w-full h-full py-1 transition-all",
                pathname === "/profile" ? "text-sky-600" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                pathname === "/profile" ? "bg-sky-50 scale-110" : "bg-transparent"
              )}>
                <User size={20} className={pathname === "/profile" ? "stroke-[2.5]" : "stroke-[1.75]"} />
              </div>
              <span className={cn(
                "text-[10px] tracking-tight mt-0.5",
                pathname === "/profile" ? "font-bold text-sky-600" : "font-medium text-zinc-500"
              )}>
                Profile
              </span>
              {pathname === "/profile" && (
                <span className="w-1 h-1 rounded-full bg-sky-600 absolute bottom-1.5" />
              )}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
