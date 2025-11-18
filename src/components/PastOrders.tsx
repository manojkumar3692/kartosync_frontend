// src/components/PastOrders.tsx
import { useEffect, useMemo, useState } from "react";
import api, { logout as apiLogout, me as apiMe } from "../lib/api";

// TEMP severe fallback until backend types are updated
export type Order = any;
import Topbar from "./Topbar";

type StatusFilter = "paid" | "cancelled" | "all";

export default function PastOrders() {
  const [org, setOrg] = useState<any | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("paid");
  const [search, setSearch] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ───────── org + auth ─────────
  useEffect(() => {
    (async () => {
      try {
        const data = await apiMe();
        setOrg(data?.org || data || null);
      } catch (e: any) {
        console.error("[PastOrders] me() failed", e);
        setOrgError("Could not detect org. Please log in again.");
      }
    })();
  }, []);

  const orgId = org?.id as string | undefined;

  const handleLogout = () => {
    apiLogout();
    window.location.reload();
  };

  // ───────── load orders (then filter past on frontend) ─────────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/api/orders", {
          params: { org_id: orgId, limit: 500 },
        });
        const arr: Order[] = Array.isArray(data) ? (data as Order[]) : [];
        setOrders(arr);
      } catch (e) {
        console.error("[PastOrders] list orders failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  // ───────── helpers: totals & formatting ─────────
  const computeLineTotal = (it: any): number | null => {
    const lt =
      typeof it?.line_total === "number" && !Number.isNaN(it.line_total)
        ? it.line_total
        : null;
    if (lt != null) return lt;

    const qty =
      typeof it?.qty === "number" && !Number.isNaN(it.qty) ? it.qty : null;
    const ppu =
      typeof it?.price_per_unit === "number" &&
      !Number.isNaN(it.price_per_unit)
        ? it.price_per_unit
        : null;

    if (qty != null && ppu != null) return qty * ppu;
    return null;
  };

  const computeOrderTotal = (o: Order): number | null => {
    if (!Array.isArray(o.items) || o.items.length === 0) return null;
    let total = 0;
    let any = false;
    for (const it of o.items as any[]) {
      const v = computeLineTotal(it);
      if (v != null) {
        total += v;
        any = true;
      }
    }
    return any ? total : null;
  };

  const formatMoney = (v: number | null | undefined): string => {
    if (v == null || Number.isNaN(v)) return "--";
    // You can adjust currency as needed (AED, INR, etc.)
    return v.toFixed(2);
  };

  const formatStatus = (s: Order["status"]) => {
    if (s === "paid") return "Paid";
    if (s === "shipped") return "Shipped";
    if (s === "cancelled") return "Cancelled";
    return s;
  };

  const statusPillClass = (s: Order["status"]) => {
    if (s === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "shipped") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "cancelled") return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  const handleCopyOrderId = async (id: string) => {
    try {
      if (navigator && "clipboard" in navigator) {
        await navigator.clipboard.writeText(id);
      } else {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = id;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error("[PastOrders] copy failed", e);
      alert("Could not copy order number. Please copy manually.");
    }
  };

  // ───────── derived lists ─────────
  const pastOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "paid" || o.status === "cancelled"
      ),
    [orders]
  );

  const filteredByStatus = useMemo(() => {
    if (statusFilter === "all") return pastOrders;
    return pastOrders.filter((o) => o.status === statusFilter);
  }, [pastOrders, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByStatus;

    return filteredByStatus.filter((o) => {
      const name = (o.customer_name || "").toLowerCase();
      const phone = (o.source_phone || "").toLowerCase();
      const raw = (o.raw_text || "").toLowerCase();
      return (
        name.includes(q) || phone.includes(q) || raw.includes(q)
      );
    });
  }, [filteredByStatus, search]);

  // ───────── wrappers ─────────
  if (orgError) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Topbar authed={false} onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="text-sm">{orgError}</div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-sm text-slate-500">Loading workspace…</div>
      </div>
    );
  }

  // ───────── main UI ─────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* <Topbar authed={true} onLogout={handleLogout} /> */}

      {/* Header */}
      <div className="px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="space-y-1">
          <div className="text-[13px] font-semibold text-slate-900">
            Past & cancelled orders
          </div>
          <div>
            {org.name} —{" "}
            <span className="font-medium">history view</span>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1 py-[2px] text-[11px]">
          <button
            type="button"
            onClick={() => setStatusFilter("paid")}
            className={
              "px-3 py-1 rounded-full transition " +
              (statusFilter === "paid"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-white")
            }
          >
            Paid
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("cancelled")}
            className={
              "px-3 py-1 rounded-full transition " +
              (statusFilter === "cancelled"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-white")
            }
          >
            Cancelled
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={
              "px-3 py-1 rounded-full transition " +
              (statusFilter === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:bg-white")
            }
          >
            All ({pastOrders.length})
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 pb-2">
        <div className="max-w-md relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-[12px] outline-none focus:border-emerald-500"
            placeholder="Search by customer name, phone, or order text…"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading && (
          <div className="text-slate-500 text-sm">Loading orders…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-slate-500 text-sm mt-4">
            No orders match this filter yet.
          </div>
        )}

        {/* Grid of detailed order cards */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => {
            const created = new Date(o.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            const total = computeOrderTotal(o);

            const shortId = o.id.slice(-6);

            return (
              <div
                key={o.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition flex flex-col gap-2"
              >
                {/* Top row: customer + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      {created}
                    </div>
                    <div className="text-[13px] font-semibold text-slate-900 truncate">
                      {o.customer_name || o.source_phone || "Customer"}
                    </div>
                  </div>
                  <span
                    className={
                      "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] " +
                      statusPillClass(o.status)
                    }
                  >
                    {formatStatus(o.status)}
                  </span>
                </div>

                {/* Order ID + copy button */}
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <div className="truncate">
                    Order #
                    <span className="font-mono font-semibold ml-1">
                      {shortId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyOrderId(o.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-[2px] text-[10px] bg-slate-50 hover:bg-slate-100"
                    title="Copy full order ID"
                  >
                    <span>📋</span>
                    <span>Copy</span>
                    {copiedId === o.id && (
                      <span className="text-emerald-600">✓</span>
                    )}
                  </button>
                </div>

                {o.source_phone && (
                  <div className="mt-1 text-[10px] text-slate-500">
                    📞 {o.source_phone}
                  </div>
                )}

                {/* Items list */}
                <div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-2">
                  <div className="text-[10px] font-semibold text-slate-700 mb-1">
                    Items ({(o.items || []).length})
                  </div>
                  {(!o.items || o.items.length === 0) && (
                    <div className="text-[10px] text-slate-400">
                      No items stored for this order.
                    </div>
                  )}
                  {Array.isArray(o.items) && o.items.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-auto pr-1">
                      {(o.items as any[]).map((it, idx) => {
                        const qty =
                          typeof it?.qty === "number" &&
                          !Number.isNaN(it.qty)
                            ? it.qty
                            : null;
                        const unit =
                          typeof it?.unit === "string" && it.unit.trim()
                            ? it.unit.trim()
                            : "";
                        const name =
                          it?.canonical ||
                          it?.name ||
                          `Item ${idx + 1}`;
                        const ppu =
                          typeof it?.price_per_unit === "number" &&
                          !Number.isNaN(it.price_per_unit)
                            ? it.price_per_unit
                            : null;
                        const lineTotal = computeLineTotal(it);

                        return (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-2 text-[10px]"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">
                                {name}
                              </div>
                              <div className="text-slate-500">
                                {qty != null ? qty : "--"}{" "}
                                {unit || ""}
                                {ppu != null && (
                                  <span className="ml-1">
                                    @ {formatMoney(ppu)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right text-slate-700 font-semibold min-w-[60px]">
                              {lineTotal != null
                                ? formatMoney(lineTotal)
                                : "--"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Order total</span>
                  <span className="font-semibold text-slate-900">
                    {total != null ? formatMoney(total) : "--"}
                  </span>
                </div>

                {/* Original raw text snippet (optional) */}
                {o.raw_text && (
                  <div className="mt-1 text-[10px] text-slate-500 line-clamp-2">
                    “{o.raw_text}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}