// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import Topbar from "./components/Topbar";
import LoginCard from "./components/LoginCard";
import Dashboard from "./components/Dashboard";
import Inbox from "./components/Inbox";
import { setToken, logout } from "./lib/api";

type View = "dashboard" | "inbox" | "products";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem("token"));
  const [view, setView] = useState<View>(() => {
    const h = (location.hash.replace("#", "") || "").toLowerCase();
    if (h === "inbox" || h === "products" || h === "dashboard") return h as View;
    return "dashboard";
  });

  // keep axios auth header in sync
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setToken(t);
  }, []);

  // tiny hash-router (no libraries)
  useEffect(() => {
    const onHash = () => {
      const h = (location.hash.replace("#", "") || "").toLowerCase();
      if (h === "inbox" || h === "products" || h === "dashboard") {
        setView(h as View);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // keep the hash updated when user clicks tabs programmatically
  const goto = (v: View) => {
    if (location.hash !== `#${v}`) location.hash = `#${v}`;
    setView(v);
  };

  function onAuthed(d: { token: string }) {
    localStorage.setItem("token", d.token);
    setToken(d.token);
    setAuthed(true);
  }

  function onLogout() {
    logout();
    setAuthed(false);
  }

  // simple tabs shown only after auth
  const Tabs = useMemo(
    () =>
      authed ? (
        <div className="px-4 pt-2 pb-3 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => goto("dashboard")}
            className={`px-3 py-1.5 rounded ${view === "dashboard" ? "bg-black text-white" : "bg-gray-100"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => goto("inbox")}
            className={`px-3 py-1.5 rounded ${view === "inbox" ? "bg-black text-white" : "bg-gray-100"}`}
          >
            Inbox
          </button>
          <button
            onClick={() => goto("products")}
            className={`px-3 py-1.5 rounded ${view === "products" ? "bg-black text-white" : "bg-gray-100"}`}
            title="Admin Product Sync"
          >
            Products
          </button>
        </div>
      ) : null,
    [authed, view]
  );

  return (
    <div>
      <Topbar onLogout={onLogout} authed={authed} />
      {!authed ? (
        <LoginCard onAuthed={onAuthed} />
      ) : (
        <>
          {Tabs}
          <div className="p-4">
            {view === "dashboard" && <Dashboard />}
            {view === "inbox" && <Inbox />}
            {view === "products" && (
              <div className="text-sm">
                <div className="mb-2 font-medium">Admin Product Sync</div>
                <p className="text-gray-600">
                  Products UI coming up next. API is ready in <code>src/lib/api.ts</code>:
                  <code>listProducts</code>, <code>upsertProduct</code>, <code>deleteProduct</code>,
                  <code>importProductsCSV</code>.
                </p>
                <p className="mt-2 text-gray-600">
                  Create a component <code>src/components/AdminProducts.tsx</code> and render it here.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}