// src/lib/api.ts
import axios from "axios";




export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";
const api = axios.create({ baseURL: API_BASE });

export type OrderStatus = "pending" | "shipped" | "paid";


api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  // 👇 bypass ngrok interstitial
  (config.headers as any)["ngrok-skip-browser-warning"] = "true";
  return config;
});

export function setToken(token?: string) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

// ✅ real login
export async function login(phone: string, password: string) {
  const { data } = await api.post(`/api/auth/login`, { phone, password });
  return data; // { token, org }
}

export async function signup(name: string, phone?: string, password?: string) {
  // keep backwards-compatible: send password only if provided
  const payload: any = { name, phone };
  if (password) payload.password = password;
  const { data } = await api.post(`/api/auth/signup`, payload);
  return data;
}

export async function me() {
  const { data } = await api.get(`/api/org/me`);
  return data;
}

export async function listOrders() {
  const { data } = await api.get(`/api/orders`);
  // ✅ always return an array
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data?.data)) return data.data;
  return [];
}

export async function updateStatus(id: string, status: OrderStatus) {
  await api.post(`/api/orders/${id}/status`, { status });
}

export async function mapWa(wa_phone_number_id: string) {
  const { data } = await api.post(`/api/org/map-wa`, { wa_phone_number_id });
  return data;
}



// ✅ Align with backend: expects message_text, model_output, human_fixed
export async function submitAICorrection(payload: {
  message_text: string;                 // original text (or empty string)
  model_output: Array<any>;             // current items from the order
  human_fixed: Array<any>;              // corrected items
  // Note: backend ignores extra fields; we can still pass them if needed
  order_id?: string;
  reason?: string;
}) {
  const { data } = await api.post(`/api/ai-corrections`, payload);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
  setToken(undefined);
}

export default api;