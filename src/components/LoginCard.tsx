// src/components/LoginCard.tsx
import React, { useState } from "react";
import { login } from "../lib/api";

export default function LoginCard({
  onAuthed,
}: {
  onAuthed: (d: any) => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setErr(null);
    if (!phone.trim()) return setErr("Enter phone number");
    if (!password.trim()) return setErr("Enter password");
    setLoading(true);
    try {
      const r = await login(phone.trim(), password);
      onAuthed(r); // { token, org }
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!loading) go();
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur-lg overflow-hidden">
        {/* Top row: brand + small pitch */}
        <div className="flex flex-col gap-6 p-6 md:flex-row md:p-8">
          {/* Left: brand + benefits */}
          <div className="flex-1">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-[15px] font-bold text-white shadow-sm">
                K
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-slate-900">
                  Kart Order
                </span>
                <span className="text-[11px] text-slate-500">
                  AI + WhatsApp Cloud API for local stores
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-800">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Auto-parse WhatsApp messages into clean orders
            </div>

            <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
              Sign in to your workspace
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Use the phone & password configured on your Kart Order account.
            </p>

            <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
              <li>• Convert messy WhatsApp lists into structured orders</li>
              <li>• See all chats and orders in one clean dashboard</li>
              <li>• Reply faster with smart AI-assisted messages</li>
            </ul>

            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <div className="font-medium text-slate-800 mb-1">
                Test workspace hint
              </div>
              <div>
                Your demo login is usually set by the admin (e.g.{" "}
                <code className="rounded bg-white/80 px-1">+9715…</code>).
                <br />
                If you see <code>password_not_set</code>, set a password on
                mobile or ask the admin.
              </div>
            </div>
          </div>

          {/* Right: form card */}
          <div className="mt-4 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-sm md:mt-0">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Phone number
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="+91XXXXXXXXXX / +9715XXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {err && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {err}
                </div>
              )}

              <button
                onClick={go}
                disabled={loading}
                className="mt-1 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>

              <p className="text-[11px] text-slate-500">
                Having trouble? Confirm your phone is registered for this
                workspace or contact the store admin.
              </p>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-2 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} Kart Order · Made for WhatsApp-first
          stores
        </div>
      </div>
    </div>
  );
}