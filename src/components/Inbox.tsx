import { useEffect, useMemo, useRef, useState } from "react";
import {
  getInboxConversations,
  getInboxMessages,
  sendInboxMessage,
  getLatestOrderForPhone,
  me,
  type InboxConversation,
  type InboxMessage,
} from "../lib/api";

type Status = "NEW" | "PENDING" | "REPLIED";

function computeStatus(msgs: InboxMessage[]): Status {
  if (!msgs || msgs.length === 0) return "PENDING";
  const last = msgs[msgs.length - 1];
  // If last message is inbound (customer), it’s NEW
  if (last.direction === "in") return "NEW";
  // If last is outbound (you), it’s REPLIED
  return "REPLIED";
}

export default function Inbox() {
  const [org, setOrg] = useState<any>(null);
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<InboxMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pollMs] = useState(4000);
  const [latestOrder, setLatestOrder] = useState<any>(null);
  const lastSeenInboundId = useRef<string | null>(null);

  // Load org (for org_id)
  useEffect(() => {
    (async () => {
      const data = await me();
      setOrg(data?.org || data);
    })();
  }, []);

  // Load conversations
  async function refreshConvs() {
    if (!org?.id) return;
    const list = await getInboxConversations(org.id);
    setConvs(list);
    if (!activeId && list[0]?.id) setActiveId(list[0].id);
  }

  // Load messages for active conversation
  async function refreshMsgs() {
    if (!org?.id || !activeId) return;
    const m = await getInboxMessages(org.id, activeId);
    const prevLastInbound = lastSeenInboundId.current;
    setMsgs(m);

    // Desktop notify on NEW inbound
    const lastInbound = [...m].reverse().find((x) => x.direction === "in");
    if (lastInbound && lastInbound.id !== prevLastInbound) {
      lastSeenInboundId.current = lastInbound.id;
      maybeNotify("New WhatsApp message", lastInbound.body || "New message");
    }

    // AI reasoning side panel (latest order for this phone)
    const phone = (convs.find((c) => c.id === activeId)?.customer_phone) || null;
    if (phone) {
      const o = await getLatestOrderForPhone(org.id, phone);
      setLatestOrder(o);
    }
  }

  // Polling
  useEffect(() => {
    if (!org?.id) return;
    refreshConvs();
  }, [org?.id]);

  useEffect(() => {
    refreshMsgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const t = setInterval(() => {
      refreshConvs();
      refreshMsgs();
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, org?.id, activeId]);

  // Notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => void 0);
    }
  }, []);

  function maybeNotify(title: string, body: string) {
    if (!("Notification" in window)) return;
    if (document.visibilityState === "visible") return; // only when tab not focused
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }

  async function onSend() {
    const phone = convs.find((c) => c.id === activeId)?.customer_phone;
    if (!org?.id || !phone || !input.trim()) return;
    setLoading(true);
    try {
      await sendInboxMessage(org.id, phone, input.trim());
      setInput("");
      await refreshMsgs(); // reflect sent
    } finally {
      setLoading(false);
    }
  }

  const messagesStatus = useMemo<Status>(() => computeStatus(msgs), [msgs]);

  return (
    <div className="h-full grid grid-cols-[320px_1fr_320px]">
      {/* left: conversations */}
      <div className="border-r overflow-auto">
        {convs.map((c) => {
          const isActive = c.id === activeId;
          // quick status from cached msgs if this is active; otherwise rely on last_message_preview heuristic
          const badge =
            isActive ? messagesStatus :
            (c.last_message_preview?.startsWith("✅") ? "REPLIED" : "PENDING");

        return (
          <div
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`p-3 border-b cursor-pointer ${isActive ? "bg-gray-50" : ""}`}
          >
            <div className="text-sm font-medium">
              {c.customer_name || c.customer_phone || "Unknown"}
            </div>
            <div className="text-xs text-gray-500 truncate">{c.last_message_preview || "—"}</div>
            <div className="mt-1">
              <span
                className={`text-[10px] px-2 py-0.5 rounded ${
                  badge === "NEW"
                    ? "bg-green-100 text-green-700"
                    : badge === "REPLIED"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {badge}
              </span>
            </div>
          </div>
        )})}
      </div>

      {/* middle: chat thread + inline reply */}
      <div className="flex flex-col">
        <div className="flex-1 overflow-auto p-3">
          {msgs.map((m) => (
            <div key={m.id} className={`mb-2 ${m.direction === "out" ? "text-right" : "text-left"}`}>
              <div
                className={`inline-block px-3 py-2 rounded ${
                  m.direction === "out" ? "bg-blue-600 text-white" : "bg-gray-100"
                }`}
              >
                <div className="text-[12px] opacity-70 mb-1">
                  {new Date(m.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-2 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply…"
            className="flex-1 border rounded p-2 text-sm"
            rows={2}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || loading}
            className="px-4 py-2 border rounded text-sm disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* right: AI reasoning panel */}
      <div className="border-l p-3 overflow-auto">
        <div className="font-semibold mb-2">AI reasoning</div>
        {latestOrder ? (
          <div className="text-sm space-y-2">
            <div><span className="font-medium">Order ID:</span> {latestOrder.id}</div>
            <div><span className="font-medium">Reason:</span> {latestOrder.parse_reason || "—"}</div>
            <div>
              <span className="font-medium">Items:</span>
              <ul className="list-disc pl-5">
                {(latestOrder.items || []).map((it: any, i: number) => (
                  <li key={i}>
                    {(it.qty ?? "")} {(it.unit ?? "")} {it.canonical || it.name || ""}
                    {it.variant ? ` · ${it.variant}` : ""}
                    {it.brand ? ` · ${it.brand}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No recent order context.</div>
        )}
      </div>
    </div>
  );
}