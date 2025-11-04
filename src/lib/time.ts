// src/lib/time.ts
import { useEffect, useState } from "react";

export function useTicker(ms = 30000) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function timeAgo(fromISO: string | number | Date, nowMs?: number) {
  const from = typeof fromISO === "string" ? new Date(fromISO).getTime()
            : fromISO instanceof Date ? fromISO.getTime()
            : (fromISO as number);
  const now = nowMs ?? Date.now();
  const diff = Math.max(0, Math.floor((now - from) / 1000)); // seconds

  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} min${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  const w = Math.floor(d / 7);
  return `${w} week${w > 1 ? "s" : ""} ago`;
}