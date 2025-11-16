// src/components/AdminProducts.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  AdminProduct,
  listProducts,
  upsertProduct,
  deleteProduct,
  importProductsCSV,
} from "../lib/api";

type Product = AdminProduct;

type ProductDraft = {
  id?: string;
  canonical: string;
  display_name: string;
  category: string;
  base_unit: string;
  brand: string;
  variant: string;
  dynamic_price: boolean;
  is_active: boolean;
  price_per_unit: string; // <- form field (string)
};

function emptyDraft(): ProductDraft {
  return {
    id: undefined,
    canonical: "",
    display_name: "",
    category: "",
    base_unit: "",
    brand: "",
    variant: "",
    dynamic_price: false,
    is_active: true,
    price_per_unit: "",
  };
}

function toDraft(p?: Product | null): ProductDraft {
  if (!p) return emptyDraft();
  return {
    id: p.id,
    canonical: p.canonical || "",
    display_name: p.display_name || p.canonical || "",
    category: p.category || "",
    base_unit: p.base_unit || "",
    brand: p.brand || "",
    variant: p.variant || "",
    dynamic_price: !!p.dynamic_price,
    is_active: p.is_active !== false,
    price_per_unit:
      p.price_per_unit != null && !Number.isNaN(p.price_per_unit as any)
        ? String(p.price_per_unit)
        : "",
  };
}

type Grouped = {
  canonical: string;
  variants: Product[];
};

const CATEGORY_ALL = "all";

const CATEGORY_OPTIONS = [
  CATEGORY_ALL,
  "Meat",
  "Vegetables",
  "Fruits",
  "Toiletries",
  "Bakery",
  "Electronics",
  "Other",
];

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_ALL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Basic pagination (for now: first page only – can extend later)
  const [limit] = useState(50);
  const [offset] = useState(0);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const resp = await listProducts({
        limit,
        offset,
        search: search.trim() || undefined,
      });
      setProducts(resp.items || []);
      setTotal(resp.total || 0);
    } catch (e: any) {
      console.error("[AdminProducts] listProducts error", e);
      setError(e?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped: Grouped[] = useMemo(() => {
    const byKey = new Map<string, Product[]>();

    for (const p of products) {
      // Optional category filter (client side)
      if (
        categoryFilter !== CATEGORY_ALL &&
        (p.category || "").toLowerCase() !== categoryFilter.toLowerCase()
      ) {
        continue;
      }

      const key = p.canonical || p.display_name || "Unnamed";
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(p);
    }

    const out: Grouped[] = [];
    for (const [canonical, variants] of byKey.entries()) {
      out.push({ canonical, variants });
    }
    out.sort((a, b) => a.canonical.localeCompare(b.canonical));
    return out;
  }, [products, categoryFilter]);

  function openNew() {
    setDraft(emptyDraft());
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setDraft(toDraft(p));
    setShowModal(true);
  }

  async function handleSave() {
    const canonical = draft.canonical.trim();
    const display_name = (draft.display_name || draft.canonical).trim();

    if (!canonical) {
      alert("Canonical name is required (e.g., Chicken, Onion).");
      return;
    }

    // convert price string → number | null
    const priceStr = (draft.price_per_unit || "").trim();
    let price_per_unit: number | null = null;
    if (priceStr) {
      const n = Number(priceStr);
      if (!Number.isNaN(n)) {
        price_per_unit = n;
      }
    }

    try {
      setSaving(true);
      const payload: AdminProduct = {
        id: draft.id,
        canonical,
        display_name: display_name || canonical,
        category: draft.category.trim() || null,
        base_unit: draft.base_unit.trim() || null,
        brand: draft.brand.trim() || null,
        variant: draft.variant.trim() || null,
        dynamic_price: !!draft.dynamic_price,
        is_active: draft.is_active,
        price_per_unit, // <- send to backend
      };

      const resp = await upsertProduct(payload);
      const saved = resp.product;
      if (!saved) {
        throw new Error(resp as any);
      }

      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx === -1) return [saved, ...prev];
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      });

      setShowModal(false);
      setDraft(emptyDraft());
    } catch (e: any) {
      console.error("[AdminProducts] upsertProduct error", e);
      alert(e?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    const name = p.display_name || p.canonical || "this product";
    if (!p.id) {
      alert("Cannot delete a product without an ID.");
      return;
    }
    const ok = window.confirm(
      `Delete product "${name}"? This cannot be undone.`
    );
    if (!ok) return;

    try {
      setDeletingId(p.id);
      await deleteProduct(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      console.error("[AdminProducts] deleteProduct error", e);
      alert(e?.message || "Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImport() {
    if (!importText.trim()) {
      alert("Paste some CSV first.");
      return;
    }
    try {
      setImporting(true);
      const resp = await importProductsCSV(importText, "upsert");
      alert(
        `Import done.\nImported: ${resp.imported || 0}\nUpdated: ${
          resp.updated || 0
        }`
      );
      setShowImport(false);
      setImportText("");
      await refresh();
    } catch (e: any) {
      console.error("[AdminProducts] import error", e);
      alert(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Products (Store Catalog)
          </div>
          <div className="text-xs text-gray-500">
            Define your items so AI can map customer messages to the right
            product, brand & variant, and help you send price-aware summaries.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
            onClick={() => setShowImport(true)}
          >
            ⬆️ Import CSV
          </button>
          <button
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-black/90"
            onClick={openNew}
          >
            ＋ New Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <input
            className="w-full rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 pl-7 text-xs text-gray-800 outline-none focus:border-gray-400"
            placeholder="Search product / brand / variant"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => refresh()}
          />
          <span className="pointer-events-none absolute left-2 top-1.5 text-xs text-gray-400">
            🔍
          </span>
        </div>
        <select
          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-800"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c === CATEGORY_ALL ? "All categories" : c}
            </option>
          ))}
        </select>
        <button
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          onClick={refresh}
        >
          ⟳ Refresh
        </button>
        <div className="ml-auto text-[11px] text-gray-400">
          Showing {products.length} / {total} items
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      {loading && (
        <div className="text-xs text-gray-500">Loading products…</div>
      )}

      {/* Main grouped list */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
        {grouped.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-gray-500">
            <div className="mb-1 text-lg">🧺</div>
            <div>No products yet.</div>
            <div className="mt-1">
              Click <b>“New Product”</b> to add your first item.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map((g) => (
              <div
                key={g.canonical}
                className="rounded-2xl border border-gray-200 bg-white p-3"
              >
                {/* Canonical header */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {g.canonical}
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-[1px] text-[10px] text-gray-600">
                      {g.variants.length} option
                      {g.variants.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setDraft((prev) => ({
                        ...emptyDraft(),
                        canonical: g.canonical,
                        display_name:
                          prev.display_name ||
                          g.variants[0]?.display_name ||
                          g.canonical,
                        category: g.variants[0]?.category || "",
                        base_unit: g.variants[0]?.base_unit || "",
                        brand: "",
                        variant: "",
                        dynamic_price: false,
                        is_active: true,
                        price_per_unit: "",
                      }));
                      setShowModal(true);
                    }}
                    title="Add another variant/brand for this product"
                  >
                    ＋ Add option
                  </button>
                </div>

                {/* Variants table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                    <thead className="text-[10px] uppercase text-gray-400">
                      <tr>
                        <th className="px-2 text-left">Display name</th>
                        <th className="px-2 text-left">Brand</th>
                        <th className="px-2 text-left">Variant</th>
                        <th className="px-2 text-left">Category</th>
                        <th className="px-2 text-left">Base unit</th>
                        <th className="px-2 text-left">Price / unit</th>
                        <th className="px-2 text-center">Dynamic price</th>
                        <th className="px-2 text-center">Active</th>
                        <th className="px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.variants.map((p) => (
                        <tr
                          key={p.id || `${p.canonical}-${p.brand}-${p.variant}`}
                        >
                          <td className="rounded-l-xl bg-gray-50 px-2 py-1">
                            <div className="font-medium text-gray-900">
                              {p.display_name || p.canonical}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {p.canonical !== p.display_name && p.display_name
                                ? `Family: ${p.canonical}`
                                : ""}
                            </div>
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-gray-800">
                            {p.brand || (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-gray-800">
                            {p.variant || (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-gray-800">
                            {p.category || (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-gray-800">
                            {p.base_unit || (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-gray-800">
                            {p.price_per_unit != null ? (
                              <span>
                                {p.price_per_unit}
                                {p.base_unit ? ` / ${p.base_unit}` : ""}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-center text-gray-800">
                            {p.dynamic_price ? "Yes" : "No"}
                          </td>
                          <td className="bg-gray-50 px-2 py-1 text-center">
                            <span
                              className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] ${
                                p.is_active !== false
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {p.is_active !== false ? "Active" : "Hidden"}
                            </span>
                          </td>
                          <td className="rounded-r-xl bg-gray-50 px-2 py-1 text-right">
                            <button
                              className="mr-1 rounded-full border border-gray-200 bg-white px-2 py-[3px] text-[11px] text-gray-700 hover:bg-gray-100"
                              onClick={() => openEdit(p)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-[3px] text-[11px] text-rose-700 hover:bg-rose-100"
                              onClick={() => handleDelete(p)}
                              disabled={!!deletingId && deletingId === p.id}
                            >
                              {deletingId === p.id ? "…" : "🗑 Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
                <div className="text-sm font-semibold">
                  {draft.id ? "Edit product" : "New product"}
                </div>
                <button
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                  onClick={() => setShowModal(false)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4 text-xs">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Canonical name (family)
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g., Chicken, Onion, Colgate Toothpaste"
                      value={draft.canonical}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, canonical: e.target.value }))
                      }
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      This is what the customer usually says in WhatsApp.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Display name (shown in dashboard)
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g., Chicken – Skinless curry cut"
                      value={draft.display_name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          display_name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Category
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="Meat / Vegetables / Toiletries…"
                      value={draft.category}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, category: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Base unit
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="kg / piece / pack / litre…"
                      value={draft.base_unit}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, base_unit: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Brand (optional)
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g., Store brand, Colgate"
                      value={draft.brand}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, brand: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Variant (optional)
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g., Skinless curry cut, Big onion, MaxFresh 150g"
                      value={draft.variant}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, variant: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Price per base unit
                    </label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g., 120 (for 120 per kg)"
                      value={draft.price_per_unit}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          price_per_unit: e.target.value,
                        }))
                      }
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Used to calculate rough order totals. Leave empty if you
                      prefer to type prices manually in chat.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="dynamic_price"
                      type="checkbox"
                      className="h-3 w-3"
                      checked={draft.dynamic_price}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          dynamic_price: e.target.checked,
                        }))
                      }
                    />
                    <label
                      htmlFor="dynamic_price"
                      className="text-[11px] text-gray-700"
                    >
                      Price changes daily (market rate)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="is_active"
                      type="checkbox"
                      className="h-3 w-3"
                      checked={draft.is_active}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          is_active: e.target.checked,
                        }))
                      }
                    />
                    <label
                      htmlFor="is_active"
                      className="text-[11px] text-gray-700"
                    >
                      Active (visible in orders)
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-4 py-3">
                <button
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-black/90"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowImport(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
                <div className="text-sm font-semibold">Import products CSV</div>
                <button
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                  onClick={() => setShowImport(false)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4 text-xs">
                <p className="mb-2 text-gray-600">
                  Paste CSV with columns:{" "}
                  <code className="rounded bg-gray-100 px-1">
                    canonical,display_name,category,base_unit,brand,variant,dynamic_price,is_active,price_per_unit
                  </code>
                  .
                  <br />
                  Example:{" "}
                  <code>
                    Chicken,Chicken Skinless,Meat,kg,,Skinless curry
                    cut,true,true,220
                  </code>
                </p>
                <textarea
                  className="h-48 w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={
                    "canonical,display_name,category,base_unit,brand,variant,dynamic_price,is_active,price_per_unit\n" +
                    "Chicken,Chicken Skinless,Meat,kg,,Skinless curry cut,true,true,220"
                  }
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-4 py-3">
                <button
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
                  onClick={() => setShowImport(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-black/90"
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}