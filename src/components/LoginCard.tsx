import { useState } from "react";
import { login } from "../lib/api";
import React from "react";

export default function LoginCard({ onAuthed }: { onAuthed: (d: any) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="bg-white p-6 rounded-xl shadow max-w-md mx-auto mt-20 border border-gray-200">
      <h2 className="font-semibold text-xl mb-1">Login</h2>
      <p className="text-sm text-gray-600 mb-4">
        Use the phone & password configured for your workspace.
      </p>

      <input
        className="border rounded w-full px-3 py-2 mb-2"
        placeholder="+91XXXXXXXXXX / +9715XXXXXXX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="border rounded w-full px-3 py-2 mb-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {err && <div className="text-red-600 text-xs mb-2">{err}</div>}

      <button
        onClick={go}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white w-full"
      >
        {loading ? "Logging in…" : "Login"}
      </button>

      <p className="text-xs text-gray-500 mt-3">
        If you see <b>password_not_set</b>, set a password on mobile or ask admin.
      </p>
    </div>
  );
}