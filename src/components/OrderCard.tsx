// src/components/OrderCard.tsx
// Brand/variant inline edit + per-line clarify + Inquiry quick replies + Delete order
// + Operator overrides: Split to New Order (per line) & Merge with Previous (card-level)
// + Price per line, order total & "Send summary" to WhatsApp / WABA
import React, { useEffect, useMemo, useState } from "react";
import api, {
  aiFixOrder,
  getClarifyLink,
  updateStatus,
  deleteOrder,
  splitOrderItems,
  mergeWithPrevious,
  sendInboxMessage,
  listProducts, // ⬅️ NEW: use the existing admin catalog API
} from "../lib/api";
import { timeAgo, useTicker } from "../lib/time";
import { OrderReasonChips } from "./OrderReasonChips";
import { deriveKindFromParseReason, ParsedKind } from "../utils/parseKind";
// ─────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────
const CURRENCY = "AED";

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
  category?: string | null;

  // optional pricing
  price_per_unit?: number | null;
  line_total?: number | null;
};

type Order = {
  id: string;
  created_at: string;
  status: "pending" | "shipped" | "paid" | "cancelled";
  customer_name?: string | null;
  source_phone?: string | null;
  raw_text?: string | null;
  audio_url?: string | null;
  items?: Item[];
  parse_reason?: string | null;
  parse_confidence?: number | null;
  link_reason?: string | null;
    // 🔹 NEW: backend-computed total (once you add it)
    order_total?: number | null;
    // optional if you add it later
    pricing_locked?: boolean | null;
    // 🔹 NEW
  shipping_address?: string | null;
};

type Props = {
  o: Order;
  onChange: () => void;
  modeHint?: "waba" | "local";
  /** Needed so we can send messages over WhatsApp Cloud API instead of WA Web links */
  orgId?: string;
};

// Simple view of products from admin catalog
type CatalogProduct = {
  canonical?: string | null;
  name?: string | null;   // allow backend to send name
  label?: string | null;  // or label
  variant?: string | null;
  dynamic_price?: boolean | null;
  price_per_unit?: number | null;
};

// ─────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: Order["status"] }> = ({ status }) => {
  const color =
    status === "paid"
      ? "bg-emerald-500"
      : status === "shipped"
      ? "bg-blue-500"
      : status === "cancelled"
      ? "bg-rose-500"
      : "bg-amber-500"; // pending / others
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

// function inquiryKind(
//   parseReason?: string | null
// ): "price" | "availability" | null {
//   const r = (parseReason || "").toLowerCase();
//   if (r.startsWith("inq:price")) return "price";
//   if (r.startsWith("inq:availability")) return "availability";
//   return null;
// }

// Build order summary text with price lines + total
// If prices are missing, the total will be 0.00 as a safe default.
function buildOrderSummaryText(o: Order, subtotal: number) {
  const name = (o.customer_name || "").trim();
  const hi = name ? `Hi ${name},` : "Hi,";
  const items = o.items || [];

  const lines = items.map((it, idx) => {
    const qty =
      typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : 1;
    const unit = it.unit ? ` ${it.unit}` : "";
    const baseName = (it.canonical || it.name || "item").trim();
    const brand = it.brand ? ` · ${it.brand}` : "";
    const variant = it.variant ? ` · ${it.variant}` : "";

    const price =
      typeof it.price_per_unit === "number" && !Number.isNaN(it.price_per_unit)
        ? it.price_per_unit
        : null;
    const lineTotal =
      price != null ? price * qty : it.line_total != null ? it.line_total : 0;

    if (price != null) {
      return `${idx + 1}) ${qty}${unit} ${baseName}${brand}${variant} – ${CURRENCY} ${price.toFixed(
        2
      )} × ${qty} = ${CURRENCY} ${lineTotal.toFixed(2)}`;
    }

    // no price info → just item line
    return `${idx + 1}) ${qty}${unit} ${baseName}${brand}${variant}`;
  });

  let text = `${hi} here is your order summary:\n\n${lines.join("\n")}`;
  text += `\n\nTotal: ${CURRENCY} ${subtotal.toFixed(
    2
  )}\n\nReply YES to confirm.`;
  return text;
}

// ─────────────────────────────────────────────────────

export default function OrderCard({ o, onChange, modeHint, orgId }: Props) {

  const [editingAddress, setEditingAddress] = useState(false);
const [addressDraft, setAddressDraft] = useState(o.shipping_address || "");
const [savingAddress, setSavingAddress] = useState(false);
  const isWaba = useMemo(() => {
    if (modeHint === "waba") return true;
    if (modeHint === "local") return false;
    const r = (o.parse_reason || "").toLowerCase();
    if (
      r.includes("waba") &&
      (r.includes("src:") ||
        r.includes("source:") ||
        r.includes("ingest:") ||
        r.includes("channel:"))
    ) {
      return true;
    }
    if (
      r.includes("local_bridge") ||
      r.includes("local-bridge") ||
      r.includes("src:local") ||
      r.includes("source:local")
    ) {
      return false;
    }
    return false;
  }, [modeHint, o.parse_reason]);

  const canSendWaba = !!(isWaba && orgId && o.source_phone);

  async function sendWabaText(text: string) {
    if (!canSendWaba || !orgId || !o.source_phone) return;
    try {
      await sendInboxMessage(orgId, o.source_phone, text);
    } catch (e) {
      console.error("[OrderCard] WABA send failed", e);
      alert("Failed to send WhatsApp message. Please try again.");
    }
  }

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

  // Operator overrides
  const [splitBusy, setSplitBusy] = useState<number | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);

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
      category: i.category ?? null,
      price_per_unit: i.price_per_unit ?? null,
      line_total: i.line_total ?? null,
    }))
  );

  // ─────────────────────────────────────────────
  // NEW: catalog cache for auto-pricing by variant
  // ─────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    // load admin catalog once when card mounts
    (async () => {
      try {
        const res: any = await listProducts();
        const items =
          (res && Array.isArray(res.items) && res.items) ||
          (Array.isArray(res) ? res : []);
        setCatalog(items);
      } catch (e) {
        console.error("[OrderCard] failed to load catalog", e);
      }
    })();
  }, []);

  function normKey(s?: string | null) {
    return (s || "").trim().toLowerCase();
  }
  
  function getBaseName(p: CatalogProduct): string {
    return (
      normKey(p.canonical) ||
      normKey(p.name as any) ||
      normKey(p.label as any)
    );
  }

  function findMatchingProduct(
    canonical?: string | null,
    variant?: string | null
  ): CatalogProduct | undefined {
    if (!catalog.length) return undefined;
  
    const canonKey = normKey(canonical);
    const varKey = normKey(variant);
  
    if (!canonKey && !varKey) return undefined;
  
    // 1) strict canonical match (same as before, but using base name)
    let candidates = catalog.filter((p) => getBaseName(p) === canonKey);
  
    // 2) if nothing, try a "contains" match:
    //    e.g. order "onion" vs catalog "onion small" or "onion - small"
    if (!candidates.length && canonKey) {
      candidates = catalog.filter((p) => {
        const base = getBaseName(p);
        return (
          base &&
          (base.includes(canonKey) || canonKey.includes(base))
        );
      });
    }
  
    if (!candidates.length) return undefined;
  
    // 3) If we know the variant, try to match it within candidates
    if (varKey) {
      const exactVar = candidates.find(
        (p) => normKey(p.variant) === varKey
      );
      if (exactVar) return exactVar;
    }
  
    // 4) Fallback: just take the first candidate
    return candidates[0];
  }

  const enrichedItems: Item[] = useMemo(() => {
    const src = o.items || [];
    if (!src.length) return src;
  
    // 🔹 IMPORTANT:
    // For shipped/paid orders, DON'T auto-enrich from catalog.
    // Just show whatever is saved in DB so totals stay frozen.
    if (o.status === "shipped" || o.status === "paid") {
      return src;
    }
  
    if (!catalog.length) return src;
  
    return src.map((it) => {
      const qty =
        typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : 1;
  
      let price =
        typeof it.price_per_unit === "number" &&
        !Number.isNaN(it.price_per_unit)
          ? it.price_per_unit
          : null;
      let lineTotal =
        typeof it.line_total === "number" && !Number.isNaN(it.line_total)
          ? it.line_total
          : null;
  
      if (price == null) {
        const product = findMatchingProduct(
          it.canonical || it.name || "",
          it.variant || null
        );
        if (
          product &&
          typeof product.price_per_unit === "number" &&
          !Number.isNaN(product.price_per_unit)
        ) {
          price = product.price_per_unit;
        }
      }
  
      if (lineTotal == null && price != null) {
        lineTotal = qty * price;
      }
  
      return {
        ...it,
        price_per_unit: price,
        line_total: lineTotal,
      };
    });
  }, [o.items, o.status, catalog]);

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
        category: i.category ?? null,
        price_per_unit: i.price_per_unit ?? null,
        line_total: i.line_total ?? null,
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
        category: null,
        price_per_unit: null,
        line_total: null,
      },
    ]);
  }

  function removeRow(idx: number) {
    setFixItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitFix() {
    const cleaned = fixItems
      .map((it) => {
        const base: any = {
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
          // keep pricing fields so DB can store them
          price_per_unit:
            it.price_per_unit == null ||
            Number.isNaN(it.price_per_unit as any)
              ? null
              : Number(it.price_per_unit),
          line_total:
            it.line_total == null || Number.isNaN(it.line_total as any)
              ? null
              : Number(it.line_total),
        };

        // 🔁 NEW: auto-price from catalog when we have canonical + variant
        const product = findMatchingProduct(base.canonical, base.variant);
if (product && product.price_per_unit != null) {
  base.price_per_unit = Number(product.price_per_unit);
  if (base.qty != null && !Number.isNaN(base.qty)) {
    base.line_total = base.qty * Number(product.price_per_unit);
  } else {
    base.line_total = Number(product.price_per_unit);
  }
}

        return base;
      })
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
  const parsedKind: ParsedKind = useMemo(
    () => deriveKindFromParseReason(o.parse_reason || null),
    [o.parse_reason]
  );

  // normalize to a simple "price"/"availability"/"menu"/null
  const inq: "price" | "availability" | "menu" | null =
    parsedKind === "price_inquiry" || parsedKind === "mixed_order_price"
      ? "price"
      : parsedKind === "availability_inquiry" ||
        parsedKind === "mixed_order_availability"
      ? "availability"
      : parsedKind === "menu_request"
      ? "menu"
      : null;

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
              ? `${itemLabel} – current price is ${CURRENCY} ____ (per unit).`
              : `Here’s the price you asked for: ${CURRENCY} ____ .`,
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

        let updated: Item = {
          qty: typeof it.qty === "number" ? it.qty : null,
          unit: it.unit ?? null,
          canonical: (it.canonical || it.name || "") || "",
          name: it.name ?? undefined,
          brand,
          variant,
          notes: it.notes ?? null,
          category: it.category ?? null,
          price_per_unit: it.price_per_unit ?? null,
          line_total: it.line_total ?? null,
        };

        // 🔁 NEW: auto-price when brand/variant is updated inline
        const product = findMatchingProduct(
          updated.canonical,
          updated.variant
        );
        if (product && product.price_per_unit != null) {
          const p = Number(product.price_per_unit);
          updated.price_per_unit = p;
          const q =
            updated.qty != null && !Number.isNaN(updated.qty)
              ? updated.qty
              : 1;
          updated.line_total = q * p;
        }

        return updated;
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
          price_per_unit:
            x.price_per_unit == null ||
            Number.isNaN(x.price_per_unit as any)
              ? null
              : Number(x.price_per_unit),
          line_total:
            x.line_total == null || Number.isNaN(x.line_total as any)
              ? null
              : Number(x.line_total),
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

  // Generic clarify handler – LOCAL: copy link; WABA: send directly
  const handleClarifyClick = async (idx: number) => {
    try {
      setClarLoading(idx);
      const url = await getClarifyLink(o.id, idx);

      // NEW: WABA → send via backend (no manual copy)
      if (isWaba && orgId && o.source_phone) {
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

        const msg =
          `Hi${o.customer_name ? " " + o.customer_name : ""}, re: “${base}”.\n\n` +
          `Please confirm the ${what} here:\n${url}\n\n` +
          `Once you choose, we’ll pack it right away.`;

        await sendInboxMessage(orgId, o.source_phone, msg);
        alert("Clarify message sent to customer on WhatsApp.");
      } else {
        // OLD behaviour (kept): local / non-WABA → just copy link
        await navigator.clipboard.writeText(url);
        alert(
          "Clarify link copied. Paste it into WhatsApp (or your tool) to send to the customer."
        );
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create clarify link");
    } finally {
      setClarLoading(null);
    }
  };

  // Per-item WA (LOCAL only)
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

  // WABA-only: per-line price quick reply
  const sendPriceForLineWaba = async (idx: number) => {
    if (!canSendWaba) return;
    const it = enrichedItems[idx];
    if (!it) return;
    const qty =
      typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : 1;
    const unit = it.unit ? ` ${it.unit}` : "";
    const base = (it.canonical || it.name || "item").trim();
    const brand = it.brand ? ` · ${it.brand}` : "";
    const variant = it.variant ? ` · ${it.variant}` : "";
    const price =
      typeof it.price_per_unit === "number" && !Number.isNaN(it.price_per_unit)
        ? it.price_per_unit
        : null;

    const name = (o.customer_name || "").trim();
    const hi = name ? `Hi ${name},` : "Hi,";
    const core = `${qty}${unit} ${base}${brand}${variant}`.trim();

    const text =
      price != null
        ? `${hi} price for ${core} is ${CURRENCY} ${price.toFixed(
            2
          )} per${unit || " unit"}.`
        : `${hi} price for ${core} is ${CURRENCY} 0.00 (please adjust if needed).`;

    await sendWabaText(text);
    alert("Price reply sent to the customer on WhatsApp.");
  };

  // Operator override: Split a single item into a new order
  const splitOne = async (idx: number) => {
    if (!o.items || idx < 0 || idx >= o.items.length) return;
    if (!confirm("Split this line into a NEW order?")) return;
    try {
      setSplitBusy(idx);
      await splitOrderItems(o.id, [idx]);
      onChange();
    } catch (e) {
      console.error(e);
      alert("Split failed.");
    } finally {
      setSplitBusy(null);
    }
  };

  // Operator override: Merge this order with the previous open order (if any)
  const mergePrev = async () => {
    if (!confirm("Merge this order into the previous one?")) return;
    try {
      setMergeBusy(true);
      await mergeWithPrevious(o.id);
      onChange();
    } catch (e) {
      console.error(e);
      alert("Merge failed.");
    } finally {
      setMergeBusy(false);
    }
  };

  // Human-readable items line
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

// Price subtotal: use enrichedItems (catalog-enriched)
// Prefer backend order_total; fall back to computed subtotal
const { subtotal, hasAnyPrice, totalForDisplay } = useMemo(() => {
  let sum = 0;
  let anyPrice = false;

  enrichedItems.forEach((it) => {
    const qty =
      typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : 1;

    const price =
      typeof it.price_per_unit === "number" &&
      !Number.isNaN(it.price_per_unit)
        ? it.price_per_unit
        : null;

    const lineTotal =
      typeof it.line_total === "number" && !Number.isNaN(it.line_total)
        ? it.line_total
        : null;

    if (price != null) {
      anyPrice = true;
      sum += qty * price;
    } else if (lineTotal != null) {
      anyPrice = true;
      sum += lineTotal;
    }
  });

  const backendTotal =
    typeof o.order_total === "number" && !Number.isNaN(o.order_total)
      ? o.order_total
      : null;

  if (backendTotal != null) {
    anyPrice = true; // we *do* have a usable total
  }

  const totalForDisplay = backendTotal ?? sum;

  return { subtotal: sum, hasAnyPrice: anyPrice, totalForDisplay };
}, [enrichedItems, o.order_total]);



async function setStatus(s: Order["status"]) {
  if (s === o.status) return;

  const goingToFinal =
    s === "shipped" || s === "paid";

  // If moving to shipped/paid: freeze current enriched prices into DB
  if (goingToFinal && enrichedItems.length) {
    try {
      await aiFixOrder(o.id, {
        items: enrichedItems.map((it) => ({
          qty:
            it.qty == null || Number.isNaN(it.qty as any)
              ? null
              : Number(it.qty),
          unit: (it.unit || "")?.trim() || null,
          canonical: (it.canonical || "")?.trim() || null,
          name: (it.name || "")?.trim() || undefined,
          brand: (it.brand || "")?.trim() || null,
          variant: (it.variant || "")?.trim() || null,
          notes: (it.notes || "")?.trim() || null,
          price_per_unit:
            it.price_per_unit == null ||
            Number.isNaN(it.price_per_unit as any)
              ? null
              : Number(it.price_per_unit),
          line_total:
            it.line_total == null ||
            Number.isNaN(it.line_total as any)
              ? null
              : Number(it.line_total),
        })),
        reason: `freeze_pricing_on_${s}`,
      });
    } catch (e) {
      console.error("[OrderCard] failed to freeze pricing before status change", e);
      // we still continue to update status so flow is not blocked
    }
  }

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

  // Send summary / bill
  const sendSummaryToCustomer = async () => {
    if (!o.source_phone) return;
    const text = buildOrderSummaryText(
      { ...o, items: enrichedItems },
      totalForDisplay
    );

    if (canSendWaba) {
      await sendWabaText(text);
      alert("Bill sent to the customer on WhatsApp.");
    } else {
      const link = buildWAWebLink(o.source_phone, text);
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────

  return (
    <div className="relative w-full rounded-2xl border border-gray-200 bg-white shadow-sm">
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
            {/* {itemsLine && (
              <div className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
                {itemsLine}
              </div>
            )} */}
          </div>

          {/* right-side actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {inq && !isWaba && o.source_phone && (
              <span
                className="mr-1 inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-[2px] text-[11px] text-purple-800"
                title="Detected as a customer inquiry (not an order)"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                Inquiry:{" "}
                {inq === "price"
                  ? "Price"
                  : inq === "availability"
                  ? "Availability"
                  : "Menu"}
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

            {/* Send summary / bill – works for LOCAL (WA Web) and WABA (Cloud API) */}
            {o.source_phone && (
              <button
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-800 hover:bg-emerald-100"
                onClick={sendSummaryToCustomer}
                title={
                  canSendWaba
                    ? "Send bill to customer on WhatsApp"
                    : "Open WhatsApp Web with full order summary and total"
                }
              >
                🧾 Send bill
              </button>
            )}

            <button
              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] text-rose-700 hover:bg-rose-100"
              onClick={onDelete}
              title="Delete this order"
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        {/* Operator overrides (card level) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[12px] hover:bg-gray-100"
            onClick={openFix}
            title="Wrong Parse → Fix"
          >
            ✏️ Wrong Parse → Fix
          </button>

          {/* <button
            className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[12px] text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            onClick={mergePrev}
            disabled={mergeBusy}
            title="Merge this order into the previous open order"
          >
            {mergeBusy ? "Merging…" : "↩︎ Merge with Previous"}
          </button> */}
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
          {enrichedItems.length ? (
            <div className="flex flex-col gap-1.5">
              {enrichedItems.map((i, idx) => {
                const qty = i.qty ?? 1;
                const unit = i.unit ? ` ${i.unit}` : "";
                const base = i.canonical || i.name || "item";
                const brand = i.brand || null;
                const variant = i.variant || null;

                const missingBrand = isBlank(i.brand);
                const missingVariant = isBlank(i.variant);
                const ambiguous = missingBrand || missingVariant;

                const price =
                  typeof i.price_per_unit === "number" &&
                  !Number.isNaN(i.price_per_unit)
                    ? i.price_per_unit
                    : null;
                const lineTotal =
                  price != null
                    ? price * (typeof i.qty === "number" ? i.qty : 1)
                    : typeof i.line_total === "number"
                    ? i.line_total
                    : null;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5"
                  >
                    {/* LEFT: text + inline edit */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                                <span className="text-gray-700">
                                  · {brand}
                                </span>
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
                      </div>

                      {/* Price row */}
                      {price != null && (
                        <div className="text-[11px] text-gray-600">
                          {CURRENCY} {price.toFixed(2)}{" "}
                          {i.unit ? `per ${i.unit}` : "per unit"}
                          {lineTotal != null && (
                            <>
                              {" "}
                              · Line:{" "}
                              <span className="font-medium text-gray-800">
                                {CURRENCY} {lineTotal.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Inline edit inputs */}
                      {editOpen[idx] && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] text-gray-600">
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
                          <span className="text-[12px] text-gray-600">
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
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100"
                            onClick={() => saveInline(idx)}
                            disabled={saveBusy === idx}
                            title="Save this line and teach AI"
                          >
                            {saveBusy === idx ? "Saving…" : "✅ Save"}
                          </button>
                          <button
                            className="rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50"
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
                    <div className="ml-2 flex items-center gap-1">
                      <button
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-100"
                        onClick={() => deleteItem(idx)}
                        title="Remove this item from the order"
                      >
                        🗑 Delete item
                      </button>

                      {/* Split to New Order (per line) */}
                      <button
                        className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                        onClick={() => splitOne(idx)}
                        disabled={splitBusy === idx}
                        title="Split this line into a NEW order"
                      >
                        {splitBusy === idx ? "…" : "↗︎ Split"}
                      </button>

                      {/* Clarify link: available for local + WABA */}
                      {/* {(ambiguous || editOpen[idx]) && (
                        <button
                          className="rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50"
                          onClick={() => handleClarifyClick(idx)}
                          disabled={clarLoading === idx}
                          title="Clarify this item with the customer"
                        >
                          {clarLoading === idx ? "…" : "🔗 Clarify"}
                        </button>
                      )} */}

                      {/* WA deep link only for LOCAL mode */}
                      {(ambiguous || editOpen[idx]) &&
                        o.source_phone &&
                        !isWaba && (
                          <button
                            className="rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50"
                            onClick={() => sendPerItemWA(idx)}
                            disabled={waLoading === idx}
                            title="Open WhatsApp with a prefilled message for this item"
                          >
                            {waLoading === idx ? "…" : "💬 WhatsApp"}
                          </button>
                        )}

                      {/* WABA-only: quick price reply for this line */}
                      {isWaba &&
                        canSendWaba &&
                        typeof i.price_per_unit === "number" && (
                          <button
                            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100"
                            onClick={() => sendPriceForLineWaba(idx)}
                            title="Send price for just this item on WhatsApp"
                          >
                            💸 Price
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-2 py-1.5 text-gray-500">
              {o.raw_text || <span className="text-gray-400">No items</span>}
            </div>
          )}
        </div>

        {/* Order total (always show; will be 0.00 if no prices) */}
        <div className="mt-2 flex items-center justify-end border-t border-dashed border-gray-200 pt-2 text-[12px] text-gray-900">
          <span className="mr-2 text-gray-500">
            {hasAnyPrice ? "Total:" : "Total (no prices set):"}
          </span>
          <span className="font-semibold">
            {CURRENCY} {totalForDisplay.toFixed(2)}
          </span>
        </div>

        {/* Delivery address (WABA only, but you can remove isWaba if you want for local too) */}
        {isWaba && (
          <div className="mt-3 border border-slate-200 rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Delivery address</span>
              {!editingAddress && (
                <button
                  type="button"
                  className="text-[11px] text-indigo-600 hover:underline"
                  onClick={() => setEditingAddress(true)}
                >
                  {o.shipping_address ? "Edit" : "Add"}
                </button>
              )}
            </div>

            {!editingAddress && (
              <div className="mt-1 text-[11px] text-slate-800 whitespace-pre-line">
                {o.shipping_address && o.shipping_address.trim().length > 0 ? (
                  o.shipping_address
                ) : (
                  <span className="text-slate-400">
                    No address captured yet. Ask the customer on WhatsApp or wait
                    for AI to capture it.
                  </span>
                )}
              </div>
            )}

            {editingAddress && (
              <div className="mt-2 space-y-2">
                <textarea
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white resize-y min-h-[70px]"
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                  placeholder="Flat / villa, building, street, area, city, landmark…"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingAddress}
                    onClick={async () => {
                      try {
                        setSavingAddress(true);
                        await api.patch(`/api/orders/${o.id}`, {
                          shipping_address: addressDraft.trim() || null,
                        });
                        setEditingAddress(false);
                        onChange(); // refresh orders in Dashboard
                      } catch (e) {
                        console.error("[OrderCard] save address failed", e);
                        alert("Could not save address. Please try again.");
                      } finally {
                        setSavingAddress(false);
                      }
                    }}
                    className={
                      "px-3 py-[5px] rounded-full text-[11px] font-medium " +
                      (savingAddress
                        ? "bg-slate-300 text-slate-600"
                        : "bg-emerald-600 text-white hover:bg-emerald-500")
                    }
                  >
                    {savingAddress ? "Saving…" : "Save address"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddress(false);
                      setAddressDraft(o.shipping_address || "");
                    }}
                    className="px-3 py-[5px] rounded-full text-[11px] bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
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

                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
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