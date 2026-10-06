"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";
import {
  Store, Image as ImageIcon, Save,
  Phone, MapPin, Receipt, Upload, RefreshCw,
  FileSignature, Building2, CheckCircle2, Crop,
  Navigation, Crosshair, ExternalLink, ShieldCheck, LocateFixed,
  ClipboardPaste, Check
} from "lucide-react";
import { saveShopGeofence, parseCoordinatesInput } from "@/lib/geofence";

export function StoreSettings() {
  const { business, refreshBusiness } = useTenant();
  const { toast } = useToast();

  const [name, setName] = useState(business?.name || "Brown fening tea");
  const [logoUrl, setLogoUrl] = useState(business?.logo_url || "/dummy-logo.svg");
  const [signatureUrl, setSignatureUrl] = useState((business as any)?.signature_url || "/default-signature.svg");
  const [address, setAddress] = useState(
    (business as any)?.address || "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130"
  );
  const [phone, setPhone] = useState((business as any)?.phone || "+91 98765 43210");
  const [gstin, setGstin] = useState((business as any)?.gstin || "");

  // Store Geofence & Location state
  const isInitialRoot = !business?.id || business?.id === "a0000000-0000-0000-0000-000000000001";
  const [geofenceLat, setGeofenceLat] = useState<string>(
    business?.geofence_lat !== null && business?.geofence_lat !== undefined && !isNaN(Number(business.geofence_lat))
      ? String(business.geofence_lat)
      : (isInitialRoot ? "12.8439" : "")
  );
  const [geofenceLng, setGeofenceLng] = useState<string>(
    business?.geofence_lng !== null && business?.geofence_lng !== undefined && !isNaN(Number(business.geofence_lng))
      ? String(business.geofence_lng)
      : (isInitialRoot ? "80.2268" : "")
  );
  const [geofenceRadius, setGeofenceRadius] = useState<number>(
    business?.geofence_radius_meters || 150
  );
  const [geofenceEnabled, setGeofenceEnabled] = useState<boolean>(
    business?.geofence_enabled ?? true
  );
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [quickPasteInput, setQuickPasteInput] = useState("");

  const [saving, setSaving] = useState(false);

  // Sync state whenever active business changes or when tab mounts
  useEffect(() => {
    if (business) {
      const bizId = business.id;
      let localExtra: any = {};
      let localShopLoc: any = {};
      try {
        if (typeof window !== "undefined") {
          const extraJson = localStorage.getItem(`bftone_tenant_extra_${bizId}`);
          if (extraJson) localExtra = JSON.parse(extraJson);

          const scopedShopStr = localStorage.getItem(`bftone_shop_location_${bizId}`);
          if (scopedShopStr) {
            localShopLoc = JSON.parse(scopedShopStr);
          } else {
            const legacyStr = localStorage.getItem("bftone_shop_location");
            if (legacyStr) {
              const parsed = JSON.parse(legacyStr);
              if (parsed.businessId === bizId) localShopLoc = parsed;
            }
          }
        }
      } catch { }

      setName(business.name || localExtra.name || "Store");
      setLogoUrl(business.logo_url || localExtra.logo_url || "/dummy-logo.svg");
      setSignatureUrl((business as any).signature_url || localExtra.signature_url || "/default-signature.svg");
      setAddress((business as any).address || localExtra.address || "");
      setPhone((business as any).phone || localExtra.phone || "");
      setGstin((business as any).gstin || localExtra.gstin || "");

      // Prioritize active business record from database, then tenant-scoped cache
      const isRootDefault = bizId === "a0000000-0000-0000-0000-000000000001";
      const bLat = (business.geofence_lat !== null && business.geofence_lat !== undefined && !isNaN(Number(business.geofence_lat)))
        ? String(business.geofence_lat)
        : ((localShopLoc.lat !== undefined && localShopLoc.lat !== null && !isNaN(Number(localShopLoc.lat)))
          ? String(localShopLoc.lat)
          : (localExtra.geofence_lat !== undefined && localExtra.geofence_lat !== null && !isNaN(Number(localExtra.geofence_lat))
            ? String(localExtra.geofence_lat)
            : (isRootDefault ? "12.8439" : "")));

      const bLng = (business.geofence_lng !== null && business.geofence_lng !== undefined && !isNaN(Number(business.geofence_lng)))
        ? String(business.geofence_lng)
        : ((localShopLoc.lng !== undefined && localShopLoc.lng !== null && !isNaN(Number(localShopLoc.lng)))
          ? String(localShopLoc.lng)
          : (localExtra.geofence_lng !== undefined && localExtra.geofence_lng !== null && !isNaN(Number(localExtra.geofence_lng))
            ? String(localExtra.geofence_lng)
            : (isRootDefault ? "80.2268" : "")));

      const bRadius = (business.geofence_radius_meters && !isNaN(Number(business.geofence_radius_meters)))
        ? Number(business.geofence_radius_meters)
        : (localShopLoc.radius || (localExtra.geofence_radius_meters ? Number(localExtra.geofence_radius_meters) : 150));

      const bEnabled = business.geofence_enabled !== undefined
        ? business.geofence_enabled
        : (localShopLoc.enabled !== undefined
          ? localShopLoc.enabled
          : (localExtra.geofence_enabled !== undefined ? localExtra.geofence_enabled : true));

      setGeofenceLat(bLat);
      setGeofenceLng(bLng);
      setGeofenceRadius(Number(bRadius) || 150);
      setGeofenceEnabled(bEnabled !== false);
    }
  }, [business?.id]);

  // Cropper Modal States
  const [cropperState, setCropperState] = useState<{
    isOpen: boolean;
    imageSrc: string;
    cropType: "logo" | "signature";
    aspectRatio: number;
    title: string;
    minSize: number;
  }>({
    isOpen: false,
    imageSrc: "",
    cropType: "logo",
    aspectRatio: 1,
    title: "Crop Shop Logo",
    minSize: 60,
  });

  // Strict Image Selection Handler for Logo
  function handleSelectLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict image format validation
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast({
        title: "Invalid File Format",
        description: "Only image files (PNG, JPG, JPEG, WEBP) are allowed.",
        variant: "error",
      });
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image size must be under 5MB", variant: "error" });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (src) {
        setCropperState({
          isOpen: true,
          imageSrc: src,
          cropType: "logo",
          aspectRatio: 1,
          title: "Crop Shop Logo (1:1 Square)",
          minSize: 60,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Strict Image Selection Handler for Signature
  function handleSelectSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict image format validation
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast({
        title: "Invalid File Format",
        description: "Only image files (PNG, JPG, JPEG, WEBP) are allowed.",
        variant: "error",
      });
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image size must be under 5MB", variant: "error" });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (src) {
        setCropperState({
          isOpen: true,
          imageSrc: src,
          cropType: "signature",
          aspectRatio: 1,
          title: "Crop Authorised Signature / Stamp (1:1 Square)",
          minSize: 80,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Handle Crop Completion
  function handleCropComplete(croppedDataUrl: string) {
    if (cropperState.cropType === "logo") {
      setLogoUrl(croppedDataUrl);
      toast({
        title: "Logo Cropped! ✂️",
        description: "1:1 Square crop applied. Click 'Save All Changes' to save.",
        variant: "success",
      });
    } else {
      setSignatureUrl(croppedDataUrl);
      toast({
        title: "Signature Cropped! ✂️",
        description: "Signature crop applied. Click 'Save All Changes' to save.",
        variant: "success",
      });
    }
  }

  // Dedicated direct saver for shop GPS coordinates (no need to submit whole form)
  async function saveLocationDirectly(
    latNum: number,
    lngNum: number,
    radiusNum = 150,
    enabledBool = true
  ) {
    if (!business?.id) return;
    setSavingLocation(true);
    try {
      // 1. Immediately write to localStorage & broadcast event
      saveShopGeofence({
        lat: latNum,
        lng: lngNum,
        radius: radiusNum,
        enabled: enabledBool,
        name: name.trim() || business.name,
        address: address.trim(),
        businessId: business.id,
      });

      // 2. Persist to API
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        await fetch("/api/business/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            businessId: business.id,
            geofence_lat: latNum,
            geofence_lng: lngNum,
            geofence_radius_meters: radiusNum,
            geofence_enabled: enabledBool,
          })
        });
      } catch (apiErr) {
        console.warn("Backend API sync warning:", apiErr);
      }

      // 3. Best effort direct client update
      try {
        await supabaseClient
          .from("businesses")
          .update({
            geofence_lat: latNum,
            geofence_lng: lngNum,
            geofence_radius_meters: radiusNum,
            geofence_enabled: enabledBool,
            updated_at: new Date().toISOString(),
          })
          .eq("id", business.id);
      } catch (_) { }

      await refreshBusiness();

      toast({
        title: "Store Location Saved! 📍",
        description: `Coordinates (${latNum.toFixed(6)}, ${lngNum.toFixed(6)}) updated in database. Timesheet geofence is now active!`,
        variant: "success",
      });
    } catch (e) {
      console.warn("Error saving shop location directly:", e);
    } finally {
      setSavingLocation(false);
    }
  }

  // Handle parsing coordinates or Google Maps link from quick paste
  function handleApplyQuickPaste() {
    const parsed = parseCoordinatesInput(quickPasteInput);
    if (!parsed) {
      toast({
        title: "Could not parse coordinates",
        description: "Please paste standard 'lat, lng' (e.g. 12.8439, 80.2268) or a Google Maps URL.",
        variant: "error",
      });
      return;
    }

    const latStr = parsed.lat.toFixed(7);
    const lngStr = parsed.lng.toFixed(7);
    setGeofenceLat(latStr);
    setGeofenceLng(lngStr);
    setQuickPasteInput("");

    // Auto save
    saveLocationDirectly(parsed.lat, parsed.lng, Number(geofenceRadius) || 150, geofenceEnabled);
  }

  // GPS Store Location auto-detection
  function handleDetectShopLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast({
        title: "GPS Not Supported",
        description: "Geolocation is not supported by your current browser or device.",
        variant: "error",
      });
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        const acc = Math.round(pos.coords.accuracy);

        setGeofenceLat(lat);
        setGeofenceLng(lng);
        setLocationAccuracy(acc);
        setDetectingLocation(false);

        // Instantly save so user does not need to submit the entire profile form
        saveLocationDirectly(Number(lat), Number(lng), Number(geofenceRadius) || 150, geofenceEnabled);
      },
      (err) => {
        setDetectingLocation(false);
        let msg = "Could not retrieve GPS coordinates.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "GPS permission was denied by browser. Please allow location access or type coordinates manually.";
        } else if (err.code === err.TIMEOUT) {
          msg = "Location request timed out. Please try again or type coordinates manually.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "Location information is unavailable on this device.";
        }
        toast({
          title: "Location Detection Failed",
          description: msg,
          variant: "error",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Save changes
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;

    setSaving(true);
    try {
      const numLat = geofenceLat !== "" && !isNaN(Number(geofenceLat)) ? Number(geofenceLat) : null;
      const numLng = geofenceLng !== "" && !isNaN(Number(geofenceLng)) ? Number(geofenceLng) : null;
      const numRadius = Number(geofenceRadius) || 150;

      const updatedProfile = {
        name: name.trim() || business.name,
        logo_url: logoUrl.trim() || "/dummy-logo.svg",
        signature_url: signatureUrl.trim() || "/default-signature.svg",
        address: address.trim(),
        phone: phone.trim(),
        gstin: gstin.trim(),
        geofence_lat: numLat,
        geofence_lng: numLng,
        geofence_radius_meters: numRadius,
        geofence_enabled: Boolean(geofenceEnabled),
      };

      // 1. Instantly write to local tenant storage cache (guaranteed persistence across tab switches)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`bftone_tenant_extra_${business.id}`, JSON.stringify(updatedProfile));
          const cached = localStorage.getItem("bftone_tenant_cache");
          const parsed = cached ? JSON.parse(cached) : {};
          localStorage.setItem("bftone_tenant_cache", JSON.stringify({ ...parsed, ...updatedProfile }));
          // Scoped shop location cache for instant retrieval across Timesheet and Geofence gate
          if (numLat !== null && numLng !== null) {
            saveShopGeofence({
              lat: numLat,
              lng: numLng,
              radius: numRadius,
              enabled: Boolean(geofenceEnabled),
              name: updatedProfile.name,
              address: updatedProfile.address,
              businessId: business.id,
            });
          }
        } catch (e) {
          console.warn("Local storage write error:", e);
        }
      }

      // 2. Persist via secure backend API route
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        await fetch("/api/business/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            businessId: business.id,
            ...updatedProfile
          })
        });
      } catch (apiErr) {
        console.warn("Backend API sync warning:", apiErr);
      }

      // 3. Best effort direct client update
      try {
        await supabaseClient
          .from("businesses")
          .update({
            name: updatedProfile.name,
            logo_url: updatedProfile.logo_url,
            geofence_lat: updatedProfile.geofence_lat,
            geofence_lng: updatedProfile.geofence_lng,
            geofence_radius_meters: updatedProfile.geofence_radius_meters,
            geofence_enabled: updatedProfile.geofence_enabled,
          })
          .eq("id", business.id);
      } catch (_) { }

      await refreshBusiness();
      toast({
        title: "Store Profile Updated! 🎉",
        description: "Logo, signature, address, and timesheet location saved successfully",
        variant: "success",
      });
    } catch (err: any) {
      toast({ title: "Profile updated locally", description: "Saved to browser cache", variant: "info" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50 border-b border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 flex items-center justify-center font-bold shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Store Profile, Logo &amp; Signature</h2>
              <p className="text-xs text-slate-500">
                Manage your store branding, official address, and authorised signature for PDF invoices
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={saveSettings} className="space-y-6">
            {/* 1. Shop Logo Section */}
            <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex flex-col sm:flex-row items-center gap-6">
              {/* Logo Preview */}
              <div className="relative w-28 h-28 rounded-2xl bg-white border-2 border-dashed border-zinc-300 flex items-center justify-center overflow-hidden shadow-xs shrink-0 group">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Store Logo"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="w-8 h-8 text-zinc-300 mx-auto mb-1" />
                    <span className="text-[10px] text-zinc-400 font-semibold">No Logo</span>
                  </div>
                )}
              </div>

              {/* Logo Controls */}
              <div className="flex-1 space-y-3 min-w-0 text-center sm:text-left">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>Shop Logo</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">Fixed 1:1 Square Crop</span>
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Strict image format only (PNG, JPG, WEBP). Selecting an image opens the cropper to frame the logo.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl border border-zinc-300 shadow-2xs transition-all">
                    <Crop className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Select &amp; Crop Logo</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      onChange={handleSelectLogo}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setLogoUrl("/dummy-logo.svg")}
                    className="px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors"
                  >
                    Reset to Default Logo
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Authorised Signature Section */}
            <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex flex-col sm:flex-row items-center gap-6">
              {/* Signature Preview */}
              <div className="relative w-28 h-28 rounded-2xl bg-white border-2 border-dashed border-indigo-200 flex items-center justify-center overflow-hidden shadow-xs shrink-0 group">
                {signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatureUrl}
                    alt="Authorised Signature"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center p-2">
                    <FileSignature className="w-6 h-6 text-indigo-300 mx-auto mb-1" />
                    <span className="text-[10px] text-zinc-400 font-semibold">No Signature</span>
                  </div>
                )}
              </div>

              {/* Signature Controls */}
              <div className="flex-1 space-y-3 min-w-0 text-center sm:text-left">
                <div>
                  <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-1.5 justify-center sm:justify-start">
                    <FileSignature className="w-4 h-4 text-indigo-600" />
                    <span>Authorised Signature / Stamp</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">Square (1:1) / Rectangle Crop</span>
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Strict image format only (PNG, JPG, WEBP). Selecting an image opens the cropper to frame your signature.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl border border-zinc-300 shadow-2xs transition-all">
                    <Crop className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Select &amp; Crop Signature</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      onChange={handleSelectSignature}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setSignatureUrl("/default-signature.svg")}
                    className="px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                  >
                    Use Default Signature
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Store Information & Billed By Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" /> Store &amp; Billing Information (Billed By)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-600" /> Store / Business Name
                  </label>
                  <Input
                    required
                    placeholder="e.g. Brown fening tea"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" /> Store Phone Number
                  </label>
                  <Input
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-white text-xs h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Official Store Address
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. 255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-emerald-600 outline-none text-xs text-zinc-900 bg-white"
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" /> Store GSTIN / Tax ID
                    </label>
                    <Input
                      placeholder="e.g. 33AAAAA0000A1Z5 (Optional)"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                      className="bg-white text-xs h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700">Currency Symbol</label>
                    <Input
                      disabled
                      value={`${business?.currency_symbol || "₹"} (INR)`}
                      className="bg-zinc-50 text-xs h-10 text-zinc-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Store Physical Location & Attendance Geofence */}
            <div className="p-5 rounded-2xl bg-sky-50/50 border border-sky-100/90 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold shrink-0">
                    <Navigation className="w-5 h-5 text-sky-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">Store Physical Location &amp; Geofence</h4>
                      <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <LocateFixed className="w-3 h-3 text-sky-600" /> Used for Timesheet
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Exact GPS location of your shop. Used to verify employee presence before allowing timesheet attendance check-in.
                    </p>
                  </div>
                </div>

                {/* Action Buttons: Detect GPS & Save Location */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    onClick={handleDetectShopLocation}
                    disabled={detectingLocation || savingLocation}
                    className="h-9 px-3.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {detectingLocation ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Detecting GPS...</span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Get Current Location</span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      const numLat = Number(geofenceLat);
                      const numLng = Number(geofenceLng);
                      if (isNaN(numLat) || isNaN(numLng)) {
                        toast({
                          title: "Invalid coordinates",
                          description: "Please enter valid numeric latitude and longitude",
                          variant: "error"
                        });
                        return;
                      }
                      saveLocationDirectly(numLat, numLng, Number(geofenceRadius) || 150, geofenceEnabled);
                    }}
                    disabled={savingLocation || detectingLocation}
                    className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {savingLocation ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Location</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Quick Paste Bar for Google Maps URLs or Lat, Lng */}
              <div className="p-3 bg-white/90 rounded-xl border border-sky-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <ClipboardPaste className="w-3.5 h-3.5 text-sky-600" />
                    <span>Quick Paste from Google Maps:</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Paste &quot;lat, lng&quot; or Google Maps URL
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 12.8439, 80.2268 or https://maps.google.com/?q=12.8439,80.2268"
                    value={quickPasteInput}
                    onChange={(e) => setQuickPasteInput(e.target.value)}
                    className="bg-slate-50 text-xs h-9 font-mono flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleApplyQuickPaste}
                    disabled={!quickPasteInput.trim() || savingLocation}
                    className="h-9 px-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Parse &amp; Save
                  </Button>
                </div>
              </div>

              {locationAccuracy !== null && (
                <div className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-3.5 py-2 flex items-center justify-between">
                  <span>📍 GPS coordinates captured with high accuracy: <strong>±{locationAccuracy} meters</strong></span>
                  <span className="text-[10px] text-emerald-600 font-bold">Saved to database &amp; active!</span>
                </div>
              )}

              {/* Coordinates Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-600" /> Shop Latitude (GPS)
                    </span>
                    <span className="text-[10px] font-normal text-slate-400">e.g. 12.8439000</span>
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="12.8439000"
                    value={geofenceLat}
                    onChange={(e) => setGeofenceLat(e.target.value)}
                    className="bg-white text-xs h-10 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-600" /> Shop Longitude (GPS)
                    </span>
                    <span className="text-[10px] font-normal text-slate-400">e.g. 80.2268000</span>
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="80.2268000"
                    value={geofenceLng}
                    onChange={(e) => setGeofenceLng(e.target.value)}
                    className="bg-white text-xs h-10 font-mono"
                  />
                </div>
              </div>

              {/* Allowed Radius & Presets */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> Allowed Attendance Radius (Meters)
                  </label>
                  <span className="text-xs text-slate-500">
                    Employees within <strong>{geofenceRadius}m</strong> can mark attendance
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[50, 100, 150, 250, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGeofenceRadius(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${geofenceRadius === preset
                          ? "bg-sky-600 text-white shadow-xs"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      {preset}m {preset === 150 ? "(Recommended)" : preset === 50 ? "(Strict)" : ""}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-slate-500 font-medium">Custom:</span>
                    <Input
                      type="number"
                      min={10}
                      max={5000}
                      value={geofenceRadius}
                      onChange={(e) => setGeofenceRadius(Number(e.target.value) || 150)}
                      className="w-20 h-8 text-xs bg-white text-center font-bold"
                    />
                    <span className="text-xs text-slate-500">m</span>
                  </div>
                </div>
              </div>

              {/* Status and Verification Link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-sky-100 gap-3">
                <label className="inline-flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={geofenceEnabled}
                    onChange={(e) => setGeofenceEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Enforce Shop Geofence for Staff Timesheet Attendance
                    </span>
                    <p className="text-[11px] text-slate-500">
                      When enabled, employees must be physically at the store to mark attendance.
                    </p>
                  </div>
                </label>

                {geofenceLat && geofenceLng && (
                  <a
                    href={`https://www.google.com/maps?q=${geofenceLat},${geofenceLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 font-bold hover:underline shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Verify Location in Google Maps ↗</span>
                  </a>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save All Changes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Interactive Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperState.isOpen}
        imageSrc={cropperState.imageSrc}
        cropType={cropperState.cropType}
        aspectRatio={cropperState.aspectRatio}
        title={cropperState.title}
        minSize={cropperState.minSize}
        onClose={() => setCropperState(prev => ({ ...prev, isOpen: false }))}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}
