import { useEffect, useMemo, useState } from "react";
import { listProducts, upsertProduct, deleteProduct, importProductsCSV } from "../lib/api";

type Product = {
  id?: string;
  canonical: string;
  display_name: string;
  category?: string | null;
  base_unit?: string | null;
  variant?: string | null;
  dynamic_price?: boolean;
  brand?: string | null;
  is_active?: boolean;
};

// Draft type for the form so TS doesn't require every field on each keystroke
type ProductDraft = Partial<Product> & { id?: string };

export default function AdminProducts(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<ProductDraft | null>(null);
  const [csv, setCsv] = useState("");

  const pageInfo = useMemo(() => {
    return {
      page: Math.floor(offset / limit) + 1,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }, [offset, limit, total]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listProducts({ limit, offset, search });
      setRows(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
      alert("Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offset]);

  // normalize empty strings to null for optional fields
  function norm(p: ProductDraft): Product {
    return {
      id: p.id,
      canonical: (p.canonical ?? "").trim(),
      display_name: (p.display_name ?? "").trim(),
      category: (p.category ?? "") === "" ? null : p.category!,
      base_unit: (p.base_unit ?? "") === "" ? null : p.base_unit!,
      variant: (p.variant ?? "") === "" ? null : p.variant!,
      brand: (p.brand ?? "") === "" ? null : p.brand!,
      dynamic_price: !!p.dynamic_price,
      is_active: p.is_active !== false,
    };
  }

  async function save(p: ProductDraft) {
    if (!p) return;
    const canonical = (p.canonical ?? "").trim();
    const display_name = (p.display_name ?? "").trim();
    if (!display_name || !canonical) {
      alert("Please fill both Display name and Canonical.");
      return;
    }
    try {
      await upsertProduct(norm(p));
      setEdit(null);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Save failed");
    }
  }

  async function remove(id?: string) {
    if (!id) return;
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Delete failed");
    }
  }

  async function doImport() {
    if (!csv.trim()) {
      alert("Paste CSV first.");
      return;
    }
    try {
      await importProductsCSV(csv, "upsert");
      setCsv("");
      await refresh();
      alert("Import complete");
    } catch (e) {
      console.error(e);
      alert("Import failed");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex">
      {/* drawer */}
      <div className="h-full w-[min(960px,90vw)] ml-auto bg-white overflow-hidden shadow-xl flex flex-col">
        {/* header */}
        <div className="p-3 border-b flex items-center gap-2">
          <div className="text-lg font-semibold">Admin · Product Sync</div>
          <div className="ml-auto flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="border rounded px-2 py-1 text-sm"
            />
            <button
              onClick={() => {
                setOffset(0);
                refresh();
              }}
              className="border rounded px-3 py-1 text-sm"
            >
              Search
            </button>
            <button
              onClick={() =>
                setEdit({
                  canonical: "",
                  display_name: "",
                  category: "",
                  base_unit: "",
                  variant: "",
                  dynamic_price: false,
                  brand: "",
                  is_active: true,
                })
              }
              className="border rounded px-3 py-1 text-sm"
            >
              + New
            </button>
            <button onClick={onClose} className="border rounded px-3 py-1 text-sm">
              Close
            </button>
          </div>
        </div>

        {/* body */}
        <div className="grid grid-cols-2 gap-0 flex-1 overflow-hidden">
          {/* table */}
          <div className="p-3 overflow-auto">
            {loading ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-gray-600">No products.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Canonical</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">Unit</th>
                    <th className="text-left p-2">Variant</th>
                    <th className="text-left p-2">Dynamic</th>
                    <th className="text-left p-2">Active</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{r.display_name}</td>
                      <td className="p-2">{r.canonical}</td>
                      <td className="p-2">{r.category || "-"}</td>
                      <td className="p-2">{r.base_unit || "-"}</td>
                      <td className="p-2">{r.variant || "-"}</td>
                      <td className="p-2">{r.dynamic_price ? "Yes" : "No"}</td>
                      <td className="p-2">{r.is_active ? "Yes" : "No"}</td>
                      <td className="p-2">
                        <button
                          className="text-blue-600 mr-3"
                          onClick={() => setEdit({ ...r })}
                        >
                          Edit
                        </button>
                        <button className="text-red-600" onClick={() => remove(r.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="border rounded px-2 py-1"
                          disabled={offset === 0}
                          onClick={() => setOffset(Math.max(0, offset - limit))}
                        >
                          ◀ Prev
                        </button>
                        <div className="text-xs text-gray-600">
                          Page {pageInfo.page} / {pageInfo.pages} · Total {total}
                        </div>
                        <button
                          className="border rounded px-2 py-1"
                          disabled={offset + limit >= total}
                          onClick={() => setOffset(offset + limit)}
                        >
                          Next ▶
                        </button>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* right pane: editor + CSV import */}
          <div className="border-l p-3 flex flex-col gap-3 overflow-auto">
            <div>
              <div className="font-semibold mb-2">CSV Import (Upsert)</div>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={`canonical,display_name,category,base_unit,variant,dynamic_price,brand,is_active
onion,Onion,veg,kg,big,true,,
onion,Onion,veg,kg,small,true,,
chicken,Chicken,meat,kg,biryani cut,true,,
chicken,Chicken,meat,kg,curry cut,true,,`}
                rows={8}
                className="w-full border rounded p-2 text-sm font-mono"
              />
              <div className="mt-2 flex gap-2">
                <button className="border rounded px-3 py-1 text-sm" onClick={doImport}>
                  Import & Upsert
                </button>
                <button className="border rounded px-3 py-1 text-sm" onClick={() => setCsv("")}>
                  Clear
                </button>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="font-semibold mb-2">{edit?.id ? "Edit Product" : "New Product"}</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Display name"
                  value={edit?.display_name ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), display_name: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Canonical (e.g., onion)"
                  value={edit?.canonical ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), canonical: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Category (veg/meat/…)"
                  value={edit?.category ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), category: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Base unit (kg/pc/pack/…)"
                  value={edit?.base_unit ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), base_unit: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Variant (big/small/biryani cut/…)"
                  value={edit?.variant ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), variant: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Brand (optional)"
                  value={edit?.brand ?? ""}
                  onChange={(e) => setEdit((p) => ({ ...(p ?? {}), brand: e.target.value }))}
                />
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!edit?.dynamic_price}
                    onChange={(e) =>
                      setEdit((p) => ({ ...(p ?? {}), dynamic_price: e.target.checked }))
                    }
                  />
                  Dynamic price
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={edit?.is_active !== false}
                    onChange={(e) =>
                      setEdit((p) => ({ ...(p ?? {}), is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  className="border rounded px-3 py-1 text-sm"
                  onClick={() => (edit ? save(edit) : undefined)}
                  disabled={!edit || !(edit.display_name ?? "").trim() || !(edit.canonical ?? "").trim()}
                >
                  Save
                </button>
                <button className="border rounded px-3 py-1 text-sm" onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* footer note */}
        <div className="p-2 border-t text-xs text-gray-600">
          Tip: Variants drive WhatsApp clarify prompts (e.g., onion → big/small).
        </div>
      </div>
    </div>
  );
}