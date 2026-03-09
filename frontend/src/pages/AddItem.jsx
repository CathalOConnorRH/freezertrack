import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createItem } from "../api/client";

export default function AddItem() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = location.state?.prefill;

  const [form, setForm] = useState({
    name: prefill?.name || "",
    brand: prefill?.brand || "",
    frozen_date: new Date().toISOString().split("T")[0],
    quantity: 1,
    containers: 1,
    notes: "",
    auto_print: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({
      ...f,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createItem({
        name: form.name,
        frozen_date: form.frozen_date,
        quantity: Number(form.quantity),
        containers: Number(form.containers),
        notes: form.notes || null,
        auto_print: form.auto_print,
      });
      navigate("/inventory");
    } catch (err) {
      alert("Failed to add item");
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = Number(form.containers) || 1;
  const servingsEach = Number(form.quantity) || 1;

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Add Item</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
            {prefill?.source === "open_food_facts" && (
              <span className="ml-2 inline-block bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                via Open Food Facts
              </span>
            )}
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={set("name")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Brand
          </label>
          <input
            type="text"
            value={form.brand}
            onChange={set("brand")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frozen Date
          </label>
          <input
            type="date"
            value={form.frozen_date}
            onChange={set("frozen_date")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Servings per container
            </label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={set("quantity")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of containers
            </label>
            <input
              type="number"
              min="1"
              value={form.containers}
              onChange={set("containers")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
            />
          </div>
        </div>

        {totalItems > 1 && (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            This will add <strong>{totalItems} items</strong> to the freezer
            ({servingsEach} serving{servingsEach > 1 ? "s" : ""} each)
            {form.auto_print && <> and print <strong>{totalItems} labels</strong></>}.
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--ice-blue)] focus:border-transparent outline-none"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.auto_print}
            onChange={set("auto_print")}
            className="w-4 h-4 rounded text-[var(--ice-blue)] focus:ring-[var(--ice-blue)]"
          />
          <span className="text-sm text-gray-700">
            Print label{totalItems > 1 ? "s" : ""}
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-[var(--ice-blue)] text-white rounded-lg font-medium hover:bg-[#4a9bd9] transition-colors disabled:opacity-50"
        >
          {submitting
            ? `Adding ${totalItems > 1 ? `${totalItems} items` : "item"}...`
            : `Add ${totalItems > 1 ? `${totalItems} containers` : ""} to Freezer`}
        </button>
      </form>
    </div>
  );
}
