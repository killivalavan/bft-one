"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn } from "@/lib/utils/cn";
import {
  Home, CalendarCheck2, Coffee, ClipboardList, Shield,
  Menu, User, LogOut, ChevronDown, Bell
} from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const { flags } = useProfile();

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

  // Click Outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Hide on login
  if (pathname === "/login") return null;

  const displayName = userEmail ? (userEmail.split("@")[0]) : null;
  const initial = displayName ? displayName[0].toUpperCase() : "?";

  // Standard Links
  const allLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/timesheet", label: "Timesheet", icon: CalendarCheck2 },
    { href: "/billing", label: "Billing", icon: Coffee },
    { href: "/pending", label: "Pending", icon: ClipboardList },
    ...(flags?.isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  // Focus Mode Links (Billing & Pending)
  const focusLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/pending", label: "Pending", icon: ClipboardList },
    { href: "/billing", label: "Billing", icon: Coffee },
  ];

  const isFocusMode = pathname.startsWith("/billing") || pathname.startsWith("/pending");
  const visibleLinks = isFocusMode ? focusLinks : allLinks;

  async function handleLogout() {
    await supabaseClient.auth.signOut();
    setMenuOpen(false);
    location.href = '/login';
  }

  return (
    <>
      <nav className={cn(
        "sticky top-0 z-50 transition-all duration-300 shadow-md",
        "bg-sky-600 border-b border-sky-700"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn("flex items-center h-16", isFocusMode ? "justify-center" : "justify-between")}>
            {/* Logo - Hide in Focus Mode */}
            {!isFocusMode && (
              <div className="flex-shrink-0 flex items-center gap-2">
                <Link href="/" className="flex items-center gap-2 group">
                  <span className="font-bold text-xl tracking-tight text-white group-hover:text-sky-50 transition-colors">
                    BFTOne
                  </span>
                </Link>
              </div>
            )}

            {/* Desktop Nav (Standard) OR Focus Mode Nav (Always top) */}
            <div className={cn("flex items-center space-x-2", !isFocusMode && "hidden md:flex")}>
              {visibleLinks.map(l => {
                const isActive = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-200",
                      isActive
                        ? "bg-white/20 text-white shadow-sm ring-1 ring-white/30"
                        : "text-sky-100 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <l.icon size={16} className={isActive ? "text-white" : "text-sky-200 group-hover:text-white"} />
                    <span className={cn(isFocusMode ? "inline" : "")}>{l.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Right Side / User Menu - Hide in Focus Mode */}
            {!isFocusMode && (
              <div className="flex-shrink-0 flex items-center gap-4">
                <Link href="/notifications" className="relative p-2 text-sky-100 hover:text-white transition-colors">
                  <Bell size={20} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-sky-600"></span>
                </Link>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 p-1 pl-2 rounded-full border border-sky-500 bg-sky-700/50 hover:bg-sky-700 transition-all focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    <span className="text-sm font-medium text-white max-w-[100px] truncate hidden sm:block">
                      {displayName || 'Guest'}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-white text-sky-700 flex items-center justify-center text-xs font-bold shadow-sm">
                      {initial}
                    </div>
                    <ChevronDown size={14} className="text-sky-200 mr-2 sm:hidden" />
                  </button>

                  {/* Dropdown */}
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 py-1 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                      <div className="px-4 py-3 border-b border-zinc-100 sm:hidden">
                        <p className="text-sm font-medium text-zinc-900">{displayName}</p>
                        <p className="text-xs text-zinc-500 truncate">{userEmail}</p>
                      </div>
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <User size={16} className="text-zinc-400" /> Profile
                      </Link>
                      {!flags?.isAdmin && (
                        <Link
                          href="/mysalary"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          <Coffee size={16} className="text-zinc-400" /> My Salary
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Nav - Only show if NOT in focus mode */}
      {!isFocusMode && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] safe-area-pb">
          <div className="flex items-center justify-around h-16 px-2">
            {allLinks.slice(0, 4).map(l => {
              const isActive = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-sky-600" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-xl transition-all",
                    isActive ? "bg-sky-50" : "bg-transparent"
                  )}>
                    <l.icon size={20} className={isActive ? "fill-current" : "stroke-current"} />
                  </div>
                  <span className="text-[10px] font-medium">{l.label}</span>
                </Link>
              );
            })}
            <Link
              href="/profile"
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                pathname === '/profile' ? "text-sky-600" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all",
                pathname === '/profile' ? "bg-sky-50" : "bg-transparent"
              )}>
                <User size={20} />
              </div>
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
