// src/components/Dashboard.tsx

import { useEffect, useMemo, useState } from "react";
import api, {
  Order,
  listOrders,
  logout as apiLogout,
  me as apiMe,
} from "../lib/api";

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

export default function Dashboard() {
  const [org, setOrg] = useState<any | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

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

  const refreshOrders = async () => {
    if (!orgId) return;
    try {
      const data = await listOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[Dashboard] refreshOrders failed", e);
    }
  };

  // ───────────────── WABA: conversations ─────────────────
  async function loadConversations() {
    if (!isWaba || !orgId) return;
    try {
      setLoadingConvos(true);
      // Backend usually returns an array already (per your /api/inbox/conversations),
      // but normalize defensively in case it returns { ok, conversations }.
      const { data } = await api.get("/api/inbox/conversations", {
        params: { org_id: orgId },
      });
      const arr =
        Array.isArray(data) ? data : Array.isArray((data as any)?.conversations)
        ? (data as any).conversations
        : [];
      setConversations(arr as Conversation[]);
    } catch (e) {
      console.error("[Inbox] conversations failed", e);
      setConversations([]);
    } finally {
      setLoadingConvos(false);
    }
  }

  useEffect(() => {
    loadConversations();
    // small auto-refresh (optional): refresh every 15s
    // clear on unmount
    const t = setInterval(() => {
      loadConversations();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaba, orgId]);

  // ───────────────── helpers ─────────────────
  const normalizePhone = (v: string | null | undefined): string =>
    v ? String(v).replace(/[^\d]/g, "") : "";

  // For WABA: latest order for selected conversation’s number
  const activeOrder: Order | null = useMemo(() => {
    if (!isWaba || !selected || !orders.length) return null;
    const selPhone = normalizePhone(selected.customer_phone);
    const candidates = orders
      .filter((o) => normalizePhone(o.source_phone) === selPhone)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
    return candidates[0] || null;
  }, [isWaba, selected, orders]);

  const loadMessages = async (c: Conversation) => {
    if (!isWaba || !orgId) return;
    try {
      setLoadingMessages(true);
      const { data } = await api.get("/api/inbox/messages", {
        params: { phone: c.customer_phone, org_id: orgId },
      });
      const arr = Array.isArray(data) ? data : [];
      setMessages(arr as Message[]);
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
    if (isWaba) loadMessages(c);
  };

  const appendToInput = (snippet: string) => {
    setInput((prev) => (prev ? `${prev} ${snippet}` : snippet));
  };

  const handleSend = async () => {
    if (!isWaba || !orgId || !selected || !input.trim()) return;
    const text = input.trim();
    setSending(true);
    try {
      // optimistic bubble
      const optimistic: Message = {
        id: `local-${Date.now()}`,
        from: "store",
        text,
        ts: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);
  
      // backend expects { org_id, phone, text }
      const phonePlain = String(selected.customer_phone || "").replace(/^\+/, "");
      await api.post("/api/inbox/send", {
        org_id: orgId,
        phone: phonePlain,   // ✅ changed from `to` → `phone`
        text,
      });
  
      setInput("");
      await loadMessages(selected); // refresh the right pane
    } catch (e) {
      console.error("[Inbox] send failed", e);
    } finally {
      setSending(false);
    }
  };

  const handleLogout = () => {
    apiLogout();
    window.location.reload();
  };

  // ───────────────── NON-WABA (local_bridge etc.) UI ─────────────────
  if (!isWaba && org && !orgError) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Topbar authed={true} onLogout={handleLogout} />
        <div className="px-6 pt-4 text-xs text-slate-500">
          Logged in as <span className="font-semibold">{org.name}</span>{" "}
          {org.phone && <span>({org.phone})</span>} &mdash; mode:{" "}
          <span className="font-semibold">
            {org.ingest_mode || "local_bridge"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingOrders && (
            <div className="text-slate-500 text-sm">Loading orders…</div>
          )}

          {!loadingOrders && orders.length === 0 && (
            <div className="text-slate-500 text-sm">
              No orders yet. When customers send messages via your mobile
              bridge, parsed orders will appear here.
            </div>
          )}

          {orders.map((o) => (
            <div key={o.id} className="max-w-4xl mx-auto">
              <OrderCard o={o as any} onChange={refreshOrders} modeHint="local" />
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
      {/* Optional Topbar */}
      {/* <Topbar authed={true} onLogout={handleLogout} /> */}

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
        {/* LEFT: conversations */}
        <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-3 py-2 border-b border-slate-200 text-[11px] font-semibold">
            INBOX
          </div>
          <div className="flex-1 overflow-y-auto text-[10px]">
            {loadingConvos && (
              <div className="p-3 text-slate-400">Loading conversations…</div>
            )}
            {!loadingConvos && (!Array.isArray(conversations) || conversations.length === 0) && (
              <div className="p-3 text-slate-400">
                When customers message your WhatsApp number, chats appear here.
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
              <div className="w-full max-w-4xl text-[11px] text-slate-500 mb-1">
                AI has parsed this customer’s messages into an order. Review &
                adjust items below. Replies you send here go back via WhatsApp.
              </div>

              <div className="w-full max-w-4xl">
                {loadingOrders && (
                  <div className="text-[11px] text-slate-500">
                    Loading order…
                  </div>
                )}
                {activeOrder ? (
                  <OrderCard
                    o={activeOrder as any}
                    onChange={refreshOrders}
                    modeHint="waba"
                  />
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No parsed order yet for this chat. Ask the customer for
                    their list; AI will convert it to an order.
                  </div>
                )}
              </div>

              {/* Smart reply chips */}
              <div className="w-full max-w-4xl mt-2 space-y-2">
                {selected && (
                  <>
                    <div className="flex flex-wrap gap-2 text-[9px]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPricePanel((v) => !v);
                          setShowAvailPanel(false);
                        }}
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
                        onClick={() => appendToInput("Thank you 🙏")}
                        className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-slate-50"
                      >
                        👍 Thanks
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          appendToInput(
                            "Your total is ___ AED. Please confirm."
                          )
                        }
                        className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-slate-50"
                      >
                        🧾 Send bill
                      </button>
                    </div>

                    {/* Slide-down panels only when clicked */}
                    {showPricePanel && (
                      <div className="mt-2">
                        <QuickReplyPrice phone={selected.customer_phone} />
                      </div>
                    )}
                    {showAvailPanel && (
                      <div className="mt-2">
                        <QuickReplyAvailability phone={selected.customer_phone} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Composer */}
              <div className="w-full max-w-4xl mt-auto pt-3 border-t border-slate-200">
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
              Select a conversation from the left to see the AI-parsed order
              and reply to the customer.
            </div>
          )}
        </div>

        {/* RIGHT: optional full chat view */}
        {showChat && (
          <div className="w-72 border-l border-slate-200 bg-white flex flex-col">
            <div className="px-3 py-2 border-b border-slate-200 text-[10px] font-semibold">
              Full chat with{" "}
              {selected
                ? selected.customer_name || selected.customer_phone
                : "—"}
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-[9px]">
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
        )}
      </div>
    </div>
  );
}