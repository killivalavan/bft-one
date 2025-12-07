"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inTime, setInTime] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [emergency, setEmergency] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email || null);
      const { data: prof } = await supabaseClient.from('profiles').select('in_time,contact_number,emergency_contact_number').eq('id', user.id).maybeSingle();
      setInTime(prof?.in_time || "");
      setPhone(prof?.contact_number || "");
      setEmergency(prof?.emergency_contact_number || "");
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh] text-zinc-500 gap-2">
      <Loader2 className="animate-spin" /> Loading Profile...
    </div>
  );

  return (
    <div className="min-h-screen bg-white md:bg-zinc-50/50 pb-20">
      <div className="max-w-xl mx-auto md:py-8">
        <div className="bg-white rounded-2xl shadow-sm border-zinc-200 overflow-hidden md:border">
          <div className="p-4 border-b border-zinc-100 flex items-center gap-2 text-zinc-500 text-sm font-medium">
            <Link href="/" className="hover:text-sky-700 transition-colors flex items-center gap-1">
              <ChevronLeft size={16} /> Home
            </Link>
          </div>

          <ProfileHeader email={email} />
          <ProfileStats inTime={inTime} phone={phone} emergency={emergency} />
        </div>
      </div>
    </div>
  );
}
