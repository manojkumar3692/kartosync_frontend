// src/lib/api.ts
import axios from "axios";

// Point to your running backend (override via VITE_API_BASE in .env)
// export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";
// Always use relative API path → lets Vite proxy handle it
export const API_BASE = import.meta.env.VITE_API_BASE || "";

// Axios instance
const api = axios.create({ baseURL: API_BASE });

// ─────────────────────────────────────────────────────────
// Types (non-breaking; extendable with brand/variant/notes)
// ─────────────────────────────────────────────────────────
export type OrderStatus = "pending" | "shipped" | "paid";

export type Item = {
  qty: number | null;
  unit?: string | null;
  name?: string;
  canonical?: string | null;
  // optional enrichments we now support end-to-end
  brand?: string | null;
  variant?: string | null; // e.g., "full fat", "low fat"
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

// ─────────────────────────────────────────────────────────
// Interceptors
//  - Always attach user token (if any)
//  - Bypass ngrok interstitial
// ─────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  (config.headers as any)["ngrok-skip-browser-warning"] = "true";
  return config;
});

// For immediate effect after login/logout (without waiting for next request)
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
// Auth
// ─────────────────────────────────────────────────────────
export async function login(phone: string, password: string) {
  const { data } = await api.post(`/api/auth/login`, { phone, password });
  return data as { token: string; org: any };
}

// Kept for backward compatibility; backend ignores password if not supported
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
// Orders
// ─────────────────────────────────────────────────────────
export async function listOrders() {
  const { data } = await api.get(`/api/orders`);
  if (Array.isArray(data)) return data as Order[];
  if (data && Array.isArray((data as any)?.data)) return (data as any).data as Order[];
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
// AI correction (learning + immediate order update)
// ─────────────────────────────────────────────────────────

// Low-level: direct ai_corrections insert (backend expects these keys)
export async function submitAICorrection(payload: {
  message_text: string;          // original text (or empty string)
  model_output: Array<any>;      // items as parsed before fix
  human_fixed: Array<any>;       // normalized fixed items
  order_id?: string;
  reason?: string;
}) {
  const { data } = await api.post(`/api/ai-corrections`, payload);
  return data;
}

// High-level: update a specific order and log the correction (preferred)
export async function aiFixOrder(
  id: string,
  human_fixed: { items: Item[]; reason?: string }
) {
  const { data } = await api.post(`/api/orders/${id}/ai-fix`, { human_fixed });
  return data as { ok: true; order: Order };
}

// src/lib/api.ts
export async function getClarifyLink(order_id: string, line_index: number, ttlSeconds?: number) {
  const { data } = await api.post(`/api/clarify-link`, { order_id, line_index, ttlSeconds });
  if (!data?.ok) throw new Error(data?.error || "clarify_link_failed");
  return data.url as string;
}

export async function deleteOrder(orderId: string) {
  const { data } = await api.delete(`/api/orders/${orderId}`);
  return data;
}

// ─────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────
export function logout() {
  setToken(undefined);
}

export default api;