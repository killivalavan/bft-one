"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export default function ProfilePage(){
  const { toast } = useToast();
  const [email,setEmail] = useState<string>("");
  const [loading,setLoading] = useState(true);
  const [inTime,setInTime] = useState<string>("");
  const [phone,setPhone] = useState<string>("");
  const [emergency,setEmergency] = useState<string>("");

  useEffect(()=>{
    (async()=>{
      const { data:{ user } } = await supabaseClient.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email || "");
      const { data: prof } = await supabaseClient.from('profiles').select('in_time,contact_number,emergency_contact_number').eq('id', user.id).maybeSingle();
      setInTime(prof?.in_time || "");
      setPhone(prof?.contact_number || "");
      setEmergency(prof?.emergency_contact_number || "");
      setLoading(false);
    })();
  },[]);

  // read-only page; no password or logout here per request

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="grid gap-3">
      <h1 className="text-xl md:text-2xl font-semibold text-zinc-900">Profile</h1>
      <Card>
        <CardContent className="p-3 grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] text-zinc-600">Email</div>
              <div className="text-sm font-medium text-zinc-900">{email || "-"}</div>
            </div>
            <div>
              <div className="text-[12px] text-zinc-600">In time</div>
              <div className="text-sm font-medium text-zinc-900">{inTime || '-'}</div>
            </div>
            <div>
              <div className="text-[12px] text-zinc-600">Phone</div>
              <div className="text-sm font-medium text-zinc-900">{phone || '-'}</div>
            </div>
            <div>
              <div className="text-[12px] text-zinc-600">Emergency contact</div>
              <div className="text-sm font-medium text-zinc-900">{emergency || '-'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
