import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];
const PRICE_UNITS = ['Kilo', 'Bisnaga', 'Lata', 'Fardo', 'Balde', 'Caixa', 'Unidade'];

const emptyForm = {
  name: '', category: CATEGORIES[0], unit_measure: '', purchase_unit: '', min_stock: '', supplier: '',
  box_qty: '', box_unit_weight: '', price_unit: '',
};

function productToForm(p) {
  return {
    name: p.name,
    category: p.category,
    unit_measure: p.unit_measure,
    purchase_unit: p.purchase_unit,
    min_stock: p.min_stock,
    supplier: p.supplier || '',
    box_qty: p.box_qty ?? '',
    box_unit_weight: p.box_unit_weight ?? '',
    price_unit: p.price_unit || '',
  };
}

export default function Products() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');

  async function loadProducts() {
    const data = await request('/products?includeInactive=true', { token });
    setProducts(data);
  }

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message));
  }, [token]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...addForm,
        min_stock: Number(addForm.min_stock),
        box_qty: addForm.box_qty !== '' ? Number(addForm.box_qty) : null,
        box_unit_weight: addForm.box_unit_weight !== '' ? Number(addForm.box_unit_weight) : null,
        price_unit: addForm.price_unit || null,
      };
      await request('/products', { method: 'POST', token, body });
      setAddForm(emptyForm);
      setShowAddForm(false);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveEdit(productId) {
    setError('');
    try {
      const body = {
        ...editForm,
        min_stock: Number(editForm.min_stock),
        box_qty: editForm.box_qty !== '' ? Number(editForm.box_qty) : null,
        box_unit_weight: editForm.box_unit_weight !== '' ? Number(editForm.box_unit_weight) : null,
        price_unit: editForm.price_unit || null,
      };
      await request(`/products/${productId}`, { method: 'PUT', token, body });
      setEditingId(null);
      setEditForm({});
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(product) {
    setEditingId(product.id);
    setEditForm(productToForm(product));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function toggleActive(product) {
    await request(`/products/${product.id}/active`, {
      method: 'PATCH', token, body: { active: !product.active },
    });
    await loadProducts();
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-brand-red">Cadastro de Produtos</h1>
        <button
          onClick={() => { setShowAddForm((v) => !v); setAddForm(emptyForm); }}
          className="bg-brand-red text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          {showAddForm ? '✕ Cancelar' : '+ Adicionar produto'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-2 gap-3">
          <p className="col-span-2 text-sm font-semibold text-gray-600 border-b pb-2 mb-1">Novo Produto</p>
          <input required placeholder="Nome do produto" value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2" />
          <select value={addForm.category}
            onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input required placeholder="Unidade de contagem (kg, un...)" value={addForm.unit_measure}
            onChange={(e) => setAddForm({ ...addForm, unit_measure: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2" />
          <input required placeholder="Unidade de compra (caixa, fardo...)" value={addForm.purchase_unit}
            onChange={(e) => setAddForm({ ...addForm, purchase_unit: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2" />
          <input required type="number" step="0.01" placeholder="Estoque mínimo" value={addForm.min_stock}
            onChange={(e) => setAddForm({ ...addForm, min_stock: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2" />
          <input placeholder="Fornecedor" value={addForm.supplier}
            onChange={(e) => setAddForm({ ...addForm, supplier: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2" />
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Composição da Caixa (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Qtd por caixa</label>
                <input type="number" step="1" min="1" placeholder="ex: 6" value={addForm.box_qty}
                  onChange={(e) => setAddForm({ ...addForm, box_qty: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Peso/vol por unidade</label>
                <input type="number" step="0.001" min="0" placeholder="ex: 4 (kg)" value={addForm.box_unit_weight}
                  onChange={(e) => setAddForm({ ...addForm, box_unit_weight: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Preço por</label>
                <select value={addForm.price_unit}
                  onChange={(e) => setAddForm({ ...addForm, price_unit: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm">
                  <option value="">— selecione —</option>
                  {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-brand-red text-white rounded px-4 py-2 font-medium hover:opacity-90">
              Adicionar produto
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow divide-y">
        {products.map((p) => {
          const isEditing = editingId === p.id;
          if (isEditing) {
            return (
              <div key={p.id} style={{ borderLeft: '3px solid #ee4723', background: '#fffbea' }} className="p-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs text-gray-500">Nome</label>
                    <input value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Categoria</label>
                    <select value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className={inputCls}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Un. de contagem</label>
                    <input value={editForm.unit_measure}
                      onChange={(e) => setEditForm({ ...editForm, unit_measure: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Un. de compra</label>
                    <input value={editForm.purchase_unit}
                      onChange={(e) => setEditForm({ ...editForm, purchase_unit: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Estoque mínimo</label>
                    <input type="number" step="0.01" value={editForm.min_stock}
                      onChange={(e) => setEditForm({ ...editForm, min_stock: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Fornecedor</label>
                    <input value={editForm.supplier}
                      onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Qtd/caixa</label>
                    <input type="number" step="1" min="1" value={editForm.box_qty}
                      onChange={(e) => setEditForm({ ...editForm, box_qty: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Peso/vol por unidade</label>
                    <input type="number" step="0.001" min="0" value={editForm.box_unit_weight}
                      onChange={(e) => setEditForm({ ...editForm, box_unit_weight: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Preço por</label>
                    <select value={editForm.price_unit}
                      onChange={(e) => setEditForm({ ...editForm, price_unit: e.target.value })}
                      className={inputCls}>
                      <option value="">— selecione —</option>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleSaveEdit(p.id)}
                    className="bg-green-600 text-white rounded px-3 py-1 text-sm font-medium hover:opacity-90">
                    ✓ Salvar
                  </button>
                  <button onClick={cancelEdit}
                    className="bg-gray-200 text-gray-700 rounded px-3 py-1 text-sm font-medium hover:bg-gray-300">
                    ✗ Cancelar
                  </button>
                </div>
              </div>
            );
          }
          return (
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
          );
        })}
      </div>
    </div>
  );
}
