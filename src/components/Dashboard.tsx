// src/components/Dashboard.tsx  (Premium UI only)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listOrders, me, OrderStatus } from "../lib/api";
import OrderCard from "./OrderCard";

export default function Dashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  const statusParams = useMemo(
    () => (status === "all" ? undefined : { status }),
    [status]
  );

  async function refresh() {
    try {
      setLoading(true);
      const d = await listOrders(statusParams as any);
      setOrders(Array.isArray(d) ? d : []);
      if (!org) {
        const m = await me();
        setOrg(m);
      }
    } catch (e) {
      console.error("dashboard refresh failed", e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(refresh, 12000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const Seg = ({
    value,
    label,
  }: {
    value: "all" | OrderStatus;
    label: string;
  }) => {
    const active = status === value;
    const tone =
      value === "pending"
        ? "text-amber-800 bg-amber-50 border-amber-200"
        : value === "shipped"
        ? "text-blue-800 bg-blue-50 border-blue-200"
        : value === "paid"
        ? "text-emerald-800 bg-emerald-50 border-emerald-200"
        : "text-gray-700 bg-white border-gray-200";
    return (
      <button
        onClick={() => setStatus(value)}
        className={`rounded-full border px-3 py-1.5 text-sm transition ${
          active ? tone : "text-gray-700 bg-white border-gray-200 hover:bg-gray-50"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-8">
      {/* sticky block inside app area */}
      <div className="sticky top-14 z-10 -mx-3 mb-3 bg-white/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[11px] text-gray-500">Workspace</div>
            <div className="truncate text-[14px] font-semibold text-gray-900">
              {org?.name || "—"}
            </div>
            <div className="text-[11px] text-gray-400">WA ID: {org?.wa_phone_number_id || "—"}</div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Seg value="all" label="All" />
            <Seg value="pending" label="Pending" />
            <Seg value="shipped" label="Shipped" />
            <Seg value="paid" label="Paid" />
          </div>
        </div>

        {org?.plan === "free" && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[12px] text-gray-700">
            <div>
              <b>Free plan:</b> 25 orders/day
            </div>
            <div className="text-gray-600">
              Upgrade to <b>Pro</b> for unlimited orders + PDF invoices.{" "}
              <a href="mailto:sales@tropicalglow.in" className="text-blue-600 hover:underline">
                sales@tropicalglow.in
              </a>
            </div>
          </div>
        )}
      </div>

      {/* content */}
      {loading && orders.length === 0 ? (
        // simple skeletons (no extra libs)
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[100px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100/60"
            />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <div className="grid gap-2">
          {orders.map((o) => (
            <OrderCard key={o.id} o={o} onChange={refresh} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
          <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-200 to-emerald-200" />
          <div className="text-sm font-semibold text-gray-800">No orders yet</div>
          <div className="mt-1 text-[13px] text-gray-600">
            Send a WhatsApp message or voice note to your mapped number.
          </div>
        </div>
      )}
    </div>
  );
}