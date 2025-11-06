// src/components/QuickReplyPrice.tsx
import React, { useMemo, useState } from "react";

type Props = {
  /** Customer phone number (any format; digits are extracted) */
  phone: string | null | undefined;
  /** Optional display name to personalize the message */
  customerName?: string | null;
  /** First item name to mention in the message (e.g., "Tomato", "Milk 1L") */
  defaultItem?: string | null;
  /** Pre-filled price (string to allow quick edits like "5.50") */
  defaultPrice?: string | null;
  /** Currency prefix shown in the UI only (not forced in text) */
  currency?: string; // e.g., "AED", default: "AED"
  /** Optional container className for layout control */
  className?: string;
};

/** Minimal WA Web/Desktop deep link */
function buildWAWebLink(phoneLike: string, text: string) {
  const digits = String(phoneLike || "").replace(/[^\d]/g, ""); // keep only digits
  const enc = encodeURIComponent(text || "");
  return `https://web.whatsapp.com/send?phone=${digits}&text=${enc}`;
}

/** Sanitize and compact spaces */
function tidy(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

const QuickReplyPrice: React.FC<Props> = ({
  phone,
  customerName,
  defaultItem,
  defaultPrice,
  currency = "AED",
  className,
}) => {
  const [price, setPrice] = useState<string>(defaultPrice || "");
  const [unit, setUnit] = useState<string>(""); // e.g., "per kg", "per pack"

  const hasPhone = !!(phone && String(phone).trim());
  const itemLabel = tidy(String(defaultItem || ""));
  const firstName = customerName ? ` ${customerName}` : "";

  const preview = useMemo(() => {
    const pricePart = price ? `${price}` : "____";
    const unitPart = unit ? ` (${unit})` : "";
    const line1 = tidy(`Hi${firstName},`);
    const line2 = itemLabel
      ? tidy(`${itemLabel} – current price is ${pricePart}${unitPart}.`)
      : tidy(`Here’s the price you asked for: ${pricePart}${unitPart}.`);
    const line3 = `Let me know if you’d like to place an order.`;
    return `${line1}\n${line2}\n${line3}`;
  }, [price, unit, firstName, itemLabel]);

  const openWA = () => {
    if (!hasPhone) return;
    try {
      const link = buildWAWebLink(String(phone), preview);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      alert("Could not open WhatsApp. Please try again.");
    }
  };

  return (
    <div className={["rounded-xl border border-purple-200 bg-purple-50 p-3", className || ""].join(" ")}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold text-purple-900">Quick Reply · Price</div>
        {!hasPhone && (
          <span className="text-[11px] text-purple-700" title="Customer phone required to open WhatsApp">
            Phone missing
          </span>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="block text-[11px] text-purple-800 mb-0.5">Item</label>
          <input
            className="w-full rounded-md border border-purple-200 bg-white px-2 py-1 text-sm"
            value={itemLabel}
            readOnly
            placeholder="Item"
          />
        </div>

        <div className="md:col-span-1">
          <label className="block text-[11px] text-purple-800 mb-0.5">Price ({currency})</label>
          <input
            inputMode="decimal"
            className="w-full rounded-md border border-purple-200 bg-white px-2 py-1 text-sm"
            placeholder="e.g., 5.50"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[11px] text-purple-800 mb-0.5">Unit (optional)</label>
          <input
            className="w-full rounded-md border border-purple-200 bg-white px-2 py-1 text-sm"
            placeholder="e.g., per kg / per pack"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
      </div>

      {/* Preview */}
      <div className="mt-2 rounded-md border border-purple-200 bg-white p-2 text-[12px] text-purple-900 whitespace-pre-wrap">
        {preview}
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          className="rounded-md border border-purple-300 bg-white px-2 py-1 text-[12px] text-purple-800 hover:bg-purple-100"
          onClick={() => {
            navigator.clipboard
              .writeText(preview)
              .then(() => alert("Reply text copied."))
              .catch(() => alert("Could not copy."));
          }}
        >
          Copy text
        </button>
        <button
          onClick={openWA}
          disabled={!hasPhone}
          className="rounded-md border border-purple-300 bg-purple-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          title={hasPhone ? "Open WhatsApp Web/Desktop" : "Customer phone required"}
        >
          💬 Send in WhatsApp
        </button>
      </div>
    </div>
  );
};

export default QuickReplyPrice;