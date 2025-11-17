// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import Topbar from "./components/Topbar";
import LoginCard from "./components/LoginCard";
import Dashboard from "./components/Dashboard";
import Inbox from "./components/Inbox";
import AdminProducts from "./components/AdminProducts";
import { setToken, logout } from "./lib/api";
import Analytics from "./components/Analytics";
import OrgSettings from "./components/OrgSettings";
import PastOrders from "./components/PastOrders";

type View = "dashboard" | "inbox" | "products" | "analytics" | "settings" | "past"

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem("token"));

  const [view, setView] = useState<View>(() => {
    const h = (location.hash.replace("#", "") || "").toLowerCase();
    if (h === "inbox" || h === "products" || h === "dashboard" || h === "analytics" || h === "settings" || "past") return h as View;
    return "dashboard";
  });

  // Keep axios auth header in sync with stored token
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setToken(t);
  }, []);

  // Tiny hash-router
  useEffect(() => {
    const onHash = () => {
      const h = (location.hash.replace("#", "") || "").toLowerCase();
      if (h === "inbox" || h === "products" || h === "dashboard" || h === "analytics" || h === "settings" || "past")  {
        setView(h as View);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Update hash when clicking tabs
  const goto = (v: View) => {
    if (location.hash !== `#${v}`) location.hash = `#${v}`;
    setView(v);
  };

  function onAuthed(d: { token: string }) {
    localStorage.setItem("token", d.token);
    setToken(d.token);
    setAuthed(true);
    // After login, always land on the main WhatsApp Orders view
    goto("dashboard");
  }

  function onLogout() {
    logout();
    setAuthed(false);
  }

  // Tabs shown only after auth
  const Tabs = useMemo(
    () =>
      authed ? (
        <div className="border-b border-slate-200 bg-white/70 backdrop-blur">
          <div className="mx-auto flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px] text-emerald-700">
                🤖
              </span>
              <span className="hidden sm:inline">
                AI + WhatsApp Cloud API dashboard
              </span>
            </div>

            <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-[11px]">
              <button
                onClick={() => goto("dashboard")}
                className={
                  "rounded-full px-3 py-1.5 transition " +
                  (view === "dashboard"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-white")
                }
              >
                🧾 Orders & WhatsApp
              </button>

              <button
          className={
            "px-3 py-1.5 rounded-full " +
            (view === "past"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
          onClick={() => goto("past")}
        >
          📚 Past orders
        </button>

              <button
                onClick={() => goto("products")}
                className={
                  "rounded-full px-3 py-1.5 transition " +
                  (view === "products"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-white")
                }
                title="Store catalog used by AI"
              >
                🛒 Products
              </button>

              <button
                onClick={() => goto("inbox")}
                className={
                  "hidden sm:inline-flex rounded-full px-3 py-1.5 transition " +
                  (view === "inbox"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:bg-white")
                }
                title="Legacy inbox view (advanced)"
              >
                💬 Legacy Inbox
              </button>
              <button
              onClick={() => goto("analytics")}
               className={
                 "hidden sm:inline-flex rounded-full px-3 py-1.5 transition " +
                 (view === "analytics"
                   ? "bg-slate-900 text-white shadow-sm"
                   : "text-slate-500 hover:bg-white")
               }
               title="Sales and store analytics"
             >
               📊 Analytics
             </button>
             <button
  onClick={() => goto("settings")}
  className={
    "rounded-full px-3 py-1.5 transition " +
    (view === "settings"
      ? "bg-slate-900 text-white shadow-sm"
      : "text-slate-700 hover:bg-white")
  }
  title="Store settings & payments"
>
  ⚙️ Settings
</button>
            </div>
          </div>
        </div>
      ) : null,
    [authed, view]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Topbar onLogout={onLogout} authed={authed} />

      {!authed ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <LoginCard onAuthed={onAuthed} />
        </div>
      ) : (
        <>
          {Tabs}
          <main className="flex-1">
            <div className="mx-auto px-4 py-4 h-full">
              {view === "dashboard" && (
                // New 3-column WhatsApp + Orders layout lives inside Dashboard.tsx
                <Dashboard />
              )}
              {view === "inbox" && (
                <div className="h-[calc(100vh-140px)] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <Inbox />
                </div>
              )}
              {view === "products" && (
                <div className="h-[calc(100vh-140px)]">
                  <AdminProducts />
                </div>
              )}
              {view === "analytics" && (
              <Analytics />
             )}
             {view === "settings" && (
  <div className="h-[calc(100vh-140px)] rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
    <OrgSettings />
  </div>
)}
 {view === "past" && <PastOrders />}
            </div>
          </main>
        </>
      )}
    </div>
  );
}