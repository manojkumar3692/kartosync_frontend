// src/component/QuickReplyButton.tsx
import React, { useState } from "react";

type Props = {
  orgId: string;
  customerPhone: string;   // E.164 preferred: +9715xxxx...
  lastMessage: string;     // the customer's question / last inbound message
  label?: string;
};

// Build a WhatsApp Web/Desktop deep link with prefilled text (no extra imports needed)
function buildWAWebLink(phoneE164: string, text: string) {
  const phone = String(phoneE164 || "").replace(/[^\d]/g, ""); // digits only
  const enc = encodeURIComponent(text || "");
  // Works on WhatsApp Web and Desktop app
  return `https://web.whatsapp.com/send?phone=${phone}&text=${enc}`;
}

export default function QuickReplyButton({ orgId, customerPhone, lastMessage, label }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    try {
      setLoading(true);

      // Ask backend for a nice, context-aware suggested reply
      const resp = await fetch("/api/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          customer_phone: customerPhone,
          message: lastMessage,
        }),
      });
      const json = await resp.json();
      if (!json?.ok) throw new Error(json?.error || "suggest failed");

      const link = buildWAWebLink(customerPhone, json.suggested_text);
      window.open(link, "_blank", "noopener,noreferrer"); // user click → not blocked
    } catch (e) {
      console.error(e);
      alert("Could not build a quick reply. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      title="Open WhatsApp Web/Desktop with a prefilled reply"
    >
      {loading ? "Preparing…" : (label || "Reply in WhatsApp")}
    </button>
  );
}