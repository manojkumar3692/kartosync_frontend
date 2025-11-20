// src/components/Dashboard.tsx

import { useEffect, useMemo, useState } from "react";
import api, {
  listOrders,
  logout as apiLogout,
  me as apiMe,
  sendInboxMessage,
  sendPaymentQR,
  setOrgAutoReply,
  getCustomerAutoReply,
  setCustomerAutoReply,
  markInquiryResolved,
} from "../lib/api";

export type Order = any;
import InquiryCard, { InquiryInfo } from "./InquiryCard";

import OrderCard from "./OrderCard";
import QuickReplyPrice from "./QuickReplyPrice";
import QuickReplyAvailability from "./QuickReplyAvailability";
import Topbar from "./Topbar";

type Conversation = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_text: string | null;
  last_ts: string;
};

type Message = {
  id: string;
  from: "customer" | "store";
  text: string;
  ts: string;
};

type InquiryKind = "price" | "availability" | "menu" | "other";

type InquirySnapshot = {
  text: string;
  kind: InquiryKind;
  canonical: string | null;
  at: string | null;
  status: "unresolved" | "resolved" | null;
};

export default function Dashboard() {
  const [org, setOrg] = useState<any | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

    // Filter for live vs past orders (non-WABA view)
   // "live" = pending + shipped, "past" = paid + cancelled, "all" = everything
   const [orderFilter, setOrderFilter] = useState<"live" | "past" | "all">(
    "live"
  );

  // WABA inbox state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(false);

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Quick reply panels (WABA center column)
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [showAvailPanel, setShowAvailPanel] = useState(false);

  // When a customer has multiple orders, allow switching between them
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // NEW: Auto-reply toggle state (org-level)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean | null>(
    null
  );
  const [autoReplySaving, setAutoReplySaving] = useState(false);

  // NEW: Auto-reply per customer (WABA only)
  const [autoReplyMap, setAutoReplyMap] = useState<Record<string, boolean>>({});
  const [autoReplyBusy, setAutoReplyBusy] = useState(false);
  const [lastInquiry, setLastInquiry] = useState<InquiryInfo | null>(null);


  const lastMessageKey = useMemo(
    () => (messages.length ? messages[messages.length - 1].id : null),
    [messages]
  );


    // 🔹 Derived per-customer value using map + org fallback
    const phoneKey = selected?.customer_phone
    ? selected.customer_phone.replace(/[^\d]/g, "")
    : "";

  const customerAutoReply =
    phoneKey && phoneKey in autoReplyMap
      ? autoReplyMap[phoneKey]
      : autoReplyEnabled;



      const showInquiryCard = !!(
        selected &&
        lastInquiry &&
        lastInquiry.last_inquiry_status !== "resolved"
      );

  // ───────────────── org + auth ─────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await apiMe();
        setOrg(data?.org || data || null);
      } catch (e: any) {
        console.error("[Dashboard] me() failed", e);
        setOrgError("Could not detect org. Please log in again.");
      }
    })();
  }, []);

  const orgId = org?.id as string | undefined;
  const ingestMode = (org?.ingest_mode || "").toLowerCase();
  const isWaba = !!org && ingestMode === "waba";

  // NEW: initialise auto-reply from org (if backend returns it)
  useEffect(() => {
    if (!org) return;
    if (typeof org.auto_reply_enabled === "boolean") {
      setAutoReplyEnabled(org.auto_reply_enabled);
    } else {
      // default ON if not provided
      setAutoReplyEnabled(true);
    }
  }, [org]);

  // ───────────────── orders ─────────────────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        setLoadingOrders(true);
        const data = await listOrders();
        setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("[Dashboard] listOrders failed", e);
      } finally {
        setLoadingOrders(false);
      }
    })();
  }, [orgId]);


  useEffect(() => {
    if (!isWaba || !orgId || !selected) return;
  
    const t = setInterval(() => {
      loadMessages(selected);
    }, 12000); // or 5000 if you want faster
  
    return () => clearInterval(t);
  }, [isWaba, orgId, selected?.customer_phone]);


// NEW: Per-customer auto-reply status + last enquiry snapshot
useEffect(() => {
  if (!isWaba || !orgId || !selected?.customer_phone) return;

  const phoneKey = selected.customer_phone.replace(/[^\d]/g, "");

  (async () => {
    try {
      const state = await getCustomerAutoReply(orgId, phoneKey);

      // 1) auto-reply ON/OFF
      setAutoReplyMap((prev) => ({
        ...prev,
        [phoneKey]: state.enabled,
      }));

      // 2) last enquiry snapshot (from org_customer_settings)
      if (state.last_inquiry_text) {
        setLastInquiry({
          last_inquiry_text: state.last_inquiry_text,
          last_inquiry_kind: state.last_inquiry_kind ?? null,
          last_inquiry_canonical: state.last_inquiry_canonical ?? null,
          last_inquiry_at: state.last_inquiry_at ?? null,
          last_inquiry_status: state.last_inquiry_status ?? null,
        });
      } else {
        setLastInquiry(null);
      }
    } catch (e) {
      console.error("[Dashboard] getCustomerAutoReply failed", e);
      setLastInquiry(null);
    }
  })();
}, [isWaba, orgId, selected?.customer_phone, lastMessageKey]);

  const refreshOrders = async () => {
    if (!orgId) return;
    try {
      const data = await listOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[Dashboard] refreshOrders failed", e);
    }
  };

  // 4️⃣ Per-customer auto-reply route usage
  const handleToggleCustomerAutoReply = async (phoneRaw: string) => {
    if (!orgId || !phoneRaw) return;
    const phoneKey = phoneRaw.replace(/[^\d]/g, "");
  
    const current = autoReplyMap[phoneKey] ?? true;
    const next = !current;
  
    setAutoReplyBusy(true);
    setAutoReplyMap((prev) => ({ ...prev, [phoneKey]: next }));
  
    try {
      await setCustomerAutoReply(orgId, phoneKey, next);
    } catch (e) {
      console.error("[Dashboard] customer auto-reply toggle failed", e);
      setAutoReplyMap((prev) => ({ ...prev, [phoneKey]: current }));
      alert("Could not update auto-reply for this customer. Please try again.");
    } finally {
      setAutoReplyBusy(false);
    }
  };

  // ───────────────── WABA: conversations ─────────────────
  async function loadConversations() {
    if (!isWaba || !orgId) return;
    try {
      setLoadingConvos(true);
      const { data } = await api.get("/api/inbox/conversations", {
        params: { org_id: orgId },
      });
      const arr: Conversation[] = Array.isArray(data)
        ? (data as Conversation[])
        : Array.isArray((data as any)?.conversations)
        ? ((data as any).conversations as Conversation[])
        : [];

      setConversations(arr);

      // Auto-select first chat if nothing selected yet (EXISTING BEHAVIOUR)
      if (!selected && arr.length > 0) {
        const first = arr[0];
        setSelected(first);
        setSelectedOrderId(null);
        await loadMessages(first);
      }

      // 🔹 NEW: keep center order card in sync with inbox polling
      await refreshOrders();   // <—— ADD THIS LINE

    } catch (e) {
      console.error("[Inbox] conversations failed", e);
      setConversations([]);
    } finally {
      setLoadingConvos(false);
    }
  }

  useEffect(() => {
    loadConversations();
    const t = setInterval(() => {
      loadConversations();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaba, orgId]);

  // ───────────────── helpers ─────────────────
  const normalizePhone = (v: string | null | undefined): string =>
    v ? String(v).replace(/[^\d]/g, "") : "";

  // All orders for this customer (by phone)
  const customerOrders: Order[] = useMemo(() => {
    if (!isWaba || !selected || !orders.length) return [];
    const selPhone = normalizePhone(selected.customer_phone);
    return orders
      .filter((o) => normalizePhone(o.source_phone) === selPhone)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [isWaba, selected, orders]);

   // For WABA: live vs past orders *per customer*
   const liveCustomerOrders: Order[] = useMemo(
    () =>
      customerOrders.filter(
        (o) => o.status === "pending" || o.status === "shipped"
      ),
    [customerOrders]
  );

  const pastCustomerOrders: Order[] = useMemo(
    () =>
      customerOrders.filter(
        (o) => o.status === "paid" || o.status === "cancelled"
      ),
    [customerOrders]
  );

  // Active = same as "live" for merge button etc.
  const activeOrders: Order[] = liveCustomerOrders;

  // What to show in WABA order history / chips based on filter
  const visibleCustomerOrders: Order[] = useMemo(() => {
    if (orderFilter === "live") return liveCustomerOrders;
    if (orderFilter === "past") return pastCustomerOrders;
    return customerOrders;
  }, [orderFilter, liveCustomerOrders, pastCustomerOrders, customerOrders]);

  // Reset selected order when switching conversations
  useEffect(() => {
    setSelectedOrderId(null);
  }, [selected?.customer_phone]);

   // For WABA: main active order for the center card
  // Only treat pending + shipped as "active".
  const activeOrder: Order | null = useMemo(() => {
    if (!customerOrders.length) return null;

    // If the user manually picked an order chip, respect that.
    if (selectedOrderId) {
      const found = customerOrders.find((o) => o.id === selectedOrderId);
      if (found) return found;
    }

    // Otherwise, auto-pick the first *live* order only
    const open = customerOrders.filter(
      (o) => o.status === "pending" || o.status === "shipped"
    );
    return open[0] || null; // 👈 no fallback to a paid/cancelled order
  }, [customerOrders, selectedOrderId]);

  
    // Show the center inquiry card only when:
    //  - we have a selected chat
    //  - last message looks like an inquiry
    //  - and auto-reply is OFF for this customer (AI paused)
    // const showInquiryCard = !!(
    //   selected &&
    //   lastCustomerMessage &&
    //   lastInquiryKind &&
    //   customerAutoReply === false
    // );


  // NEW: “customer may need help” heuristic
  const needsHelp = useMemo(() => {
    if (!activeOrder) return false;
    const pr = (activeOrder as any).parse_reason
      ? String((activeOrder as any).parse_reason).toLowerCase()
      : "";
    const lr = (activeOrder as any).link_reason
      ? String((activeOrder as any).link_reason).toLowerCase()
      : "";
    const blob = `${pr} ${lr}`;
    const hints = [
      "needs_help",
      "need_help",
      "update_order",
      "update-order",
      "human_fix",
      "human-review",
      "manual_review",
      "human review",
    ];
    return hints.some((h) => blob.includes(h));
  }, [activeOrder]);

  const loadMessages = async (c: Conversation) => {
    if (!isWaba || !orgId) return;
    try {
      setLoadingMessages(true);
      const { data } = await api.get("/api/inbox/messages", {
        params: { phone: c.customer_phone, org_id: orgId },
      });
  
      const rawArr = Array.isArray(data) ? data : [];
  
      const mapped: Message[] = rawArr.map((m: any) => {
        const from: "customer" | "store" =
          m.from ??
          (m.direction === "in" || m.sender_type === "customer"
            ? "customer"
            : "store");
  
        const text: string = m.text ?? m.body ?? "";
  
        const ts: string = m.ts ?? m.created_at ?? new Date().toISOString();
  
        return {
          id: String(m.id || m.wa_msg_id || `${from}-${ts}-${text}`),
          from,
          text,
          ts,
        };
      });
  
      // 🔹 DEDUPE HERE – avoid duplicate bubbles for the same message
      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        const key = `${m.from}|${m.text}|${m.ts}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  
      setMessages(deduped);
    } catch (e) {
      console.error("[Inbox] messages failed", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectConversation = (c: Conversation) => {
    setSelected(c);
    setShowPricePanel(false);
    setShowAvailPanel(false);
    setSelectedOrderId(null);
    if (isWaba) loadMessages(c);
  };

  const appendToInput = (snippet: string) => {
    setInput((prev) => (prev ? `${prev} ${snippet}` : snippet));
  };

  const handleSend = async () => {
    if (!isWaba || !orgId || !selected || !input.trim()) return;
    const text = input.trim();
    setSending(true);
  
    // Normalize once and reuse
    const phonePlain = String(selected.customer_phone || "").replace(/^\+/, "");
  
    try {
      const optimistic: Message = {
        id: `local-${Date.now()}`,
        from: "store",
        text,
        ts: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);
  
      // Use wrapper
      await sendInboxMessage(orgId, phonePlain, text);
  
      setInput("");
      await loadMessages(selected);
  
      // If auto-reply was ON for this customer, turn it OFF after human reply
      if (customerAutoReply) {
        await handleToggleCustomerAutoReply(selected.customer_phone);
      }
  
      // If there was an unresolved inquiry, mark it resolved (locally + backend)
      if (showInquiryCard && lastInquiry) {
        // Optimistic local update – hide card immediately
        setLastInquiry((prev) =>
          prev ? { ...prev, last_inquiry_status: "resolved" } : prev
        );
  
        try {
          await markInquiryResolved(
            orgId,
            phonePlain,
            lastInquiry.last_inquiry_at ?? null,
            lastInquiry.last_inquiry_canonical ?? null
          );
        } catch (e) {
          console.error("[Dashboard] mark inquiry resolved failed", e);
          // no UI rollback needed – a fresh reload will re-sync
        }
      }
    } catch (e) {
      console.error("[Inbox] send failed", e);
    } finally {
      setSending(false);
    }
  };

  // Merge the *current* active order into the previous open order (backend: /:id/merge-previous)
  const handleMergeActiveOrders = async () => {
    // 🔹 Only merge PENDING orders, ignore shipped/paid/cancelled
    const pendingOrders = activeOrders.filter(
      (o) => o.status === "pending"
    );

    if (pendingOrders.length < 2) {
      alert("Need at least 2 pending orders to merge.");
      return;
    }
    if (!customerOrders.length) return;

    // Oldest → newest among ONLY pending orders
    const sorted = [...pendingOrders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const base = sorted[0]; // this pending order will survive

    const ok = window.confirm(
      `Merge all ${pendingOrders.length} pending orders into one order (#${base.id.slice(
        -5
      )}) for this customer?`
    );
    if (!ok) return;

    try {
      // From newest → oldest, merge each into its previous open order
      for (let i = sorted.length - 1; i >= 1; i--) {
        const o = sorted[i];
        await api.post(`/api/orders/${o.id}/merge-previous`, {});
      }

      await refreshOrders();
    } catch (e) {
      console.error("[Dashboard] merge-previous failed", e);
      alert("Could not merge pending orders. Please try again.");
    }
  };

  const handleLogout = () => {
    apiLogout();
    window.location.reload();
  };

  // NEW: Auto-reply toggle → backend flag (ORG LEVEL)
  const handleToggleAutoReply = async () => {
    if (!orgId || autoReplyEnabled == null) return;
    const next = !autoReplyEnabled;
    setAutoReplyEnabled(next);
    setAutoReplySaving(true);
    try {
      const state = await setOrgAutoReply(orgId, next);
      if (typeof state.auto_reply_enabled === "boolean") {
        setAutoReplyEnabled(state.auto_reply_enabled);
      }
    } catch (e) {
      console.error("[Dashboard] toggle auto-reply failed", e);
      setAutoReplyEnabled(!next); // revert
      alert("Could not update auto-reply setting. Please try again.");
    } finally {
      setAutoReplySaving(false);
    }
  };
        // Smoothly open the QuickReplyPrice panel and scroll it into view
  const openPricePanel = () => {
    setShowAvailPanel(false);
    setShowPricePanel(true);
    // scroll next tick so DOM has the element
    setTimeout(() => {
      const el = document.getElementById("quick-price-panel");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 50);
  };

  // Handler for the 💸 chip – toggles open/close but scrolls when opening
  const handlePriceChipClick = () => {
    if (showPricePanel) {
      setShowPricePanel(false);
      return;
    }
    openPricePanel();
  };

  // Greeting helper for quick replies (EXISTING)
  const customerName = selected?.customer_name?.trim() || "";
  const greeting = customerName ? `Hi ${customerName},` : "Hi,";
  console.log("ORG:", org);
  console.log("ORG IN DASHBOARD BUTTON:", org);

   // ───────────────── NON-WABA (local_bridge etc.) UI ─────────────────
   if (!isWaba && org && !orgError) {
    // derive live vs past lists for this org
    const liveOrders = orders.filter(
      (o) => o.status === "pending" || o.status === "shipped"
    );
    const pastOrders = orders.filter(
      (o) => o.status === "paid" || o.status === "cancelled"
    );
    const visibleOrders =
      orderFilter === "live"
        ? liveOrders
        : orderFilter === "past"
        ? pastOrders
        : orders;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Topbar authed={true} onLogout={handleLogout} />

        {/* Header with org info */}
        <div className="px-6 pt-4 text-xs text-slate-500 flex items-center justify-between">
          <div>
            Logged in as <span className="font-semibold">{org.name}</span>{" "}
            {org.phone && <span>({org.phone})</span>} &mdash; mode:{" "}
            <span className="font-semibold">
              {org.ingest_mode || "local_bridge"}
            </span>
          </div>

          {/* Simple filter pills: Live / Past / All */}
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1 py-[2px] text-[11px]">
            <button
              type="button"
              onClick={() => setOrderFilter("live")}
              className={
                "px-3 py-1 rounded-full transition " +
                (orderFilter === "live"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white")
              }
            >
              Live orders ({liveOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrderFilter("past")}
              className={
                "px-3 py-1 rounded-full transition " +
                (orderFilter === "past"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white")
              }
            >
              Past (paid/cancelled) ({pastOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrderFilter("all")}
              className={
                "hidden sm:inline-flex px-3 py-1 rounded-full transition " +
                (orderFilter === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:bg-white")
              }
            >
              All ({orders.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingOrders && (
            <div className="text-slate-500 text-sm">Loading orders…</div>
          )}

          {!loadingOrders && visibleOrders.length === 0 && (
            <div className="text-slate-500 text-sm">
             {orderFilter === "past"
                ? "No past orders yet (paid/cancelled)."
                : orderFilter === "live"
                ? "No active orders. New orders will appear here."
                : "No orders yet. When customers send messages via your mobile bridge, parsed orders will appear here."}
            </div>
          )}

          {visibleOrders.map((o) => (
            <div key={o.id} className="max-w-4xl mx-auto">
              <OrderCard
                o={o as any}
                onChange={refreshOrders}
                modeHint="local"
                orgId={orgId!}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ───────────────── ORG ERROR / LOADING ─────────────────
  if (orgError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="space-y-3 textcenter">
          <div className="text-sm">{orgError}</div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs"
          >
            Go to login
          </button>
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

  // ───────────────── WABA UI ─────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <div className="px-6 pt-3 pb-1 flex items-center justify-between text-[11px] text-slate-500">
        <div>
          Logged in as{" "}
          <span className="font-semibold">{org.name || "WhatsApp Store"}</span>{" "}
          {org.wa_phone_number_id && (
            <span className="ml-1">(WA ID {org.wa_phone_number_id})</span>
          )}
          <span className="ml-2 px-2 py-[2px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            AI + WhatsApp Cloud API
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Org-level Auto-reply toggle pill (UNCHANGED behaviour) */}
          <button
            onClick={handleToggleAutoReply}
            disabled={autoReplyEnabled == null || autoReplySaving}
            className={
              "flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] " +
              (autoReplyEnabled
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-500")
            }
            title="Toggle auto-reply behaviour for this WhatsApp number"
          >
            <span
              className={
                "inline-block h-2 w-2 rounded-full " +
                (autoReplyEnabled ? "bg-emerald-500" : "bg-slate-400")
              }
            />
            {autoReplyEnabled ? "Auto-reply ON" : "Auto-reply OFF"}
          </button>

          <span className="text-[10px] text-slate-400">
            {showChat
              ? "Chat view visible — you can reply from web."
              : "Chat hidden — AI still handles parsing."}
          </span>
          <button
            onClick={() => setShowChat((v) => !v)}
            className="px-3 py-[5px] rounded-full border text-[10px] bg-white hover:bg-slate-50"
          >
            {showChat ? "Hide chat view" : "Show chat view"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: conversations (UNCHANGED) */}
        <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-3 py-2 border-b border-slate-200 text-[11px] font-semibold">
            INBOX
          </div>
          <div className="flex-1 overflow-y-auto text-[10px]">
            {loadingConvos && (
              <div className="p-3 text-slate-400">Loading conversations…</div>
            )}
            {!loadingConvos &&
              (!Array.isArray(conversations) || conversations.length === 0) && (
                <div className="p-3 text-slate-400">
                  When customers message your WhatsApp number, chats appear
                  here.
                </div>
              )}
            {Array.isArray(conversations) &&
              conversations.map((c) => {
                const isActive = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectConversation(c)}
                    className={
                      "w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 " +
                      (isActive ? "bg-slate-100" : "")
                    }
                  >
                    <div className="font-semibold text-[10px]">
                      {c.customer_name || c.customer_phone}
                    </div>
                    <div className="text-[9px] text-slate-500 truncate">
                      {c.last_text}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* CENTER: big order card + smart replies + composer */}
        <div className="flex-1 flex flex-col items-center overflow-y-auto px-6 py-4 gap-3">
          {selected ? (
            <>
              {/* Header + per-customer auto-reply toggle */}
              <div className="w-full flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <div>
                  AI has parsed this customer’s messages into an order. Review &
                  adjust items below. Replies you send here go back via
                  WhatsApp.
                </div>

                <button
                  disabled={!selected || autoReplyBusy}
                  onClick={() =>
                    selected &&
                    handleToggleCustomerAutoReply(selected.customer_phone)
                  }
                  className={
                    "px-2 py-[3px] rounded-full border text-[9px] " +
                    (customerAutoReply
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-slate-100 border-slate-200 text-slate-500")
                  }
                >
                  {customerAutoReply
                    ? "Auto-reply for this customer: ON"
                    : "Auto-reply for this customer: OFF"}
                </button>
              </div>

              {/* Multi-order banner & history (EXISTING) */}
              {customerOrders.length > 1 && (
                <div className="w-full mb-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] text-indigo-900 flex items-center justify-between gap-2">
                  <div>
                    This customer has <b>{customerOrders.length} orders</b>
                    {activeOrders.length > 0 && (
                      <>
                        {" "}
                        · <b>{activeOrders.length}</b> active
                      </>
                    )}
                    .
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {visibleCustomerOrders.map((ord) => (
                      <button
                        key={ord.id}
                        onClick={() => setSelectedOrderId(ord.id)}
                        className={
                          "rounded-full border px-2 py-[2px] text-[10px] " +
                          (activeOrder?.id === ord.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-100")
                        }
                        title={new Date(ord.created_at).toLocaleString()}
                      >
                        #{ord.id.slice(-5)} · {ord.status} ·{" "}
                        {(ord.items || []).length} items
                      </button>
                    ))}

                    {/* NEW: merge active orders action */}
                    {activeOrders.length >= 2 && (
                      <button
                        type="button"
                        onClick={handleMergeActiveOrders}
                        className="ml-1 rounded-full border px-2 py-[2px] text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                        title="Merge active orders into one"
                      >
                        🔗 Merge active
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* NEW: “Needs help / human review” banner */}
              {needsHelp && (
                <div className="w-full mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900">
                  <div>
                    AI flagged this order for{" "}
                    <span className="font-semibold">human review</span>. The
                    customer may be stuck or requested an update.
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      className="rounded-full border border-indigo-300 bg-white px-2 py-[3px] hover:bg-indigo-100"
                    >
                      🔎 Review items
                    </button>
                    {autoReplyEnabled && (
                      <button
                        type="button"
                        onClick={handleToggleAutoReply}
                        disabled={autoReplySaving}
                        className="rounded-full border border-indigo-300 bg-indigo-600 px-2 py-[3px] text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        Pause auto-reply
                      </button>
                    )}
                  </div>
                </div>
              )}



<div className="w-full space-y-2">
  {loadingOrders && (
    <div className="text-[11px] text-slate-500">Loading order…</div>
  )}

  {/* CASE 1: No active order → show enquiry FIRST (if any), then the "no order" hint */}
  {!activeOrder && (
    <>
      {showInquiryCard && lastInquiry?.last_inquiry_text && (
        <div className="w-full flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-1">
              <span>❓ Customer question</span>
              <span className="text-[9px] px-2 py-[1px] rounded-full bg-amber-100 border border-amber-200">
              {customerAutoReply === false ? "AI paused" : "AI active"}
              </span>
            </div>
            <div className="text-[10px] italic text-amber-900">
              “{lastInquiry.last_inquiry_text}”
            </div>
            <div className="text-[10px] text-amber-800">
              {lastInquiry.last_inquiry_kind === "price" &&
                "AI detected a price question and couldn’t auto-answer."}
              {lastInquiry.last_inquiry_kind === "availability" &&
                "AI detected an availability question and couldn’t auto-answer."}
              {lastInquiry.last_inquiry_kind === "menu" &&
                "AI detected a menu / price-list question and couldn’t auto-answer."}{" "}
              Please reply from here.
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[9px] shrink-0">
            {lastInquiry.last_inquiry_kind === "price" && (
              <button
                type="button"
                onClick={openPricePanel}
                className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
              >
                💸 Open price reply
              </button>
            )}
            {lastInquiry.last_inquiry_kind === "availability" && (
              <button
                type="button"
                onClick={() => {
                  setShowAvailPanel(true);
                  setShowPricePanel(false);
                }}
                className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
              >
                ✅ Availability reply
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const el =
                  document.querySelector<HTMLInputElement>(
                    'input[placeholder="Type a reply to send on WhatsApp…"]'
                  );
                if (el) el.focus();
              }}
              className="rounded-full border border-amber-300 bg-amber-600 px-2 py-[3px] text-white hover:bg-amber-500"
            >
              ✍️ Manual reply
            </button>
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-500">
        No parsed order yet for this chat. Ask the customer for
        their list; AI will convert it to an order.
      </div>
    </>
  )}

  {/* CASE 2: We have an active order → Order card first, then enquiry below it */}
  {activeOrder && (
    <>
      <OrderCard
        o={activeOrder as any}
        onChange={refreshOrders}
        modeHint="waba"
        orgId={orgId!}
      />

      {showInquiryCard && lastInquiry?.last_inquiry_text && (
        <div className="w-full flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-1">
              <span>❓ Customer question</span>
              <span className="text-[9px] px-2 py-[1px] rounded-full bg-amber-100 border border-amber-200">
              {customerAutoReply === false ? "AI paused" : "AI active"}
              </span>
            </div>
            <div className="text-[10px] italic text-amber-900">
              “{lastInquiry.last_inquiry_text}”
            </div>
            <div className="text-[10px] text-amber-800">
              {lastInquiry.last_inquiry_kind === "price" &&
                "AI detected a price question and couldn’t auto-answer."}
              {lastInquiry.last_inquiry_kind === "availability" &&
                "AI detected an availability question and couldn’t auto-answer."}
              {lastInquiry.last_inquiry_kind === "menu" &&
                "AI detected a menu / price-list question and couldn’t auto-answer."}{" "}
              Please reply from here.
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[9px] shrink-0">
            {lastInquiry.last_inquiry_kind === "price" && (
              <button
                type="button"
                onClick={openPricePanel}
                className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
              >
                💸 Open price reply
              </button>
            )}
            {lastInquiry.last_inquiry_kind === "availability" && (
              <button
                type="button"
                onClick={() => {
                  setShowAvailPanel(true);
                  setShowPricePanel(false);
                }}
                className="rounded-full border border-amber-300 bg-white px-2 py-[3px] hover:bg-amber-100 text-amber-900"
              >
                ✅ Availability reply
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const el =
                  document.querySelector<HTMLInputElement>(
                    'input[placeholder="Type a reply to send on WhatsApp…"]'
                  );
                if (el) el.focus();
              }}
              className="rounded-full border border-amber-300 bg-amber-600 px-2 py-[3px] text-white hover:bg-amber-500"
            >
              ✍️ Manual reply
            </button>
          </div>
        </div>
      )}
    </>
  )}
</div>

              {/* Smart reply chips (UNCHANGED, width full) */}
              <div className="w-full mt-2 space-y-2">
                {selected && (
                  <>
                    <div className="flex flex-wrap gap-2 text-[9px]">
                    <button
  type="button"
  onClick={handlePriceChipClick}
  className={
    "px-3 py-1 rounded-full border text-[9px] " +
    (showPricePanel
      ? "bg-purple-600 text-white border-purple-600"
      : "bg-slate-100 border-slate-200 hover:bg-slate-50")
  }
>
  💸 Price reply
</button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAvailPanel((v) => !v);
                          setShowPricePanel(false);
                        }}
                        className={
                          "px-3 py-1 rounded-full border text-[9px] " +
                          (showAvailPanel
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-100 border-slate-200 hover:bg-slate-50")
                        }
                      >
                        ✅ Availability reply
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          appendToInput(
                            customerName
                              ? `Thank you ${customerName} 🙏`
                              : "Thank you 🙏"
                          )
                        }
                        className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-slate-50"
                      >
                        👍 Thanks
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          appendToInput(
                            `${greeting} your total is ___ AED. Please confirm.`
                          )
                        }
                        className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-slate-50"
                      >
                        🧾 Send bill
                      </button>
                      {org?.payment_enabled ? (
                        <button
                          onClick={async () => {
                            if (!orgId) return alert("Org missing");
                            if (!activeOrder) return alert("No order selected");

                            const r = await sendPaymentQR(
                              orgId,
                              activeOrder.id
                            );
                            if (!r.ok) {
                              alert(r.error || "Failed to send payment QR");
                            } else {
                              alert("Payment QR sent to customer!");
                            }
                          }}
                          className="px-3 py-1 rounded-full bg-purple-600 text-white text-[10px]"
                        >
                          📱 Send Payment QR
                        </button>
                      ) : null}
                    </div>

                    {/* Slide-down panels only when clicked (UNCHANGED) */}
                    {showPricePanel && (
  <div className="mt-2" id="quick-price-panel">
    <QuickReplyPrice
      mode="waba"
      orgId={orgId}
      phone={selected.customer_phone}
      customerName={selected.customer_name}
      currency="AED"
    />
  </div>
)}
                    {showAvailPanel && (
                      <div className="mt-2">
                        <QuickReplyAvailability
                          phone={selected.customer_phone}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Composer (UNCHANGED, width full) */}
              <div className="w-full mt-auto pt-3 border-t border-slate-200">
                <div className="flex items-center gap-3">
                  <input
                    className="flex-1 bg-white border border-slate-300 rounded-full px-4 py-2 text-[11px] outline-none focus:border-emerald-500"
                    placeholder={
                      selected
                        ? "Type a reply to send on WhatsApp…"
                        : "Select a conversation"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={!selected || sending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!selected || sending || !input.trim()}
                    className={
                      "px-4 py-2 rounded-full text-[11px] font-semibold " +
                      (selected && input.trim()
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-slate-200 text-slate-500 cursor-not-allowed")
                    }
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-16 text-[12px] text-slate-500">
              Select a conversation from the left to see the AI-parsed order and
              reply to the customer.
            </div>
          )}
        </div>

                {/* RIGHT: full chat + NEW order history + analytics/settings */}
                {showChat && (
          <div className="w-72 border-l border-slate-200 bg-white flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-slate-200 text-[10px] font-semibold">
              Customer context
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3 text-[9px]">
              {/* 🔹 AI paused banner when auto-reply is OFF for this customer */}
              {selected && customerAutoReply === false && (
                <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-[2px] text-[9px] text-amber-800">
                  <span>🤖</span>
                  <span>AI paused for this customer (human handling)</span>
                </div>
              )}

              {/* Full chat (EXISTING UI, just wrapped) */}
              <div>
                <div className="mb-1 text-[10px] font-semibold text-slate-700">
                  Full chat with{" "}
                  {selected
                    ? selected.customer_name || selected.customer_phone
                    : "—"}
                </div>

                <div className="space-y-2">
                  {!selected && (
                    <div className="text-slate-400">
                      Pick a chat from the left.
                    </div>
                  )}

                  {selected && loadingMessages && (
                    <div className="text-slate-400">Loading messages…</div>
                  )}

                  {selected &&
                    !loadingMessages &&
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          "px-2 py-1 rounded-2xl max-w-[90%] " +
                          (m.from === "customer"
                            ? "bg-slate-100 text-slate-900"
                            : "ml-auto bg-emerald-500 text-white")
                        }
                      >
                        {m.text}
                        <div className="mt-[2px] text-[7px] text-slate-500">
                          {new Date(m.ts).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}