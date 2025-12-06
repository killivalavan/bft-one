"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import { CalendarCheck2, Coffee, ClipboardList, Home, Shield, ChevronLeft } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const { flags } = useProfile();

  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Show cached email immediately
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
      // Only clear/redirect if we are sure we are not loading.
      setUserEmail(undefined);
      try { localStorage.removeItem('bftone_display_email'); } catch { }

      if (pathname !== "/login") {
        try { router.replace("/login"); } catch { }
      }
    }
  }, [user, loading, pathname, router]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const allLinks = [
    { href: "/", label: "Home", icon: <Home size={18} /> },
    { href: "/timesheet", label: "Timesheet", icon: <CalendarCheck2 size={18} /> },
    { href: "/billing", label: "Billing", icon: <Coffee size={18} /> },
    { href: "/pending", label: "Pending Orders", icon: <ClipboardList size={18} /> },
    { href: "/admin", label: "Admin", icon: <Shield size={18} /> },
  ];

  let links = allLinks;
  if (pathname.startsWith("/billing")) {
    links = allLinks.filter(l => ["/", "/billing", "/pending"].includes(l.href));
  }
  if (!flags?.isAdmin) {
    links = links.filter(l => l.href !== "/admin");
  }

  const displayName = userEmail ? (userEmail.split("@")[0] || userEmail) : undefined;

  if (pathname === "/") {
    return (
      <nav className="sticky top-0 z-50 border-b bg-sky-600">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg text-white">BFTOne</Link>
          {displayName ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(v => !v)} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-800 text-sm">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-[11px] font-semibold inline-flex items-center justify-center">{displayName.slice(0, 1).toUpperCase()}</span>
                <span className="truncate max-w-[140px]">{displayName}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-lg border bg-white shadow focus:outline-none">
                  <Link href={flags?.isAdmin ? '/admin' : '/profile'} className="block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50">Profile</Link>
                  <button onClick={async () => { await supabaseClient.auth.signOut(); setMenuOpen(false); location.href = '/login' }} className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50">Logout</button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-sm">Login</Link>
          )}
        </div>
      </nav>
    );
  }

  // Special centered navbar on billing and pending routes
  if (pathname.startsWith("/billing") || pathname.startsWith("/pending")) {
    let links = allLinks.filter(l => ["/billing", "/pending"].includes(l.href));
    return (
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center">
          <Link href="/" className={`mr-2 p-1.5 rounded-lg border ${pathname === '/' ? 'bg-sky-600 text-white' : 'text-zinc-800'}`} aria-label="Home">
            <Home size={18} />
          </Link>
          <div className="flex-1 flex justify-center gap-2 text-sm">
            {links.map(l => (
              <Link key={l.href} href={l.href}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${pathname === l.href ? 'bg-sky-600 text-white' : 'text-zinc-800 border'}`}>
                {l.icon}{l.label}
              </Link>
            ))}
          </div>
        </div>
        {/* Mobile bottom nav */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 border-t bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-md grid grid-cols-3 text-[13px]">
            {[{ href: "/", label: "Home", icon: <Home size={18} /> }, ...links].map(l => (
              <Link key={l.href} href={l.href}
                className={`flex flex-col items-center justify-center py-2 ${pathname === l.href ? 'text-sky-700 font-medium' : 'text-zinc-600'}`}>
                <span className="mb-0.5">{l.icon}</span>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg text-sky-700">BFTOne</Link>
        {displayName ? (
          <div className="hidden sm:block relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-800 text-sm">
              <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-[11px] font-semibold inline-flex items-center justify-center">{displayName.slice(0, 1).toUpperCase()}</span>
              <span className="truncate max-w-[160px]">{displayName}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border bg-white shadow focus:outline-none">
                {!flags?.isAdmin && (<Link href={'/profile'} className="block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50">Profile</Link>)}
                <button onClick={async () => { await supabaseClient.auth.signOut(); setMenuOpen(false); location.href = '/' }} className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50">Logout</button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="hidden sm:inline-flex px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-sm">Login</Link>
        )}
      </div>
    </nav>
  );
}
