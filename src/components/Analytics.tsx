// src/components/Analytics.tsx
import { useEffect, useMemo, useState } from "react";
import {
  me,
  getAnalyticsSummary,
  type AnalyticsSummary,
} from "../lib/api";

// Simple presets for date range
type RangeKey = "7d" | "30d" | "90d" | "all";

function computeRange(key: RangeKey) {
  const now = new Date();
  const to = new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    )
  );

  if (key === "all") {
    return { from: undefined as string | undefined, to: undefined as string | undefined };
  }

  const days =
    key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : 30;
  const fromDate = new Date(to);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString(),
    to: to.toISOString(),
  };
}

export default function Analytics() {
  const [org, setOrg] = useState<any | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [error, setError] = useState<string | null>(null);

  // Load org just for display + currency fallback
  useEffect(() => {
    (async () => {
      try {
        const data = await me();
        setOrg(data?.org || data || null);
      } catch (e) {
        console.error("[Analytics] me() failed", e);
      }
    })();
  }, []);

  const currency = useMemo(() => {
    // Prefer API summary currency, then org.currency_code, then AED
    if (summary?.currency) return summary.currency;
    if (org?.currency_code) return org.currency_code;
    return "AED";
  }, [summary?.currency, org?.currency_code]);

  async function loadAnalytics(selectedRange: RangeKey = rangeKey) {
    try {
      setLoading(true);
      setError(null);
      const r = computeRange(selectedRange);

      const summary = await getAnalyticsSummary({
        from: r.from,
        to: r.to,
      });

      setSummary(summary);
    } catch (e: any) {
      console.error("[Analytics] getAnalyticsSummary failed", e);
      setError(e?.message || "Failed to load analytics");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadAnalytics("30d");
  }, []);

  const displayRange = useMemo(() => {
    if (!summary?.range) return "";
    const from = summary.range.from
      ? new Date(summary.range.from).toLocaleDateString()
      : "—";
    const to = summary.range.to
      ? new Date(summary.range.to).toLocaleDateString()
      : "—";
    return `${from} – ${to}`;
  }, [summary?.range]);

  const paidRatePct = useMemo(() => {
    if (!summary) return 0;
    // If backend already gives 0–1, convert; otherwise assume %
    const r = summary.totals.paid_rate;
    return r <= 1 ? r * 100 : r;
  }, [summary]);

  return (
    <div className="h-[calc(100vh-140px)] rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            Store Analytics
          </div>
          <div className="text-xs text-slate-500">
            {org?.name ? (
              <>
                {org.name} · Currency:{" "}
                <span className="font-medium">{currency}</span>
              </>
            ) : (
              "Overall performance and sales"
            )}
          </div>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-slate-100 rounded-full p-1 text-[11px]">
          {([
            { key: "7d", label: "Last 7 days" },
            { key: "30d", label: "Last 30 days" },
            { key: "90d", label: "Last 90 days" },
            { key: "all", label: "All time" },
          ] as { key: RangeKey; label: string }[]).map((r) => (
            <button
              key={r.key}
              onClick={() => {
                setRangeKey(r.key);
                loadAnalytics(r.key);
              }}
              className={
                "px-3 py-1 rounded-full transition " +
                (rangeKey === r.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-700 hover:bg-white")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[12px]">
        {/* Status / errors */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {loading
              ? "Loading analytics…"
              : summary
              ? `Range: ${displayRange}`
              : "No analytics loaded yet"}
          </span>
          <button
            onClick={() => loadAnalytics()}
            disabled={loading}
            className="px-3 py-1 rounded-full border border-slate-200 text-[11px] bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Nothing yet */}
        {!loading && !summary && !error && (
          <div className="text-xs text-slate-500">
            No analytics data yet. Once you have paid orders with prices, your
            sales insights will appear here.
          </div>
        )}

        {summary && (
          <>
            {/* KPI cards */}
            <section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500 mb-1">
                    Total sales
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {currency} {summary.totals.total_sales.toFixed(2)}
                  </div>
                </div>

                <div className="border rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500 mb-1">
                    Paid orders
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {summary.totals.paid_orders}
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {paidRatePct.toFixed(1)}% of all orders
                  </div>
                </div>

                <div className="border rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500 mb-1">
                    Total orders
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {summary.totals.total_orders}
                  </div>
                </div>

                <div className="border rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500 mb-1">
                    Avg order value
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {currency} {summary.totals.avg_order_value.toFixed(2)}
                  </div>
                </div>
              </div>
            </section>

            {/* Breakdown sections */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {/* Top items */}
              <div className="border rounded-xl bg-white px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-slate-900 text-[13px]">
                    Top selling items
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Based on paid orders
                  </div>
                </div>

                {summary.items.top_items.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    No item-level sales yet.
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2 text-right">Qty</th>
                        <th className="py-1 text-right">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.items.top_items.slice(0, 10).map((it, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1 pr-2">
                            <span className="text-slate-900">
                              {idx + 1}. {it.label}
                            </span>
                          </td>
                          <td className="py-1 pr-2 text-right text-slate-700">
                            {it.qty}
                          </td>
                          <td className="py-1 text-right font-medium text-slate-900">
                            {currency} {it.sales.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top customers */}
              <div className="border rounded-xl bg-white px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-slate-900 text-[13px]">
                    Top customers
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Lifetime value in this range
                  </div>
                </div>

                {summary.customers.top_customers.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    No customer-level sales yet.
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-1 pr-2">Customer</th>
                        <th className="py-1 pr-2 text-right">Orders</th>
                        <th className="py-1 text-right">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.customers.top_customers
                        .slice(0, 10)
                        .map((c, idx) => (
                          <tr key={c.customer_key} className="border-b last:border-0">
                            <td className="py-1 pr-2">
                              <div className="text-slate-900">
                                {idx + 1}. {c.name || c.phone || "Customer"}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {c.phone}
                              </div>
                            </td>
                            <td className="py-1 pr-2 text-right text-slate-700">
                              {c.orders}
                            </td>
                            <td className="py-1 text-right font-medium text-slate-900">
                              {currency} {c.sales.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}