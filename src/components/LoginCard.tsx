// src/components/LoginCard.tsx
import React, { useState } from "react";
import { login } from "../lib/api";

export default function LoginCard({ onAuthed }: { onAuthed: (d: any) => void }) {
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

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-white">
      <div className="w-full max-w-md">
        {/* Logo + title */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-[10px] font-bold text-white">
            KS
          </div>
          <div className="text-base font-semibold tracking-tight">KartoSync</div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* pill */}
          <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Live in minutes — no code
          </p>

          <h2 className="mt-3 text-xl font-semibold tracking-tight text-gray-900">Sign in</h2>
          <p className="mt-1 text-sm text-gray-600">
            Use the phone & password configured for your workspace.
          </p>

          {/* form */}
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-black/10"
                placeholder="+91XXXXXXXXXX / +9715XXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-black/10"
                placeholder="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {err && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {err}
              </div>
            )}

            <button
              onClick={go}
              disabled={loading}
              className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-xs text-gray-500">
              If you see <b>password_not_set</b>, set a password on mobile or ask admin.
            </p>
          </div>
        </div>

        {/* footer links (subtle) */}
        <div className="mt-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} KartoSync
        </div>
      </div>
    </div>
  );
}