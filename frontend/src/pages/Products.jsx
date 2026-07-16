import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];

const emptyForm = {
  name: '', category: CATEGORIES[0], unit_measure: '', purchase_unit: '', min_stock: '', supplier: '',
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
      const body = { ...form, min_stock: Number(form.min_stock) };
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
