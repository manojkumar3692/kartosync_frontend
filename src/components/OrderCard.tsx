import React, { useMemo, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { aiFixOrder, updateStatus } from "../lib/api";
import { timeAgo, useTicker } from "../lib/time";

type Item = { qty: number; unit?: string; canonical?: string; name?: string };
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

/** Portal-based modal to avoid parent re-renders stealing focus */
function PortalModal({
  open,
  onClose,
  children,
  title = "Dialog",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const [container] = useState(() => {
    const el = document.createElement("div");
    el.setAttribute("data-portal", "modal");
    return el;
  });

  useEffect(() => {
    document.body.appendChild(container);
    return () => {
      try {
        document.body.removeChild(container);
      } catch {}
    };
  }, [container]);

  // lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      aria-modal
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={onClose} // click on backdrop closes
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 w-full max-w-lg mx-3 rounded-xl bg-white border border-gray-200 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()} // prevent backdrop click
      >
        {children}
      </div>
    </div>,
    container
  );
}

export default function OrderCard({
  o,
  onChange,
}: {
  o: Order;
  onChange: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState(() =>
    (o.items || [])
      .map((i) => {
        const qty = typeof i.qty === "number" ? i.qty : "";
        const unit = i.unit ? ` ${i.unit}` : "";
        const name = i.canonical || i.name || "";
        return `${qty}${unit} ${name}`.trim();
      })
      .join("\n")
  );
  const [fixReason, setFixReason] = useState("");

  // when opening, seed once; do NOT reseed on each re-render while typing
  useEffect(() => {
    if (!fixOpen) return;
    setFixText(
      (o.items || [])
        .map((i) => {
          const qty = typeof i.qty === "number" ? i.qty : "";
          const unit = i.unit ? ` ${i.unit}` : "";
          const name = i.canonical || i.name || "";
          return `${qty}${unit} ${name}`.trim();
        })
        .join("\n")
    );
    setFixReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixOpen]);

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

  function parseLinesToItems(text: string): Item[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(.+)$/);
        if (m) return { qty: Number(m[1]), unit: m[2], canonical: m[3] };
        const m2 = l.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
        if (m2) return { qty: Number(m2[1]), canonical: m2[2] };
        return { qty: 1, canonical: l };
      });
  }

  async function submitFix() {
    const items = parseLinesToItems(fixText);
    if (!items.length) return;
    await aiFixOrder(o.id, { items, reason: fixReason || "user_fix" });
    setFixOpen(false);
    onChange();
  }

  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2 bg-white relative">
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

        {/* actions */}
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

          <button
            className="text-[12px] px-2 py-0.5 rounded border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 ml-1"
            onClick={() => setFixOpen(true)}
            title="Wrong Parse → Fix"
          >
            ✏️ Wrong Parse → Fix
          </button>
        </div>
      </div>

      {/* customer */}
      <div className="mt-1 text-[13px] text-gray-800">{o.customer_name || o.source_phone || "Customer"}</div>

      {/* items */}
      <div className="mt-0.5 text-[13px] text-gray-700">
        {itemsLine || o.raw_text || <span className="text-gray-400">No items</span>}
      </div>

      {/* raw/audio toggles */}
      <div className="mt-2 flex gap-2">
        {o.raw_text && (
          <button
            className="text-[12px] px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50"
            onClick={() => setShowRaw((v) => !v)}
            title="Show Original Text"
          >
            📝 Text
          </button>
        )}
        {o.audio_url && (
          <button
            className="text-[12px] px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50"
            onClick={() => setShowAudio((v) => !v)}
            title="Play Audio"
          >
            🎧 Audio
          </button>
        )}
      </div>

      {showAudio && o.audio_url ? (
        <div className="mt-2">
          <audio controls className="w-full" src={o.audio_url} />
        </div>
      ) : null}
      {showRaw && o.raw_text ? (
        <div className="mt-2 text-[12px] text-gray-600 bg-gray-50 rounded p-2 border border-gray-200">{o.raw_text}</div>
      ) : null}

      {/* FIX MODAL (portal) */}
      <PortalModal open={fixOpen} onClose={() => setFixOpen(false)} title="Wrong Parse → Fix">
        <div className="p-3">
          <div className="text-sm font-semibold mb-1">Fix items (one per line)</div>
          <textarea
            autoFocus
            className="w-full border border-gray-300 rounded p-2 text-sm h-40"
            value={fixText}
            onChange={(e) => setFixText(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded p-2 text-sm mt-2"
            placeholder="(Optional) Why? e.g., 'model included greetings as item'"
            value={fixReason}
            onChange={(e) => setFixReason(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1.5 text-sm border rounded" onClick={() => setFixOpen(false)}>
              Cancel
            </button>
            <button className="px-3 py-1.5 text-sm rounded bg-black text-white" onClick={submitFix}>
              Save & Update
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}