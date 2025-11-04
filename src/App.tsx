import { useEffect, useState } from "react";
import Topbar from "./components/Topbar";
import LoginCard from "./components/LoginCard";
import Dashboard from "./components/Dashboard";
import { setToken, logout } from "./lib/api";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem("token"));

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setToken(t);
  }, []);

  function onAuthed(d: any) {
    localStorage.setItem("token", d.token);
    setToken(d.token);
    setAuthed(true);
  }

  function onLogout() {
    logout();
    setAuthed(false);
  }

  return (
    <div>
      <Topbar onLogout={onLogout} authed={authed} />
      {!authed ? <LoginCard onAuthed={onAuthed} /> : <Dashboard />}
    </div>
  );
}