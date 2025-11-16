// src/components/OrgSettings.tsx
import { useEffect, useState } from "react";
import {
  getOrgSettings,
  updateOrgSettings,
  uploadPaymentQr,
  type OrgSettings,
} from "../lib/api";

const CURRENCIES = ["AED", "INR"] as const;

export default function OrgSettings() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // 🔹 NEW: local preview URL so we can show the chosen file instantly
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getOrgSettings();
        // API returns { ok: true, ... } – unwrap if needed
        const s = (data as any)?.ok ? (data as any) : data;
        setSettings(s as OrgSettings);
      } catch (e: any) {
        console.error("[OrgSettings] load error", e);
        setError(e?.message || "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const updated = await updateOrgSettings({
        payment_enabled: settings.payment_enabled,
        payment_qr_url: settings.payment_qr_url ?? null,
        payment_instructions: settings.payment_instructions ?? null,
        default_currency: settings.default_currency ?? null,
      });
      const s = (updated as any)?.ok ? (updated as any) : updated;
      setSettings(s as OrgSettings);
      setOkMsg("Saved successfully.");
    } catch (e: any) {
      console.error("[OrgSettings] save error", e);
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    setUploading(true);
    setError(null);
    setOkMsg(null);

    // 🔹 Show instant local preview
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });

    try {
      const { url } = await uploadPaymentQr(file);
      // After backend upload, switch to the real hosted URL
      setSettings({ ...settings, payment_qr_url: url });
      setOkMsg("QR uploaded.");
      // we can now discard the local blob if you want:
      setLocalPreviewUrl(null);
    } catch (err: any) {
      console.error("[OrgSettings] upload error", err);
      setError(err?.message || "Failed to upload QR");
    } finally {
      setUploading(false);
      // reset input so same file can be selected again if needed
      e.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        Loading settings…
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-red-500">
        Failed to load settings.
      </div>
    );
  }

  const currency = settings.default_currency || "AED";

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Store Settings
          </h1>
          <p className="text-xs text-slate-500">
            Configure payments, QR code and currency for this WhatsApp store.
          </p>
        </div>
      </div>

      {(error || okMsg) && (
        <div className="text-xs">
          {error && <div className="text-red-600 mb-1">{error}</div>}
          {okMsg && <div className="text-emerald-600">{okMsg}</div>}
        </div>
      )}

      {/* Card: Payment toggle + currency */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-900">
              WhatsApp QR payments
            </div>
            <div className="text-xs text-slate-500">
              When enabled, you can send a payment QR from an order.
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setSettings((s) =>
                s ? { ...s, payment_enabled: !s.payment_enabled } : s
              )
            }
            className={
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border " +
              (settings.payment_enabled
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-slate-50 text-slate-500")
            }
          >
            {settings.payment_enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Default currency
          </label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
            value={currency}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, default_currency: e.target.value } : s
              )
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            Used when sending payment total in WhatsApp (e.g. 125 {currency}).
          </p>
        </div>
      </div>

      {/* Card: QR upload */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-900">
            Payment QR code
          </div>
          <div className="text-xs text-slate-500 mb-3">
            Upload your UPI / bank QR. Customers will receive this image when
            you send a payment request from an order.
          </div>

          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
          />

          <p className="mt-1 text-[11px] text-slate-400">
            PNG or JPG, up to a few MB. Make sure it is clearly scannable.
          </p>
        </div>

        <div className="mt-3 md:mt-0 md:w-40 flex flex-col items-center gap-2">
          <div className="text-[11px] text-slate-500 mb-1">
            Current QR preview
          </div>
          <div className="h-32 w-32 overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
            {localPreviewUrl || settings.payment_qr_url ? (
              <img
                src={localPreviewUrl || settings.payment_qr_url || undefined}
                alt="Payment QR"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-slate-400 text-center px-2">
                No QR uploaded
              </span>
            )}
          </div>
          {(localPreviewUrl || settings.payment_qr_url) && (
            <a
              href={localPreviewUrl || settings.payment_qr_url || undefined}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-slate-500 underline"
            >
              Open full image
            </a>
          )}
        </div>
      </div>

      {/* Card: Payment instructions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-slate-900">
          Payment instructions (optional)
        </div>
        <div className="text-xs text-slate-500 mb-2">
          Shown above the QR in WhatsApp, for example: bank name, UPI ID, or
          “Please send screenshot after payment”.
        </div>
        <textarea
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs min-h-[80px]"
          value={settings.payment_instructions || ""}
          onChange={(e) =>
            setSettings((s) =>
              s ? { ...s, payment_instructions: e.target.value } : s
            )
          }
          placeholder="e.g. UPI: 98765@upi • Account name: House of Eon"
        />
      </div>

      <div className="mt-auto pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}