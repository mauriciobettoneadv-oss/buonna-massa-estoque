import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];
const PRICE_UNITS = ['Kilo', 'Bisnaga', 'Lata', 'Fardo', 'Balde', 'Caixa', 'Garrafa', 'Unidade'];

const emptyForm = {
  name: '', category: CATEGORIES[0], unit_measure: '', purchase_unit: '',
  min_stock_sao_pedro: '', min_stock_piracicaba: '',
  supplier: '', box_qty: '', box_unit_weight: '', price_unit: '', price_per_package: '',
};

function productToForm(p) {
  return {
    name: p.name,
    category: p.category,
    unit_measure: p.unit_measure,
    purchase_unit: p.purchase_unit,
    min_stock_sao_pedro: p.min_stock_sao_pedro ?? '',
    min_stock_piracicaba: p.min_stock_piracicaba ?? '',
    supplier: p.supplier || '',
    box_qty: p.box_qty ?? '',
    box_unit_weight: p.box_unit_weight ?? '',
    price_unit: p.price_unit || '',
    price_per_package: p.price_per_package ?? '',
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
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);

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
        min_stock_sao_pedro: addForm.min_stock_sao_pedro !== '' ? Number(addForm.min_stock_sao_pedro) : 0,
        min_stock_piracicaba: addForm.min_stock_piracicaba !== '' ? Number(addForm.min_stock_piracicaba) : 0,
        box_qty: addForm.box_qty !== '' ? Number(addForm.box_qty) : null,
        box_unit_weight: addForm.box_unit_weight !== '' ? Number(addForm.box_unit_weight) : null,
        price_unit: addForm.price_unit || null,
        price_per_package: addForm.price_per_package !== '' ? Number(addForm.price_per_package) : null,
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
        min_stock_sao_pedro: editForm.min_stock_sao_pedro !== '' ? Number(editForm.min_stock_sao_pedro) : 0,
        min_stock_piracicaba: editForm.min_stock_piracicaba !== '' ? Number(editForm.min_stock_piracicaba) : 0,
        box_qty: editForm.box_qty !== '' ? Number(editForm.box_qty) : null,
        box_unit_weight: editForm.box_unit_weight !== '' ? Number(editForm.box_unit_weight) : null,
        price_unit: editForm.price_unit || null,
        price_per_package: editForm.price_per_package !== '' ? Number(editForm.price_per_package) : null,
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
    <div className="max-w-5xl mx-auto p-4">
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

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="🔍 Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 w-full max-w-sm text-sm focus:outline-none focus:border-brand-red"
        />
        <button
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? 'Ocultar produtos fora de linha' : 'Mostrar produtos fora de linha'}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
            showHidden
              ? 'bg-gray-200 border-gray-400 text-gray-700'
              : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600'
          }`}
        >
          {showHidden ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
          {showHidden ? 'Ocultar fora de linha' : 'Ver fora de linha'}
          {!showHidden && products.filter(p => !p.active).length > 0 && (
            <span className="bg-gray-300 text-gray-600 rounded-full text-xs px-1.5 py-0.5 font-medium">
              {products.filter(p => !p.active).length}
            </span>
          )}
        </button>
      </div>

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
          <input placeholder="Fornecedor" value={addForm.supplier}
            onChange={(e) => setAddForm({ ...addForm, supplier: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2 col-span-2" />

          {/* Mínimos por loja */}
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Estoque Mínimo por Loja</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mín. São Pedro</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={addForm.min_stock_sao_pedro}
                  onChange={(e) => setAddForm({ ...addForm, min_stock_sao_pedro: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mín. Piracicaba</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={addForm.min_stock_piracicaba}
                  onChange={(e) => setAddForm({ ...addForm, min_stock_piracicaba: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
              </div>
            </div>
          </div>

          {/* Composição da caixa */}
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Composição da Caixa (opcional)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Qtd por caixa</label>
                <input type="number" step="1" min="1" placeholder="ex: 6" value={addForm.box_qty}
                  onChange={(e) => setAddForm({ ...addForm, box_qty: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Peso/vol por un.</label>
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
              <div>
                <label className="block text-xs text-gray-500 mb-1">Preço por pacote (R$)</label>
                <input type="number" step="0.01" min="0" placeholder="ex: 45,00" value={addForm.price_per_package}
                  onChange={(e) => setAddForm({ ...addForm, price_per_package: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full text-sm" />
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

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-3 py-2">Produto</th>
              <th className="text-left px-3 py-2 hidden sm:table-cell">Categoria</th>
              <th className="text-left px-3 py-2">Un. Contagem</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Un. Compra</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Mín. SP</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Mín. PRC</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Caixa / Preço</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products
              .filter(p => (showHidden ? true : p.active))
              .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
              .map((p) => {
              const isEditing = editingId === p.id;
              if (isEditing) {
                return (
                  <tr key={p.id} style={{ background: '#fffbea', borderLeft: '3px solid #ee4723' }}>
                    <td colSpan={8} className="p-3">
                      <div className="grid grid-cols-2 gap-2 mb-2 sm:grid-cols-3">
                        <div>
                          <label className="text-xs text-gray-500">Nome</label>
                          <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Categoria</label>
                          <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className={inputCls}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Un. contagem</label>
                          <input value={editForm.unit_measure} onChange={(e) => setEditForm({ ...editForm, unit_measure: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Un. compra</label>
                          <input value={editForm.purchase_unit} onChange={(e) => setEditForm({ ...editForm, purchase_unit: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Fornecedor</label>
                          <input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} className={inputCls} />
                        </div>
                      </div>

                      {/* Mínimos por loja */}
                      <div className="border-t pt-2 mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Estoque Mínimo por Loja</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div>
                            <label className="text-xs text-gray-500">Mín. São Pedro</label>
                            <input type="number" step="0.01" value={editForm.min_stock_sao_pedro} onChange={(e) => setEditForm({ ...editForm, min_stock_sao_pedro: e.target.value })} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Mín. Piracicaba</label>
                            <input type="number" step="0.01" value={editForm.min_stock_piracicaba} onChange={(e) => setEditForm({ ...editForm, min_stock_piracicaba: e.target.value })} className={inputCls} />
                          </div>
                        </div>
                      </div>

                      {/* Caixa e preço */}
                      <div className="border-t pt-2 mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Caixa & Preço</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div>
                            <label className="text-xs text-gray-500">Qtd/caixa</label>
                            <input type="number" step="1" min="1" value={editForm.box_qty} onChange={(e) => setEditForm({ ...editForm, box_qty: e.target.value })} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Peso/vol por un.</label>
                            <input type="number" step="0.001" min="0" value={editForm.box_unit_weight} onChange={(e) => setEditForm({ ...editForm, box_unit_weight: e.target.value })} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Preço por</label>
                            <select value={editForm.price_unit} onChange={(e) => setEditForm({ ...editForm, price_unit: e.target.value })} className={inputCls}>
                              <option value="">— selecione —</option>
                              {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Preço por pacote (R$)</label>
                            <input type="number" step="0.01" min="0" placeholder="ex: 45,00" value={editForm.price_per_package} onChange={(e) => setEditForm({ ...editForm, price_per_package: e.target.value })} className={inputCls} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(p.id)} className="bg-green-600 text-white rounded px-3 py-1 text-sm font-medium hover:opacity-90">✓ Salvar</button>
                        <button onClick={cancelEdit} className="bg-gray-200 text-gray-700 rounded px-3 py-1 text-sm font-medium hover:bg-gray-300">✗ Cancelar</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.active ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2">
                    <span className={p.active ? 'font-medium text-gray-800' : 'line-through text-gray-400'}>{p.name}</span>
                    {p.supplier && <p className="text-xs text-gray-400">{p.supplier}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{p.category}</td>
                  <td className="px-3 py-2 text-gray-600">{p.unit_measure}</td>
                  <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{p.purchase_unit}</td>
                  <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{p.min_stock_sao_pedro ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{p.min_stock_piracicaba ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-blue-600 hidden lg:table-cell">
                    {p.box_qty && p.box_unit_weight
                      ? `${p.box_qty}un × ${p.box_unit_weight} = ${(Number(p.box_qty) * Number(p.box_unit_weight)).toFixed(2)}`
                      : p.box_qty ? `${p.box_qty} un/cx` : '—'}
                    {p.price_per_package ? ` · R$ ${Number(p.price_per_package).toFixed(2)}` : ''}
                    {p.price_unit ? `/${p.price_unit}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(p)} className="text-sm text-brand-red hover:underline mr-3">Editar</button>
                    <button onClick={() => toggleActive(p)} className="text-sm text-gray-400 hover:underline">
                      {p.active ? 'Ocultar' : 'Exibir'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
