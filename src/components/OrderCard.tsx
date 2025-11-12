// src/components/OrderCard.tsx
// Brand/variant inline edit + per-line clarify + Inquiry quick replies + Delete order
import React, { useMemo, useState } from "react";
import {
  aiFixOrder,
  getClarifyLink,
  updateStatus,
  deleteOrder,
} from "../lib/api";
import { timeAgo, useTicker } from "../lib/time";
import { OrderReasonChips } from "./OrderReasonChips";

// ─────────────────────────────────────────────────────
// Types (keep in sync with backend / lib/api)
// ─────────────────────────────────────────────────────
type Item = {
  qty: number | null;
  unit?: string | null;
  canonical?: string | null;
  name?: string;
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
  parse_reason?: string | null;
  parse_confidence?: number | null;
};

type Props = {
  o: Order;
  onChange: () => void;
  /**
   * local  -> classic local_bridge behavior (WhatsApp links etc.)
   * waba   -> Cloud API: hide WA links, use dashboard send
   * auto   -> (future) infer from parse_reason, etc.
   */
  modeHint?: "waba" | "local";
};

// ─────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: Order["status"] }> = ({ status }) => {
  const color =
    status === "paid"
      ? "bg-emerald-500"
      : status === "shipped"
      ? "bg-blue-500"
      : "bg-amber-500";
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
      className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
        active ? tones[tone] : tones.idle
      }`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function isBlank(v?: string | null) {
  return (
    !v ||
    !String(v).trim() ||
    /^(n\/?a|na|none|unknown|unspecified)$/i.test(String(v).trim())
  );
}

function buildWAWebLink(phoneLike: string, text: string) {
  const digits = String(phoneLike || "").replace(/[^\d]/g, "");
  const enc = encodeURIComponent(text || "");
  return `https://api.whatsapp.com/send?phone=${digits}&text=${enc}`;
}

function inquiryKind(
  parseReason?: string | null
): "price" | "availability" | null {
  const r = (parseReason || "").toLowerCase();
  if (r.startsWith("inq:price")) return "price";
  if (r.startsWith("inq:availability")) return "availability";
  return null;
}

// ─────────────────────────────────────────────────────

export default function OrderCard({ o, onChange, modeHint }: Props) {
  // WABA vs local_bridge: right now Dashboard passes this explicitly.
  // Keep a tiny auto hook so we don't break if omitted.
  const isWaba = useMemo(() => {
    if (modeHint === "waba") return true;
    if (modeHint === "local") return false;

    const r = (o.parse_reason || "").toLowerCase();

    // Your ingestCore can tag like:
    // "src:waba", "source:waba", "ingest:waba", etc.
    if (
      r.includes("waba") &&
      (r.includes("src:") ||
        r.includes("source:") ||
        r.includes("ingest:") ||
        r.includes("channel:"))
    ) {
      return true;
    }

    // Explicit local tags if you add them:
    if (
      r.includes("local_bridge") ||
      r.includes("local-bridge") ||
      r.includes("src:local") ||
      r.includes("source:local")
    ) {
      return false;
    }

    // Default: treat as local_bridge-style (keeps WA links working)
    return false;
  }, [modeHint, o.parse_reason]);

  const [showRaw, setShowRaw] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  // Inline editing toggles per row
  const [editOpen, setEditOpen] = useState<Record<number, boolean>>({});
  const toggleEdit = (idx: number) =>
    setEditOpen((s) => ({ ...s, [idx]: !s[idx] }));

  // Inline edit values
  const [brandEdits, setBrandEdits] = useState<Record<number, string>>({});
  const [variantEdits, setVariantEdits] = useState<Record<number, string>>({});
  const [saveBusy, setSaveBusy] = useState<number | null>(null);

  // Per-item actions loaders
  const [clarLoading, setClarLoading] = useState<number | null>(null);
  const [waLoading, setWaLoading] = useState<number | null>(null);

  // Fix modal
  const [fixOpen, setFixOpen] = useState(false);
  const [fixReason, setFixReason] = useState("");
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

  function updateRow(idx: number, patch: Partial<Item>) {
    setFixItems((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setFixItems((prev) => [
      ...prev,
      {
        qty: null,
        unit: null,
        canonical: "",
        name: "",
        brand: null,
        variant: null,
        notes: null,
      },
    ]);
  }

  function removeRow(idx: number) {
    setFixItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitFix() {
    const cleaned = fixItems
      .map((it) => ({
        qty:
          it.qty === null || Number.isNaN(it.qty as any)
            ? null
            : Number(it.qty),
        unit: (it.unit || "")?.trim() || null,
        canonical: (it.canonical || "")?.trim() || null,
        name: (it.name || "")?.trim() || undefined,
        brand: (it.brand || "")?.trim() || null,
        variant: (it.variant || "")?.trim() || null,
        notes: (it.notes || "")?.trim() || null,
      }))
      .filter((it) => (it.canonical || it.name)?.length);
    if (!cleaned.length) return;
    await aiFixOrder(o.id, {
      items: cleaned,
      reason: fixReason || "human_fix",
    });
    setFixOpen(false);
    onChange();
  }

  const tickNow = useTicker(30000);
  const createdTitle = new Date(o.created_at).toLocaleString();
  const createdAgo = timeAgo(o.created_at, tickNow);

  // Inquiry helpers
  const inq = inquiryKind(o.parse_reason);
  const firstName = o.customer_name ? ` ${o.customer_name}` : "";
  const firstItem = (o.items && o.items[0]) || null;
  const itemLabel = (firstItem?.canonical || firstItem?.name || "").trim();

  // For local_bridge only: open WA with quick reply
  const sendInquiryReply = (kind: "price" | "availability") => {
    if (!o.source_phone || isWaba) return;
    const msg =
      kind === "price"
        ? [
            `Hi${firstName},`,
            itemLabel
              ? `${itemLabel} – current price is AED ____ (per unit).`
              : `Here’s the price you asked for: AED ____ .`,
            `Let me know if you’d like to place an order.`,
          ].join(" ")
        : [
            `Hi${firstName},`,
            itemLabel ? `${itemLabel} is available ✅.` : `Yes, it's available ✅.`,
            `Just send the item name and quantity to confirm.`,
          ].join(" ");
    const link = buildWAWebLink(o.source_phone!, msg);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  // Inline save for a single row; sends full items array
  const saveInline = async (idx: number) => {
    if (!o.items) return;
    try {
      setSaveBusy(idx);
      const newItems: Item[] = o.items.map((it, i) => {
        if (i !== idx) return it;
        const brand =
          (editOpen[idx]
            ? (brandEdits[idx]?.trim() || null)
            : it.brand ?? null) || null;
        const variant =
          (editOpen[idx]
            ? (variantEdits[idx]?.trim() || null)
            : it.variant ?? null) || null;
        return {
          qty: typeof it.qty === "number" ? it.qty : null,
          unit: it.unit ?? null,
          canonical: (it.canonical || it.name || "") || "",
          name: it.name ?? undefined,
          brand,
          variant,
          notes: it.notes ?? null,
        };
      });

      await aiFixOrder(o.id, {
        items: newItems.map((x) => ({
          qty:
            x.qty === null || Number.isNaN(x.qty as any)
              ? null
              : Number(x.qty),
          unit: (x.unit || "")?.trim() || null,
          canonical: (x.canonical || "")?.trim() || null,
          name: (x.name || "")?.trim() || undefined,
          brand: (x.brand || "")?.trim() || null,
          variant: (x.variant || "")?.trim() || null,
          notes: (x.notes || "")?.trim() || null,
        })),
        reason: `inline_fix:item_${idx}`,
      });

      setBrandEdits((s) => ({ ...s, [idx]: "" }));
      setVariantEdits((s) => ({ ...s, [idx]: "" }));
      setEditOpen((s) => ({ ...s, [idx]: false }));
      onChange();
    } catch (e) {
      console.error(e);
      alert("Failed to save inline edit.");
    } finally {
      setSaveBusy(null);
    }
  };

  // Per-item WA (local_bridge only)
  const sendPerItemWA = async (idx: number) => {
    if (!o.source_phone || isWaba) return;
    try {
      setWaLoading(idx);
      const i = (o.items || [])[idx];
      const base = (i?.canonical || i?.name || "item").trim();
      const needBrand = !i?.brand || !i.brand.trim();
      const needVariant = !i?.variant || !i.variant.trim();
      const what =
        needBrand && needVariant
          ? "brand & variant"
          : needBrand
          ? "brand"
          : "variant";
      const url = await getClarifyLink(o.id, idx);
      const text =
        `Hi${o.customer_name ? " " + o.customer_name : ""}, re: “${base}”.\n\n` +
        `Please confirm the ${what} here:\n${url}\n\n` +
        `Once you choose, we’ll pack it right away.`;
      const link = buildWAWebLink(o.source_phone, text);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      alert("Could not open WhatsApp. Please try again.");
    } finally {
      setWaLoading(null);
    }
  };

  // (kept; handy for tooltips or future summary)
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

  const onDelete = async () => {
    if (!confirm("Delete this order? This cannot be undone.")) return;
    try {
      await deleteOrder(o.id);
      onChange();
    } catch (e) {
      console.error(e);
      alert("Delete failed.");
    }
  };

  async function deleteItem(idx: number) {
    try {
      if (!confirm("Remove this item from the order?")) return;

      const current = (o.items || []).map((i) => ({
        qty: i.qty ?? null,
        unit: i.unit ?? null,
        canonical: (i.canonical || i.name || "").trim(),
        name: i.name ?? undefined,
        brand: i.brand ?? null,
        variant: i.variant ?? null,
        notes: i.notes ?? null,
      }));

      const newItems = current.filter((_, i) => i !== idx);
      await aiFixOrder(o.id, { items: newItems, reason: "remove_item" });
      onChange();
    } catch (e) {
      console.error(e);
      alert("Failed to delete item");
    }
  }

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm w-full">
      {/* subtle left accent */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-indigo-300 to-emerald-300" />

      <div className="px-4 py-3">
        {/* top row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={o.status} />
              <div
                className="truncate text-[13px] text-gray-600"
                title={createdTitle}
              >
                {createdTitle}
              </div>
              <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700">
                {createdAgo}
              </span>
              <OrderReasonChips
                parseReason={o.parse_reason || ""}
                className="justify-end"
              />
            </div>
            <div className="mt-1 text-[14px] font-semibold text-gray-900">
              {o.customer_name || o.source_phone || "Customer"}
            </div>
            {itemsLine && (
              <div className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">
                {itemsLine}
              </div>
            )}
          </div>

          {/* right-side actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {inq && !isWaba && o.source_phone && (
              <span
                className="mr-1 inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-[2px] text-[11px] text-purple-800"
                title="Detected as a customer inquiry (not an order)"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                Inquiry: {inq === "price" ? "Price" : "Availability"}
              </span>
            )}

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
              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] text-rose-700 hover:bg-rose-100"
              onClick={openFix}
              title="Wrong Parse → Fix"
            >
              ✏️ Wrong Parse → Fix
            </button>

            <button
              className="rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-[12px] text-red-700 hover:bg-red-100"
              onClick={onDelete}
              title="Delete this order"
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        {/* Inquiry quick actions (LOCAL ONLY) */}
        {inq && !isWaba && o.source_phone && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(() => {
              const isPrice = inq === "price";
              const isAvail = inq === "availability";
              const clsActive =
                "rounded-md border px-2 py-1 text-[12px] bg-purple-600 text-white border-purple-600 hover:bg-purple-700";
              const clsIdle =
                "rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[12px] text-purple-800 hover:bg-purple-100";
              return (
                <>
                  <button
                    className={isPrice ? clsActive : clsIdle}
                    onClick={() => sendInquiryReply("price")}
                    title="Prefill a WhatsApp message with a price reply"
                  >
                    💸 Reply (Price)
                  </button>
                  <button
                    className={isAvail ? clsActive : clsIdle}
                    onClick={() => sendInquiryReply("availability")}
                    title="Prefill a WhatsApp message with an availability reply"
                  >
                    ✅ Reply (Availability)
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* items */}
        <div className="mt-2 text-[13px] text-gray-700">
          {(o.items || []).length ? (
            <div className="flex flex-col gap-1.5">
              {(o.items || []).map((i, idx) => {
                const qty = i.qty ?? 1;
                const unit = i.unit ? ` ${i.unit}` : "";
                const base = i.canonical || i.name || "item";
                const brand = i.brand || null;
                const variant = i.variant || null;

                const missingBrand = isBlank(i.brand);
                const missingVariant = isBlank(i.variant);
                const ambiguous = missingBrand || missingVariant;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5"
                  >
                    {/* LEFT: text + inline edit */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button
                        className="truncate text-left"
                        onClick={() => toggleEdit(idx)}
                        title="Click to edit brand/variant inline"
                      >
                        <span className="font-medium text-gray-900">
                          {qty}
                          {unit} {base}
                        </span>{" "}
                        {!editOpen[idx] ? (
                          <>
                            {brand ? (
                              <span className="text-gray-700">· {brand}</span>
                            ) : (
                              <span className="text-amber-700/90 underline underline-dotted decoration-2">
                                · brand?
                              </span>
                            )}{" "}
                            {variant ? (
                              <span className="text-gray-700">
                                · {variant}
                              </span>
                            ) : (
                              <span className="text-amber-700/90 underline underline-dotted decoration-2">
                                · variant?
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-indigo-600 underline decoration-dotted">
                            {" "}
                            (editing…)
                          </span>
                        )}
                      </button>

                      {ambiguous && !editOpen[idx] && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-[2px] text-[11px] text-amber-800">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Needs details
                        </span>
                      )}

                      {editOpen[idx] && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-600 text-[12px]">
                            brand:
                          </span>
                          <input
                            className="w-28 rounded border border-amber-300 bg-white px-1 py-0.5 text-[12px] outline-none"
                            placeholder={brand || "type brand"}
                            value={brandEdits[idx] ?? ""}
                            onChange={(e) =>
                              setBrandEdits((s) => ({
                                ...s,
                                [idx]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-gray-600 text-[12px]">
                            variant:
                          </span>
                          <input
                            className="w-28 rounded border border-amber-300 bg-white px-1 py-0.5 text-[12px] outline-none"
                            placeholder={variant || "type variant"}
                            value={variantEdits[idx] ?? ""}
                            onChange={(e) =>
                              setVariantEdits((s) => ({
                                ...s,
                                [idx]: e.target.value,
                              }))
                            }
                          />
                          <button
                            className="text-[11px] rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100"
                            onClick={() => saveInline(idx)}
                            disabled={saveBusy === idx}
                            title="Save this line and teach AI"
                          >
                            {saveBusy === idx ? "Saving…" : "✅ Save"}
                          </button>
                          <button
                            className="text-[11px] rounded border px-2 py-0.5 hover:bg-gray-50"
                            onClick={() => {
                              setEditOpen((s) => ({ ...s, [idx]: false }));
                              setBrandEdits((s) => ({ ...s, [idx]: "" }));
                              setVariantEdits((s) => ({
                                ...s,
                                [idx]: "",
                              }));
                            }}
                            title="Close inline editor"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* RIGHT: per-line actions */}
                    <div className="flex items-center gap-1">
                      <button
                        className="ml-2 text-[11px] rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-700 hover:bg-red-100"
                        onClick={() => deleteItem(idx)}
                        title="Remove this item from the order"
                      >
                        🗑 Delete item
                      </button>

                      {(ambiguous || editOpen[idx]) &&
                       o.source_phone &&
                       !isWaba && (
                        <button
                          className="text-[11px] rounded border px-2 py-0.5 hover:bg-gray-50"
                          onClick={async () => {
                            try {
                              setClarLoading(idx);
                              const url = await getClarifyLink(o.id, idx);
                              await navigator.clipboard.writeText(url);
                              alert(
                                "Clarify link copied. Paste it in WhatsApp."
                              );
                            } catch (e) {
                              console.error(e);
                              alert("Failed to create link");
                            } finally {
                              setClarLoading(null);
                            }
                          }}
                          title="Copy a clarify link for this item"
                        >
                          {clarLoading === idx ? "…" : "🔗 Clarify"}
                        </button>
                      )}

                      {/* WA deep link only for LOCAL mode */}
                      {(ambiguous || editOpen[idx]) &&
                        o.source_phone &&
                        !isWaba && (
                          <button
                            className="text-[11px] rounded border px-2 py-0.5 hover:bg-gray-50"
                            onClick={() => sendPerItemWA(idx)}
                            disabled={waLoading === idx}
                            title="Open WhatsApp with a prefilled message for this item"
                          >
                            {waLoading === idx ? "…" : "💬 WhatsApp"}
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-2 py-1.5 text-gray-500">
              {o.raw_text || (
                <span className="text-gray-400">No items</span>
              )}
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

        {showAudio && o.audio_url && (
          <div className="mt-2">
            <audio controls className="w-full" src={o.audio_url} />
          </div>
        )}

        {showRaw && o.raw_text && (
          <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-[12px] text-gray-700">
            {o.raw_text}
          </div>
        )}
      </div>

      {/* FIX MODAL */}
      {fixOpen && (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setFixOpen(false)}
          />
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
                  Adjust quantity, unit, <b>brand</b>, <b>variant</b>, or name.
                  This updates the order and teaches the AI.
                </p>

                <div className="grid gap-2">
                  {fixItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-gray-200 p-2"
                    >
                      <div className="grid gap-2 grid-cols-2 md:grid-cols-6">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-gray-500">
                            Name / Canonical
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Milk"
                            value={it.canonical || ""}
                            onChange={(e) =>
                              updateRow(idx, {
                                canonical: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">
                            Qty
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., 2"
                            value={it.qty == null ? "" : String(it.qty)}
                            onChange={(e) =>
                              updateRow(idx, {
                                qty: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">
                            Unit
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="kg / pack / L"
                            value={it.unit || ""}
                            onChange={(e) =>
                              updateRow(idx, { unit: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">
                            Brand
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Almarai"
                            value={it.brand || ""}
                            onChange={(e) =>
                              updateRow(idx, { brand: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500">
                            Variant
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="e.g., Full Fat"
                            value={it.variant || ""}
                            onChange={(e) =>
                              updateRow(idx, { variant: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-2 grid gap-2 grid-cols-1 md:grid-cols-6">
                        <div className="md:col-span-5">
                          <label className="block text-[11px] text-gray-500">
                            Notes (optional)
                          </label>
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            placeholder="Any notes…"
                            value={it.notes || ""}
                            onChange={(e) =>
                              updateRow(idx, { notes: e.target.value })
                            }
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
                  <label className="block text-[11px] text-gray-500">
                    Why? (optional)
                  </label>
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