// src/util/parseKind.ts

export type ParsedKind =
  | "order"
  | "price_inquiry"
  | "availability_inquiry"
  | "menu_request"
  | "greeting"
  | "mixed_order_price"
  | "mixed_order_availability"
  | "unknown";

export function deriveKindFromParseReason(reason?: string | null): ParsedKind {
  if (!reason) return "unknown";

  const r = reason.toLowerCase().trim();

  // ─── Pure inquiries ──────────────────────────────────────
  if (r.startsWith("inq:price")) return "price_inquiry";
  if (r.startsWith("inq:availability")) return "availability_inquiry";
  if (r.startsWith("inq:menu")) return "menu_request";

  // ─── Greetings / non-order ───────────────────────────────
  if (r.startsWith("non_order:greeting")) return "greeting";
  if (r.includes("greeting") || r.includes("hello") || r.includes("hi")) {
    return "greeting";
  }

  // ─── Mixed messages ───────────────────────────────────────
  if (r.startsWith("order+inq:price")) return "mixed_order_price";
  if (r.startsWith("order+inq:availability")) return "mixed_order_availability";

  // ─── Pure orders ──────────────────────────────────────────
  if (r.startsWith("order")) return "order";
  if (r === "items_detected" || r === "rule_fallback" || r.includes("order"))
    return "order";

  return "unknown";
}