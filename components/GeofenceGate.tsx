"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { isWithinGeofence } from "@/lib/geofence";
import { useTenant } from "@/lib/context/TenantContext";

export default function GeofenceGate({ children }:{children:React.ReactNode}) {
  const { business } = useTenant();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(()=>{
    (async ()=>{
      // If geofence is disabled for this tenant, permit access immediately
      if (business && business.geofence_enabled === false) {
        setAllowed(true);
        return;
      }

      // Testing bypass or development override
      const TEST_DISABLE = true;
      if (TEST_DISABLE) {
        setAllowed(true);
        return;
      }

      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setAllowed(false); setReason("Not logged in"); return; }

      const { data: profile } = await supabaseClient
        .from("profiles").select("is_admin, is_super_admin").eq("id", user.id).maybeSingle();

      if (profile?.is_admin || profile?.is_super_admin) { setAllowed(true); return; }

      if (!navigator.geolocation) { setAllowed(false); setReason("Location required"); return; }
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          const ok = isWithinGeofence(
            pos.coords.latitude,
            pos.coords.longitude,
            business?.geofence_lat,
            business?.geofence_lng,
            business?.geofence_radius_meters
          );
          setAllowed(ok);
          if (!ok) setReason(`You must be inside ${business?.name || "the shop"} to access`);
        },
        ()=>{ setAllowed(false); setReason("Location access denied. Please enable GPS permissions."); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    })();
  }, [business]);

  if (allowed === null) {
    return <div className="p-6 text-center text-zinc-500 text-sm">Checking access…</div>;
  }
  if (!allowed) {
    return <div className="p-6 text-center text-red-600 font-medium text-sm">{reason}</div>;
  }
  return <>{children}</>;
}
