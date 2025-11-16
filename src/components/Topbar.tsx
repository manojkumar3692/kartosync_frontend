// src/components/Topbar.tsx
import React from "react";

type Props = {
  authed?: boolean;
  onLogout?: () => void;
};

export default function Topbar({ authed, onLogout }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex items-center justify-between px-4 py-2.5">
        {/* Left: brand / app name */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-[18px] font-semibold text-white shadow-sm">
            K
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-slate-900">
              Karto Orders
            </span>
            <span className="text-[11px] text-slate-500">
              AI + WhatsApp Cloud API for local stores
            </span>
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-2">
          {authed ? (
            <>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-[3px] text-[11px] text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Logout
                </button>
              )}
            </>
          ) : (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
              Sign in to connect your WhatsApp store
            </span>
          )}
        </div>
      </div>
    </header>
  );
}