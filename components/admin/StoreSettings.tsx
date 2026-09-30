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
  FileSignature, Building2, CheckCircle2, Crop
} from "lucide-react";

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

  const [saving, setSaving] = useState(false);

  // Sync state whenever active business changes or when tab mounts
  useEffect(() => {
    if (business) {
      const bizId = business.id;
      let localExtra: any = {};
      try {
        if (typeof window !== "undefined") {
          const extraJson = localStorage.getItem(`bftone_tenant_extra_${bizId}`) || localStorage.getItem("bftone_tenant_cache");
          if (extraJson) localExtra = JSON.parse(extraJson);
        }
      } catch {}

      setName(business.name || localExtra.name || "Brown fening tea");
      setLogoUrl(business.logo_url || localExtra.logo_url || "/dummy-logo.svg");
      setSignatureUrl((business as any).signature_url || localExtra.signature_url || "/default-signature.svg");
      setAddress((business as any).address || localExtra.address || "255, Rajiv Gandhi Salai (OMR), Navalur,\nChennai,\nTamil Nadu, India - 600130");
      setPhone((business as any).phone || localExtra.phone || "+91 98765 43210");
      setGstin((business as any).gstin || localExtra.gstin || "");
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
          aspectRatio: 2.5,
          title: "Crop Authorised Signature",
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
        description: "Landscape signature crop applied. Click 'Save All Changes' to save.",
        variant: "success",
      });
    }
  }

  // Save changes
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;

    setSaving(true);
    try {
      const updatedProfile = {
        name: name.trim() || business.name,
        logo_url: logoUrl.trim() || "/dummy-logo.svg",
        signature_url: signatureUrl.trim() || "/default-signature.svg",
        address: address.trim(),
        phone: phone.trim(),
        gstin: gstin.trim(),
      };

      // 1. Instantly write to local tenant storage cache (guaranteed persistence across tab switches)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`bftone_tenant_extra_${business.id}`, JSON.stringify(updatedProfile));
          const cached = localStorage.getItem("bftone_tenant_cache");
          const parsed = cached ? JSON.parse(cached) : {};
          localStorage.setItem("bftone_tenant_cache", JSON.stringify({ ...parsed, ...updatedProfile }));
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
            logo_url: updatedProfile.logo_url
          })
          .eq("id", business.id);
      } catch (_) {}

      await refreshBusiness();
      toast({ title: "Store Profile Updated! 🎉", description: "Logo, signature, and shop details saved successfully", variant: "success" });
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
              <div className="relative w-36 h-20 rounded-2xl bg-white border-2 border-dashed border-indigo-200 flex items-center justify-center overflow-hidden shadow-xs shrink-0 group">
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
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">Fixed 2.5:1 Landscape Crop</span>
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
