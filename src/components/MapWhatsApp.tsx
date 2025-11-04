import { useState } from "react";
import api, { mapWa } from "../lib/api";

export default function MapWhatsApp({ initial }: { initial?: string }) {
  const [val, setVal] = useState(initial || "");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    setSaving(true); setOk(null); setErr(null);
    try {
      await mapWa(val.trim());
      setOk("Saved ✓");
    } catch (e:any) {
      setErr(e?.response?.data?.error || "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
      <input
        value={val}
        onChange={e=>setVal(e.target.value)}
        placeholder="WA phone_number_id (e.g. TEST123 or 123456789012345)"
        style={{ padding:6, border:"1px solid #ccc", borderRadius:6, minWidth:360 }}
      />
      <button onClick={onSave} disabled={saving} style={{ padding:"6px 10px" }}>
        {saving ? "Saving..." : "Save"}
      </button>
      {ok && <span style={{ color:"#0a0" }}>{ok}</span>}
      {err && <span style={{ color:"#c00" }}>{err}</span>}
    </div>
  );
}