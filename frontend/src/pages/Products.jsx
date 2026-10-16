import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];

const PRICE_UNITS = ['Kilo', 'Bisnaga', 'Lata', 'Fardo', 'Balde', 'Caixa', 'Unidade'];

const emptyForm = {
  name: '', category: CATEGORIES[0], unit_measure: '', purchase_unit: '', min_stock: '', supplier: '',
  box_qty: '', box_unit_weight: '', price_unit: '',
};

export default function Products() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  async function loadProducts() {
    const data = await request('/products?includeInactive=true', { token });
    setProducts(data);
  }

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        min_stock: Number(form.min_stock),
        box_qty: form.box_qty !== '' ? Number(form.box_qty) : null,
        box_unit_weight: form.box_unit_weight !== '' ? Number(form.box_unit_weight) : null,
        price_unit: form.price_unit || null,
      };
      if (editingId) {
        await request(`/products/${editingId}`, { method: 'PUT', token, body });
      } else {
        await request('/products', { method: 'POST', token, body });
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      unit_measure: product.unit_measure,
      purchase_unit: product.purchase_unit,
      min_stock: product.min_stock,
      supplier: product.supplier || '',
      box_qty: product.box_qty ?? '',
      box_unit_weight: product.box_unit_weight ?? '',
      price_unit: product.price_unit || '',
    });
  }

  async function toggleActive(product) {
    await request(`/products/${product.id}/active`, {
      method: 'PATCH',
      token,
      body: { active: !product.active },
    });
    await loadProducts();
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Cadastro de Produtos</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-2 gap-3">
        <input
          required
          placeholder="Nome do produto"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          required
          placeholder="Unidade de contagem (kg, un, Peças...)"
          value={form.unit_measure}
          onChange={(e) => setForm({ ...form, unit_measure: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          required
          placeholder="Unidade de compra (caixa, fardo, kg...)"
          value={form.purchase_unit}
          onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          required
          type="number"
          step="0.01"
          placeholder="Estoque mínimo"
          value={form.min_stock}
          onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          placeholder="Fornecedor"
          value={form.supplier}
          onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2 col-span-2"
        />

        {/* Identificação da caixa */}
        <div className="col-span-2 border-t pt-3 mt-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Composição da Caixa (opcional)</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Qtd por caixa</label>
              <input
                type="number"
                step="1"
                min="1"
                placeholder="ex: 6"
                value={form.box_qty}
                onChange={(e) => setForm({ ...form, box_qty: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Peso/vol por unidade</label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="ex: 4 (kg)"
                value={form.box_unit_weight}
                onChange={(e) => setForm({ ...form, box_unit_weight: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Preço por</label>
              <select
                value={form.price_unit}
                onChange={(e) => setForm({ ...form, price_unit: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full text-sm"
              >
                <option value="">— selecione —</option>
                {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {form.box_qty && form.box_unit_weight && (
            <p className="text-xs text-gray-400 mt-1">
              Caixa com {form.box_qty} × {form.box_unit_weight} = {(Number(form.box_qty) * Number(form.box_unit_weight)).toFixed(3)} por caixa
            </p>
          )}
        </div>

        {error && <p className="text-red-600 text-sm col-span-2">{error}</p>}

        <div className="col-span-2 flex gap-2">
          <button type="submit" className="bg-brand-red text-white rounded px-4 py-2 font-medium hover:opacity-90">
            {editingId ? 'Salvar alterações' : 'Adicionar produto'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(emptyForm); }}
              className="border border-gray-300 rounded px-4 py-2"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-lg shadow divide-y">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className={p.active ? '' : 'line-through text-gray-400'}>
                {p.name} — {p.category} — conta em {p.unit_measure}, compra em {p.purchase_unit} — mín: {p.min_stock}
              </p>
              {(p.box_qty || p.price_unit) && (
                <p className="text-xs text-blue-600 mt-0.5">
                  {p.box_qty && p.box_unit_weight
                    ? `📦 Caixa: ${p.box_qty} un × ${p.box_unit_weight} = ${(Number(p.box_qty) * Number(p.box_unit_weight)).toFixed(3)}`
                    : p.box_qty ? `📦 ${p.box_qty} un/caixa` : ''}
                  {p.price_unit ? ` · Preço por ${p.price_unit}` : ''}
                </p>
              )}
              {p.supplier && <p className="text-xs text-gray-400">{p.supplier}</p>}
            </div>
            <button onClick={() => startEdit(p)} className="text-sm text-brand-red hover:underline">Editar</button>
            <button onClick={() => toggleActive(p)} className="text-sm hover:underline">
              {p.active ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
