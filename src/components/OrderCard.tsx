// src/components/OrderCard.tsx
import React, { useMemo, useState } from "react";
import { submitAICorrection, updateStatus } from "../lib/api";
import { timeAgo, useTicker } from "../lib/time";

type Item = { qty?: number; unit?: string | null; canonical?: string | null; name?: string | null };
type Order = {
  id: string;
  created_at: string;
  status: "pending" | "shipped" | "paid";
  customer_name?: string | null;
  source_phone?: string | null;
  raw_text?: string | null;
  audio_url?: string | null;
  items?: Item[];
};

const StatusDot: React.FC<{ status: Order["status"] }> = ({ status }) => {
  const color =
    status === "paid" ? "bg-green-500" : status === "shipped" ? "bg-blue-500" : "bg-amber-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
};

export default function OrderCard({ o, onChange }: { o: Order; onChange: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  // Fix UI state
  const [showFix, setShowFix] = useState(false);
  const [fixReason, setFixReason] = useState("");
  const [fixRaw, setFixRaw] = useState(o.raw_text || "");
  const [fixItemsJson, setFixItemsJson] = useState(JSON.stringify(o.items ?? [], null, 2));
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  const tickNow = useTicker(30000);
  const createdTitle = new Date(o.created_at).toLocaleString();
  const createdAgo = timeAgo(o.created_at, tickNow);

  const itemsLine = useMemo(() => {
    const arr = (o.items || []).map((i) => {
      const qty = i.qty ?? 1;
      const unit = i.unit ? ` ${i.unit}` : "";
      const name = i.canonical || i.name || "item";
      return `${qty}${unit} ${name}`;
    });
    return arr.join(" · ");
  }, [o.items]);

  async function setStatus(s: Order["status"]) {
    if (s === o.status) return;
    await updateStatus(o.id, s);
    onChange();
  }

  async function submitFix() {
    setFixError(null);

    // Validate edited JSON
    let corrected: Item[] = [];
    try {
      const j = JSON.parse(fixItemsJson);
      if (!Array.isArray(j)) throw new Error("Items must be an array");
      corrected = j;
    } catch (e: any) {
      setFixError(e?.message || "Invalid JSON for items");
      return;
    }

    setFixBusy(true);
    try {
      // ✅ Map to backend shape
      await submitAICorrection({
        message_text: (fixRaw ?? o.raw_text ?? "") as string,
        model_output: (o.items ?? []) as any[],
        human_fixed: corrected as any[],
        // Optional extra context (ignored by current backend but future-proof)
        order_id: o.id,
        reason: fixReason || undefined,
      });

      setShowFix(false);
      onChange();
    } catch (e: any) {
      setFixError(e?.response?.data?.error || e?.message || "Failed to submit");
    } finally {
      setFixBusy(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
      {/* top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={o.status} />
          <div className="truncate text-sm text-gray-600" title={createdTitle}>
            {createdTitle}
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-700">
            {createdAgo}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`text-[12px] px-2 py-0.5 rounded border flex items-center gap-1 ${
              o.status === "pending" ? "bg-amber-50 border-amber-300 text-amber-700" : "border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
            onClick={() => setStatus("pending")}
            title="Mark Pending"
          >
            ⏳ <span>Pending</span>
          </button>

          <button
            className={`text-[12px] px-2 py-0.5 rounded border flex items-center gap-1 ${
              o.status === "shipped" ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
            onClick={() => setStatus("shipped")}
            title="Mark Shipped"
          >
            📦 <span>Shipped</span>
          </button>

          <button
            className={`text-[12px] px-2 py-0.5 rounded border flex items-center gap-1 ${
              o.status === "paid" ? "bg-green-50 border-green-300 text-green-700" : "border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
            onClick={() => setStatus("paid")}
            title="Mark Paid"
          >
            ✅ <span>Paid</span>
          </button>

          {/* Wrong Parse → Fix */}
          <button
            className="text-[12px] px-2 py-0.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 ml-1"
            title="Wrong Parse → Fix"
            onClick={() => {
              setFixReason("");
              setFixRaw(o.raw_text || "");
              setFixItemsJson(JSON.stringify(o.items ?? [], null, 2));
              setShowFix((v) => !v);
            }}
          >
            🛠️ <span>Wrong Parse → Fix</span>
          </button>
        </div>
      </div>

      {/* customer/name */}
      <div className="mt-1 text-[13px] text-gray-800">
        {o.customer_name || o.source_phone || "Customer"}
      </div>

      {/* items */}
      <div className="mt-0.5 text-[13px] text-gray-700">
        {itemsLine || o.raw_text || <span className="text-gray-400">No items</span>}
      </div>

      {/* audio */}
      <div className="mt-1 flex gap-2">
        {o.audio_url && <audio controls className="w-full max-w-xs" src={o.audio_url} />}
      </div>

      {/* Fix panel */}
      {showFix && (
        <div className="mt-3 border rounded-lg p-3 bg-rose-50/40 border-rose-200">
          <div className="text-[13px] font-semibold text-rose-700 mb-2">Help us learn: correct the parse</div>

          {fixError ? (
            <div className="text-[12px] text-rose-700 bg-rose-100 border border-rose-200 rounded px-2 py-1 mb-2">{fixError}</div>
          ) : null}

          <label className="block text-[12px] text-gray-700 mb-1">What’s wrong? (optional)</label>
          <input
            className="w-full border border-gray-300 rounded px-2 py-1 text-[13px] mb-2"
            placeholder="e.g., Qty wrong for milk; add 'garlic paste 500g'"
            value={fixReason}
            onChange={(e) => setFixReason(e.target.value)}
          />

          <label className="block text-[12px] text-gray-700 mb-1">Raw text (optional)</label>
          <textarea
            className="w-full border border-gray-300 rounded px-2 py-1 text-[13px] mb-2"
            rows={2}
            value={fixRaw}
            onChange={(e) => setFixRaw(e.target.value)}
          />

          <label className="block text-[12px] text-gray-700 mb-1">Items JSON</label>
          <textarea
            className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono"
            rows={6}
            value={fixItemsJson}
            onChange={(e) => setFixItemsJson(e.target.value)}
            placeholder={`[
  { "qty": 2, "unit": "kg", "canonical": "Chicken", "name": "chicken curry cut" },
  { "qty": 1, "unit": "pack", "canonical": "Milk", "name": "milk" }
]`}
          />

          <div className="mt-2 flex gap-2">
            <button
              onClick={submitFix}
              disabled={fixBusy}
              className="px-3 py-1.5 text-sm rounded bg-black text-white disabled:opacity-60"
            >
              {fixBusy ? "Submitting…" : "Submit Correction"}
            </button>
            <button
              onClick={() => setShowFix(false)}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* show original text toggle */}
      {o.raw_text && !showFix && (
        <button className="mt-2 text-[12px] text-gray-600 underline" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "Hide" : "Show"} original text
        </button>
      )}
      {showRaw && o.raw_text ? (
        <div className="mt-2 text-[12px] text-gray-600 bg-gray-50 rounded p-2 border border-gray-200">{o.raw_text}</div>
      ) : null}
    </div>
  );
}