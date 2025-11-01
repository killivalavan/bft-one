"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { isWithinGeofence } from "@/lib/geofence";

export default function GeofenceGate({ children }:{children:React.ReactNode}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(()=>{
    (async ()=>{
      // TEMP: Testing bypass. Flip to false to restore geofence checks.
      const TEST_DISABLE = true;
      if (TEST_DISABLE) {
        setAllowed(true);
        return;
      }
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setAllowed(false); setReason("Not logged in"); return; }

      const { data: profile } = await supabaseClient
        .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();

      if (profile?.is_admin) { setAllowed(true); return; }

      if (!navigator.geolocation) { setAllowed(false); setReason("Location required"); return; }
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          const ok = isWithinGeofence(pos.coords.latitude, pos.coords.longitude);
          setAllowed(ok);
          if (!ok) setReason("You must be in shop to access");
        },
        ()=>{ setAllowed(false); setReason("Location denied"); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    })();
  },[]);

  if (allowed === null) {
    return <div className="p-6 text-center">Checking access…</div>;
  }
  if (!allowed) {
    return <div className="p-6 text-center text-red-600">{reason}</div>;
    }
  return <>{children}</>;
}
