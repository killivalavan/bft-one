"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, MailCheck, ShieldAlert } from "lucide-react";

export default function EmailPreferencesPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [offers, setOffers] = useState(false);
  const [features, setFeatures] = useState(false);
  const [announcements, setAnnouncements] = useState(false);
  const [unsubscribedAll, setUnsubscribedAll] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") || "";
    setToken(t);
    if (!t) {
      setError("Missing preference token. Please open this page from your CounterCub email footer or Store Admin settings.");
      setLoading(false);
      return;
    }

    fetch(`/api/marketing/preferences?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const p = data.preferences || {};
        setContactEmail(p.contact_email || "");
        setOffers(Boolean(p.offers_opted_in));
        setFeatures(Boolean(p.features_opted_in));
        setAnnouncements(Boolean(p.announcements_opted_in));
        setUnsubscribedAll(Boolean(p.unsubscribed_all));
      })
      .catch(() => setError("Failed to load email preferences."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(unsubscribeEverything = false) {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/marketing/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          offersOptedIn: unsubscribeEverything ? false : offers,
          featuresOptedIn: unsubscribeEverything ? false : features,
          announcementsOptedIn: unsubscribeEverything ? false : announcements,
          unsubscribedAll: unsubscribeEverything,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to update preferences.");
        return;
      }
      setUnsubscribedAll(Boolean(data.preferences?.unsubscribed_all));
      if (unsubscribeEverything) {
        setOffers(false);
        setFeatures(false);
        setAnnouncements(false);
      }
      setSavedMsg("Your CounterCub marketing email preferences have been updated.");
    } catch {
      setError("Network error while saving preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <MailCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Email Preferences</h1>
            <p className="text-xs text-slate-500">
              {contactEmail ? `Managing marketing preferences for ${contactEmail}` : "CounterCub Marketing Consent"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <Loader2 size={16} className="animate-spin" /> Loading preferences...
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Choose which optional updates you want to receive. Mandatory account security, billing, and subscription notifications are unaffected.
            </p>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={offers}
                onChange={(e) => {
                  setOffers(e.target.checked);
                  if (e.target.checked) setUnsubscribedAll(false);
                }}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">Special offers &amp; discounts</div>
                <div className="text-xs text-slate-500">Upgrade promotions, renewal discounts, and seasonal offers.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={features}
                onChange={(e) => {
                  setFeatures(e.target.checked);
                  if (e.target.checked) setUnsubscribedAll(false);
                }}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">New features &amp; product updates</div>
                <div className="text-xs text-slate-500">Release notes, POS/B2B capabilities, and workflow tips.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={announcements}
                onChange={(e) => {
                  setAnnouncements(e.target.checked);
                  if (e.target.checked) setUnsubscribedAll(false);
                }}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">Product announcements &amp; newsletters</div>
                <div className="text-xs text-slate-500">General CounterCub news and platform highlights.</div>
              </div>
            </label>

            {savedMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
                <CheckCircle size={15} /> {savedMsg}
              </div>
            )}

            {unsubscribedAll && (
              <div className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                You are currently unsubscribed from all optional marketing emails.
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                Unsubscribe from All Marketing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

