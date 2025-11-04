import React, { useEffect, useMemo, useRef, useState } from "react";
import { listOrders, me, OrderStatus } from "../lib/api";
import MapWhatsApp from "./MapWhatsApp";
import OrderCard from "./OrderCard";

export default function Dashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const timerRef = useRef<number | null>(null);

  const statusParams = useMemo(
    () => (status === "all" ? undefined : { status }),
    [status]
  );

  async function refresh() {
    try {
      const d = await listOrders(statusParams as any);
      setOrders(Array.isArray(d) ? d : []);
      if (!org) {
        const m = await me();
        setOrg(m);
      }
    } catch (e) {
      console.error("dashboard refresh failed", e);
      setOrders([]); // hard-guard to an array
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

  return (
    <div className="max-w-5xl mx-auto p-3">
      {/* header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[12px] text-gray-500">Workspace</div>
          <div className="font-semibold text-[14px]">{org?.name || "—"}</div>
          <div className="text-[11px] text-gray-400">WA ID: {org?.wa_phone_number_id || "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[12px] text-gray-500">
            Plan:{" "}
            <span className="border border-gray-200 bg-gray-50 px-2 py-0.5 rounded">
              {org?.plan || "—"}
            </span>
          </div>
          {/* If you want to enable WA mapping from web later:
          <div className="mt-1">
            <MapWhatsApp initial={org?.wa_phone_number_id} />
          </div> */}
        </div>
      </div>

      {/* status filter */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-sm text-gray-600">Filter:</span>
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="shipped">Shipped</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* plan info banner */}
      {org?.plan === "free" && (
        <div className="mb-3 mt-3 text-[12px] bg-amber-50 border border-amber-200 rounded-md p-2 text-gray-700">
          <div><b>Free plan limit:</b> 25 orders/day</div>
          <div>
            Upgrade to <b>Pro</b> for unlimited orders + PDF invoices.<br />
            <span className="text-gray-500">
              Contact{" "}
              <a href="mailto:sales@tropicalglow.in" className="text-blue-600 hover:underline">
                sales@tropicalglow.in
              </a>
            </span>
          </div>
        </div>
      )}

      {/* order list */}
      <div className="grid gap-2 mt-3">
        {orders.length > 0 ? (
          orders.map((o) => (
            <OrderCard key={o.id} o={o} onChange={refresh} />
          ))
        ) : (
          <div className="text-[13px] text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
            No orders yet. Send a WhatsApp message or voice note to your mapped number.
          </div>
        )}
      </div>
    </div>
  );
}