// src/components/Topbar.tsx
import React from "react";

type TopbarProps = {
  authed: boolean;
  onLogout: () => void;
  onOpenProducts?: () => void;
};

export default function Topbar({ authed, onLogout, onOpenProducts }: TopbarProps) {
  return (
    <div className="w-full border-b bg-white py-3 px-4 flex justify-between items-center">
      <div className="font-semibold text-lg">KartoSync Dashboard</div>

      {authed && (
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onOpenProducts}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
          >
            Products
          </button>
          <button
            onClick={onLogout}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}