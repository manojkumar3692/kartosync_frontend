// src/components/OrderCard.tsx  (Premium UI only)
import React, { useMemo, useState } from "react";
import { aiFixOrder, updateStatus } from "../lib/api";
import { timeAgo, useTicker } from "../lib/time";

type Item = {
  qty: number | null;
  unit?: string | null;
  canonical?: string | null;
  name?: string;            // keep undefined when absent
  brand?: string | null;
  variant?: string | null;
  notes?: string | null;
};
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
    status === "paid" ? "bg-emerald-500" : status === "shipped" ? "bg-blue-500" : "bg-amber-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
};

const SegPill = ({
  active,
  tone,
  children,
  onClick,
  title,
}: {
  active: boolean;
  tone: "pending" | "shipped" | "paid" | "idle";
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) => {
  const tones: Record<string, string> = {
    pending: "bg-amber-50 text-amber-800 border-amber-200",
    shipped: "bg-blue-50 text-blue-800 border-blue-200",
    paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
    idle: "border-gray-200 text-gray-700 hover:bg-gray-50",
  };
  return (
    <button
      className={`rounded-full border px-2.5 py-1 text-[12px] transition ${active ? tones[tone] : tones.idle}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
};

export default function OrderCard({ o, onChange }: { o: Order; onChange: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  // Fix modal state
  const [fixOpen, setFixOpen] = useState(false);
  const [fixReason, setFixReason] = useState("");

  // Structured items editor state (with brand/variant)
  const [fixItems, setFixItems] = useState<Item[]>(() =>
    (o.items || []).map((i) => ({
      qty: typeof i.qty === "number" ? i.qty : null,
      unit: i.unit ?? null,
      canonical: i.canonical ?? i.name ?? "",
      name: i.name ?? undefined,
      brand: i.brand ?? null,
      variant: i.variant ?? null,
      notes: i.notes ?? null,
    }))
  );

  // Reinitialize editor when opening
  function openFix() {
    setFixItems(
      (o.items || []).map((i) => ({
        qty: typeof i.qty === "number" ? i.qty : null,
        unit: i.unit ?? null,
        canonical: i.canonical ?? i.name ?? "",
        name: i.name ?? undefined,
        brand: i.brand ?? null,
        variant: i.variant ?? null,
        notes: i.notes ?? null,
      }))
    );
    setFixReason("");
    setFixOpen(true);
  }

  const tickNow = useTicker(30000);
  const createdTitle = new Date(o.created_at).toLocaleString();
  const createdAgo = timeAgo(o.created_at, tickNow);

  const itemsLine = useMemo(() => {
    const arr = (o.items || []).map((i) => {
      const qty = i.qty ?? 1;
      const unit = i.unit ? ` ${i.unit}` : "";
      const brand = i.brand ? ` · ${i.brand}` : "";
      const variant = i.variant ? ` · ${i.variant}` : "";
      const name = i.canonical || i.name || "item";
      return `${qty}${unit} ${name}${brand}${variant}`.trim();
    });
    return arr.join(" · ");
  }, [o.items]);

  async function setStatus(s: Order["status"]) {
    if (s === o.status) return;
    await updateStatus(o.id, s);
    onChange();
  }

  function updateRow(idx: number, patch: Partial<Item>) {
    setFixItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setFixItems((prev) => [
      ...prev,
      { qty: null, unit: null, canonical: "", name: "", brand: null, variant: null, notes: null },
    ]);
  }

  function removeRow(idx: number) {
    setFixItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitFix() {
    const cleaned = fixItems
      .map((it) => ({
        qty: it.qty === null || Number.isNaN(it.qty as any) ? null : Number(it.qty),
        unit: (it.unit || "")?.trim() || null,
        canonical: (it.canonical || "")?.trim() || null,
        name: (it.name || "")?.trim() || undefined,
        brand: (it.brand || "")?.trim() || null,
        variant: (it.variant || "")?.trim() || null,
        notes: (it.notes || "")?.trim() || null,
      }))
      .filter((it) => (it.canonical || it.name)?.length);

    if (!cleaned.length) return;

    await aiFixOrder(o.id, { items: cleaned, reason: fixReason || "human_fix" });
    setFixOpen(false);
    onChange();
  }

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* subtle left accent */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-indigo-300 to-emerald-300" />

      <div className="px-4 py-3">
        {/* top row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={o.status} />
              <div className="truncate text-[13px] text-gray-600" title={createdTitle}>
                {createdTitle}
              </div>
              <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700">
                {createdAgo}
              </span>
            </div>
            <div className="mt-1 text-[14px] font-semibold text-gray-900">
              {o.customer_name || o.source_phone || "Customer"}
            </div>
          </div>

          {/* segmented status + fix */}
          <div className="flex flex-wrap items-center gap-1.5">
            <SegPill
              active={o.status === "pending"}
              tone="pending"
              onClick={() => setStatus("pending")}
              title="Mark Pending"
            >
              ⏳ Pending
            </SegPill>
            <SegPill
              active={o.status === "shipped"}
              tone="shipped"
              onClick={() => setStatus("shipped")}
              title="Mark Shipped"
            >
              📦 Shipped
            </SegPill>
            <SegPill
              active={o.status === "paid"}
              tone="paid"
              onClick={() => setStatus("paid")}
              title="Mark Paid"
            >
              ✅ Paid
            </SegPill>

            <button
              className="ml-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] text-rose-700 hover:bg-rose-100"
              onClick={openFix}
              title="Wrong Parse → Fix"
            >
              ✏️ Wrong Parse → Fix
            </button>
          </div>
        </div>

        {/* items */}
        <div className="mt-2 text-[13px] text-gray-700">
          {(o.items || []).length ? (
            <div className="flex flex-wrap gap-1.5">
              {(o.items || []).map((i, idx) => {
                const qty = i.qty ?? 1;
                const unit = i.unit ? ` ${i.unit}` : "";
                const base = i.canonical || i.name || "item";
                const brand = i.brand ? ` · ${i.brand}` : "";
                const variant = i.variant ? ` · ${i.variant}` : "";
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5"
                  >
                    {`${qty}${unit} ${base}${brand}${variant}`}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-2 py-1.5 text-gray-500">
              {o.raw_text || <span className="text-gray-400">No items</span>}
            </div>
          )}
        </div>

        {/* raw/audio toggles */}
        <div className="mt-2 flex gap-2">
          {o.raw_text && (
            <button
              className="rounded-md border border-gray-200 px-2 py-1 text-[12px] hover:bg-gray-50"
              onClick={() => setShowRaw((v) => !v)}
              title="Show Original Text"
            >
              📝 Text
            </button>
          )}
          {o.audio_url && (
            <button
              className="rounded-md border border-gray-200 px-2 py-1 text-[12px] hover:bg-gray-50"
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
          <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-[12px] text-gray-700">
            {o.raw_text}
          </div>
        ) : null}
      </div>

      {/* FIX MODAL */}
      {fixOpen && (
        <div className="fixed inset-0 z-[9999]">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setFixOpen(false)} />
          {/* panel */}
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
                <div className="text-sm font-semibold">Fix items</div>
                <button
                  onClick={() => setFixOpen(false)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                >
                  ✕ Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4">
                <p className="mb-3 text-xs text-gray-500">
                  Adjust quantity, unit, <b>brand</b>, <b>variant</b>, or name. This updates the order and teaches the AI.
                </p>

                <div className="grid gap-2">
                  {fixItems.map((it, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 p-2">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-gray-500">Name / Canonical</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Milk"
                            value={it.canonical || ""}
                            onChange={(e) => updateRow(idx, { canonical: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">Qty</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., 2"
                            value={it.qty == null ? "" : String(it.qty)}
                            onChange={(e) =>
                              updateRow(idx, {
                                qty: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">Unit</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="kg / pack / L"
                            value={it.unit || ""}
                            onChange={(e) => updateRow(idx, { unit: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">Brand</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Almarai"
                            value={it.brand || ""}
                            onChange={(e) => updateRow(idx, { brand: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">Variant</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Full Fat"
                            value={it.variant || ""}
                            onChange={(e) => updateRow(idx, { variant: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
                        <div className="md:col-span-5">
                          <label className="block text-[11px] text-gray-500">Notes (optional)</label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="Any notes…"
                            value={it.notes || ""}
                            onChange={(e) => updateRow(idx, { notes: e.target.value })}
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            onClick={() => removeRow(idx)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="w-fit rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                    onClick={addRow}
                  >
                    ＋ Add item
                  </button>
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] text-gray-500">Why? (optional)</label>
                  <input
                    className="w-full rounded-md border px-2 py-1 text-sm"
                    placeholder='e.g., "customer said Almarai Full Fat 1L"'
                    value={fixReason}
                    onChange={(e) => setFixReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-4 py-3">
                <button
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
                  onClick={() => setFixOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/90"
                  onClick={submitFix}
                >
                  Save & Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}