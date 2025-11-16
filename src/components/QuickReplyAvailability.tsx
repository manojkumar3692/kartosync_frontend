// src/components/QuickReplyAvailability.tsx
import React, { useMemo, useState } from "react";

type Props = {
  phone: string | null | undefined;
  customerName?: string | null;
  defaultItem?: string | null;
  className?: string;
  /**
   * Optional backend sender (WABA). If provided, we call this instead of
   * opening WhatsApp Web.
   */
  onSend?: (text: string) => void | Promise<void>;
};

function buildWAWebLink(phoneLike: string, text: string) {
  const digits = String(phoneLike || "").replace(/[^\d]/g, "");
  const enc = encodeURIComponent(text || "");
  return `https://web.whatsapp.com/send?phone=${digits}&text=${enc}`;
}

function tidy(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

const QuickReplyAvailability: React.FC<Props> = ({
  phone,
  customerName,
  defaultItem,
  className,
  onSend,
}) => {
  const [note, setNote] = useState(""); // e.g., "Yes, available" or "Back in stock tomorrow"
  const hasPhone = !!(phone && String(phone).trim());

  const itemLabel = tidy(String(defaultItem || ""));
  const firstName = customerName ? ` ${customerName}` : "";

  const preview = useMemo(() => {
    const line1 = tidy(`Hi${firstName},`);
    const line2 = itemLabel
      ? tidy(`${itemLabel}: ${note || "____"}.`)
      : tidy(`Availability: ${note || "____"}.`);
    const line3 = `Let me know if you'd like to place an order.`;
    return `${line1}\n${line2}\n${line3}`;
  }, [note, firstName, itemLabel]);

  const handleSend = async () => {
    if (onSend) {
      try {
        await onSend(preview);
      } catch (e) {
        console.error(e);
        alert("Could not send reply. Please try again.");
      }
      return;
    }
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
    <div
      className={[
        "rounded-xl border border-green-200 bg-green-50 p-3",
        className || "",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold text-green-900">
          Quick Reply · Availability
        </div>
        {!onSend && !hasPhone && (
          <span className="text-[11px] text-green-700">Phone missing</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-0.5 block text-[11px] text-green-800">
            Item
          </label>
          <input
            className="w-full rounded-md border border-green-200 bg-white px-2 py-1 text-sm"
            value={itemLabel}
            readOnly
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-0.5 block text-[11px] text-green-800">
            Availability / Note
          </label>
          <input
            className="w-full rounded-md border border-green-200 bg-white px-2 py-1 text-sm"
            placeholder='e.g., "Yes, available" or "Restocking tomorrow"'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-2 whitespace-pre-wrap rounded-md border border-green-200 bg-white p-2 text-[12px] text-green-900">
        {preview}
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          className="rounded-md border border-green-300 bg-white px-2 py-1 text-[12px] text-green-800 hover:bg-green-100"
          onClick={() =>
            navigator.clipboard
              .writeText(preview)
              .then(() => alert("Copied to clipboard"))
              .catch(() => alert("Could not copy"))
          }
        >
          Copy text
        </button>
        <button
          onClick={handleSend}
          disabled={!onSend && !hasPhone}
          className="rounded-md border border-green-300 bg-green-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          💬 Send in WhatsApp
        </button>
      </div>
    </div>
  );
};

export default QuickReplyAvailability;