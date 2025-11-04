export default function Topbar({ authed, onLogout }: { authed: boolean; onLogout: () => void }) {
  return (
    <div className="w-full border-b bg-white py-3 px-4 flex justify-between items-center">
      <div className="font-semibold text-lg">KartoSync Dashboard</div>

      {authed && (
        <button
          onClick={onLogout}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
        >
          Logout
        </button>
      )}
    </div>
  );
}