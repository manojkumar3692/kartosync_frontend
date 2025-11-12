// src/lib/api.ts
import axios from "axios";

// Always use relative API path → lets Vite proxy handle it
export const API_BASE = import.meta.env.VITE_API_BASE || "";

// Axios instance
const api = axios.create({ baseURL: API_BASE });

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
export type OrderStatus = "pending" | "shipped" | "paid";

export type Item = {
  qty: number | null;
  unit?: string | null;
  name?: string;
  canonical?: string | null;
  brand?: string | null;
  variant?: string | null;
  notes?: string | null;
  category?: string | null;
};

export type Order = {
  id: string;
  created_at: string;
  status: OrderStatus;
  customer_name?: string | null;
  source_phone?: string | null;
  raw_text?: string | null;
  audio_url?: string | null;
  items?: Item[];
  parse_reason?: string | null;
  parse_confidence?: number | null;
};

// Inbox types
export type InboxConversation = {
  id: string;
  customer_phone: string | null;
  customer_name: string | null;
  source: string | null; // 'waba' | 'local_bridge' | etc
  last_message_at: string | null;
  last_message_preview: string | null;
};

export type InboxMessage = {
  id: string;
  created_at: string;
  direction: "in" | "out";
  sender_type: string | null; // 'customer' | 'store' | 'ai' | etc
  channel: string | null; // 'waba' | 'sms' | etc
  body: string;
  wa_msg_id?: string | null;
};

// ─────────────────────────────────────────────────────────
// NEW: Admin Product types
// ─────────────────────────────────────────────────────────
export type AdminProduct = {
  id?: string;
  canonical: string;
  display_name: string;
  category?: string | null;
  base_unit?: string | null;
  variant?: string | null;
  dynamic_price?: boolean;
  brand?: string | null;
  is_active?: boolean;
};

export type ListProductsResponse = {
  items: AdminProduct[];
  total: number;
};

// ─────────────────────────────────────────────────────────
/** Interceptors */
// ─────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  (config.headers as any)["ngrok-skip-browser-warning"] = "true";
  return config;
});

// For immediate effect after login/logout
export function setToken(token?: string) {
  if (token) {
    localStorage.setItem("token", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem("token");
    delete api.defaults.headers.common.Authorization;
  }
}

// ─────────────────────────────────────────────────────────
/** Auth */
// ─────────────────────────────────────────────────────────
export async function login(phone: string, password: string) {
  const { data } = await api.post(`/api/auth/login`, { phone, password });
  return data as { token: string; org: any };
}

export async function signup(name: string, phone?: string, password?: string) {
  const payload: any = { name, phone };
  if (password) payload.password = password;
  const { data } = await api.post(`/api/auth/signup`, payload);
  return data;
}

export async function me() {
  const { data } = await api.get(`/api/org/me`);
  return data;
}

// ─────────────────────────────────────────────────────────
/** Orders */
// ─────────────────────────────────────────────────────────
export async function listOrders() {
  const { data } = await api.get(`/api/orders`);
  if (Array.isArray(data)) return data as Order[];
  if (data && Array.isArray((data as any)?.data))
    return (data as any).data as Order[];
  return [] as Order[];
}

export async function updateStatus(id: string, status: OrderStatus) {
  await api.post(`/api/orders/${id}/status`, { status });
}

// Map WA Business Phone Number ID to org
export async function mapWa(wa_phone_number_id: string) {
  const { data } = await api.post(`/api/org/map-wa`, { wa_phone_number_id });
  return data;
}

// ─────────────────────────────────────────────────────────
/** AI correction */
// ─────────────────────────────────────────────────────────
export async function submitAICorrection(payload: {
  message_text: string;
  model_output: Array<any>;
  human_fixed: Array<any>;
  order_id?: string;
  reason?: string;
}) {
  const { data } = await api.post(`/api/ai-corrections`, payload);
  return data;
}

export async function aiFixOrder(
  id: string,
  human_fixed: { items: Item[]; reason?: string }
) {
  const { data } = await api.post(`/api/orders/${id}/ai-fix`, { human_fixed });
  return data as { ok: true; order: Order };
}

export async function getClarifyLink(
  order_id: string,
  line_index: number,
  ttlSeconds?: number
) {
  const { data } = await api.post(`/api/clarify-link`, {
    order_id,
    line_index,
    ttlSeconds,
  });
  if (!data?.ok) throw new Error(data?.error || "clarify_link_failed");
  return data.url as string;
}

export async function deleteOrder(orderId: string) {
  const { data } = await api.delete(`/api/orders/${orderId}`);
  return data;
}

// ─────────────────────────────────────────────────────────
/** Inbox (WABA + local_bridge unified view) */
// ─────────────────────────────────────────────────────────
export async function getInboxConversations(orgId: string) {
  const { data } = await api.get(`/api/inbox/conversations`, {
    params: { org_id: orgId },
  });
  return (data.conversations || []) as InboxConversation[];
}

export async function getInboxMessages(orgId: string, conversationId: string) {
  const { data } = await api.get(
    `/api/inbox/conversations/${conversationId}/messages`,
    { params: { org_id: orgId } }
  );
  return (data.messages || []) as InboxMessage[];
}

// ─────────────────────────────────────────────────────────
/** NEW: Admin Products (Sync UI) */
// ─────────────────────────────────────────────────────────

// List products (optional pagination + search)
export async function listProducts(opts?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<ListProductsResponse> {
  const params: Record<string, string> = {};
  if (opts?.limit != null) params.limit = String(opts.limit);
  if (opts?.offset != null) params.offset = String(opts.offset);
  if (opts?.search) params.search = opts.search;

  const { data } = await api.get(`/api/admin/products`, { params });
  // Normalize a few possible shapes:
  if (data?.items && typeof data?.total === "number") return data;
  if (Array.isArray(data))
    return { items: data as AdminProduct[], total: (data as any).length ?? 0 };
  if (data?.data && Array.isArray(data.data))
    return { items: data.data as AdminProduct[], total: data.total ?? data.data.length ?? 0 };

  return { items: [], total: 0 };
}

// Create/Update a product (if id present → update)
export async function upsertProduct(p: AdminProduct) {
  const { data } = await api.post(`/api/admin/products`, p);
  return data as { ok?: boolean; product?: AdminProduct };
}

// Delete product
export async function deleteProduct(id: string) {
  const { data } = await api.delete(`/api/admin/products/${id}`);
  return data as { ok?: boolean };
}

// Import CSV (expects backend route: POST /api/admin/products/import { csvText, mode })
export async function importProductsCSV(csvText: string, mode: "upsert" | "insert" = "upsert") {
  const { data } = await api.post(`/api/admin/products/import`, { csvText, mode });
  return data as { ok?: boolean; imported?: number; updated?: number };
}

// ─────────────────────────────────────────────────────────
/** Session */
// ─────────────────────────────────────────────────────────
export function logout() {
  setToken(undefined);
}

export async function sendInboxMessage(orgId: string, phone: string, text: string) {
  const { data } = await api.post(`/api/inbox/send`, { org_id: orgId, phone, text });
  return data as { ok: boolean; error?: string };
}

// Optional: fetch latest order context for a phone (for “AI reasoning”)
export async function getLatestOrderForPhone(orgId: string, phone: string) {
  const { data } = await api.get(`/api/inbox/latest-order`, { params: { org_id: orgId, phone } });
  return (data?.order || null) as (Order | null);
}

export default api;