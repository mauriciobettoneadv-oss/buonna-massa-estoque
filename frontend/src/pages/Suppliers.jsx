import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];
const DELIVERY_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const EMPTY_SUPPLIER = {
  name: '',
  categories: [],
  phone: '',
  email: '',
  min_order: '',
  delivery_days: [],
  notes: '',
};

function toggleItem(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

export default function Suppliers() {
  const { token } = useAuth();
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState(null); // { supplier, prices }
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [editInfo, setEditInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [priceEdits, setPriceEdits] = useState({}); // product_id -> value string
  const [savingPrice, setSavingPrice] = useState({}); // product_id -> bool
  const [error, setError] = useState('');

  const loadSuppliers = useCallback(async () => {
    const data = await request('/suppliers', { token });
    setSuppliers(data);
  }, [token]);

  useEffect(() => {
    Promise.all([
      request('/suppliers', { token }),
      request('/products', { token }),
    ]).then(([s, p]) => {
      setSuppliers(s);
      setProducts(p.filter ? p.filter(x => x.active !== false) : p);
      setLoading(false);
    });
  }, [token]);

  async function openDetail(supplier) {
    const data = await request(`/suppliers/${supplier.id}`, { token });
    setSelected(data);
    // Pre-populate price edits from existing prices
    const pe = {};
    data.prices.forEach(p => { pe[p.product_id] = String(p.unit_price); });
    setPriceEdits(pe);
    setEditInfo(false);
    setView('detail');
  }

  function backToList() {
    setView('list');
    setSelected(null);
    setPriceEdits({});
    loadSuppliers();
  }

  // Create new supplier
  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        min_order: form.min_order !== '' ? Number(form.min_order) : 0,
      };
      const created = await request('/suppliers', { method: 'POST', body, token });
      setSuppliers([...suppliers, { ...created, product_count: '0' }]);
      setShowForm(false);
      setForm(EMPTY_SUPPLIER);
    } catch (err) {
      setError(err.message || 'Erro ao criar fornecedor.');
    }
  }

  // Update supplier info
  async function handleUpdateInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      const body = {
        name: selected.supplier.name,
        categories: selected.supplier.categories,
        phone: selected.supplier.phone,
        email: selected.supplier.email,
        min_order: selected.supplier.min_order,
        delivery_days: selected.supplier.delivery_days,
        notes: selected.supplier.notes,
      };
      const updated = await request(`/suppliers/${selected.supplier.id}`, { method: 'PUT', body, token });
      setSelected(s => ({ ...s, supplier: updated }));
      setEditInfo(false);
    } catch (err) {
      setError(err.message || 'Erro ao salvar.');
    } finally {
      setSavingInfo(false);
    }
  }

  function updateSupplierField(field, value) {
    setSelected(s => ({ ...s, supplier: { ...s.supplier, [field]: value } }));
  }

  async function handleSavePrice(productId) {
    const val = priceEdits[productId];
    if (val === undefined || val === '') {
      // Delete price if empty
      const existing = selected.prices.find(p => p.product_id === productId);
      if (existing) {
        await request(`/suppliers/${selected.supplier.id}/prices/${existing.id}`, { method: 'DELETE', token });
        setSelected(s => ({ ...s, prices: s.prices.filter(p => p.product_id !== productId) }));
      }
      return;
    }
    setSavingPrice(s => ({ ...s, [productId]: true }));
    try {
      const saved = await request(`/suppliers/${selected.supplier.id}/prices`, {
        method: 'POST',
        body: { product_id: productId, unit_price: Number(val) },
        token,
      });
      setSelected(s => {
        const existing = s.prices.find(p => p.product_id === productId);
        const product = products.find(p => p.id === productId);
        const newEntry = {
          ...saved,
          product_name: product?.name,
          unit_measure: product?.unit_measure,
          category: product?.category,
        };
        if (existing) {
          return { ...s, prices: s.prices.map(p => p.product_id === productId ? { ...p, ...newEntry } : p) };
        }
        return { ...s, prices: [...s.prices, newEntry] };
      });
    } finally {
      setSavingPrice(s => ({ ...s, [productId]: false }));
    }
  }

  // Group products by category
  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  // ── DETAIL VIEW ──
  if (view === 'detail' && selected) {
    const sup = selected.supplier;
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button onClick={backToList} className="text-sm text-brand-red hover:underline mb-4 flex items-center gap-1">
          ← Voltar para lista
        </button>

        {/* Supplier info section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">{sup.name}</h2>
            <div className="flex gap-2">
              {!editInfo && (
                <button
                  onClick={() => setEditInfo(true)}
                  className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  Editar
                </button>
              )}
              <button
                onClick={async () => {
                  await request(`/suppliers/${sup.id}/active`, { method: 'PATCH', token });
                  setSelected(s => ({ ...s, supplier: { ...s.supplier, active: !s.supplier.active } }));
                }}
                className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                {sup.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>

          {editInfo ? (
            <form onSubmit={handleUpdateInfo} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={sup.name}
                    onChange={e => updateSupplierField('name', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={sup.phone || ''}
                    onChange={e => updateSupplierField('phone', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={sup.email || ''}
                    onChange={e => updateSupplierField('email', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pedido mínimo (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={sup.min_order || ''}
                    onChange={e => updateSupplierField('min_order', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categorias</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sup.categories?.includes(cat) || false}
                        onChange={() => updateSupplierField('categories', toggleItem(sup.categories || [], cat))}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dias de entrega</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_DAYS.map(day => (
                    <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sup.delivery_days?.includes(day) || false}
                        onChange={() => updateSupplierField('delivery_days', toggleItem(sup.delivery_days || [], day))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  value={sup.notes || ''}
                  onChange={e => updateSupplierField('notes', e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingInfo}
                  className="bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {savingInfo ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditInfo(false)}
                  className="border border-gray-300 px-5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Telefone</p>
                <p className="font-medium">{sup.phone || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">E-mail</p>
                <p className="font-medium">{sup.email || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Pedido mínimo</p>
                <p className="font-medium">{sup.min_order > 0 ? `R$ ${Number(sup.min_order).toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`font-medium ${sup.active ? 'text-green-600' : 'text-gray-400'}`}>
                  {sup.active ? 'Ativo' : 'Inativo'}
                </p>
              </div>
              {sup.categories?.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Categorias</p>
                  <div className="flex flex-wrap gap-1">
                    {sup.categories.map(c => (
                      <span key={c} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {sup.delivery_days?.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Dias de entrega</p>
                  <div className="flex flex-wrap gap-1">
                    {sup.delivery_days.map(d => (
                      <span key={d} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {sup.notes && (
                <div className="col-span-4">
                  <p className="text-gray-500">Observações</p>
                  <p className="text-gray-700">{sup.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prices section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Preços por Produto</h3>
          <p className="text-xs text-gray-400 mb-4">Insira o preço unitário por produto. Deixe em branco para remover.</p>

          {Object.entries(productsByCategory).map(([cat, prods]) => (
            <div key={cat} className="mb-6">
              <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-2">{cat}</h4>
              <div className="space-y-1">
                {prods.map(p => {
                  const existingPrice = selected.prices.find(sp => sp.product_id === p.id);
                  const val = priceEdits[p.id] !== undefined ? priceEdits[p.id] : (existingPrice ? String(existingPrice.unit_price) : '');
                  const isSaving = savingPrice[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-1.5">
                      <span className="flex-1 text-sm text-gray-700">{p.name}</span>
                      <span className="text-xs text-gray-400 w-20">{p.unit_measure}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-500">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-sm"
                          value={val}
                          onChange={e => setPriceEdits(pe => ({ ...pe, [p.id]: e.target.value }))}
                          onBlur={() => handleSavePrice(p.id)}
                          placeholder="0,00"
                        />
                      </div>
                      {isSaving && <span className="text-xs text-gray-400">...</span>}
                      {existingPrice && !isSaving && (
                        <span className="text-xs text-gray-400">
                          {new Date(existingPrice.updated_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Fornecedores</h1>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_SUPPLIER); setError(''); }}
          className="bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          + Novo Fornecedor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">Novo Fornecedor</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pedido mínimo (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.min_order}
                onChange={e => setForm({ ...form, min_order: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Categorias</label>
            <div className="flex flex-wrap gap-3">
              {CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.categories.includes(cat)}
                    onChange={() => setForm({ ...form, categories: toggleItem(form.categories, cat) })}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Dias de entrega</label>
            <div className="flex flex-wrap gap-3">
              {DELIVERY_DAYS.map(day => (
                <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.delivery_days.includes(day)}
                    onChange={() => setForm({ ...form, delivery_days: toggleItem(form.delivery_days, day) })}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              className="bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              Criar Fornecedor
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="border border-gray-300 px-5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {suppliers.map(s => (
          <div
            key={s.id}
            onClick={() => openDetail(s)}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-brand-red hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">{s.name}</h3>
                  {!s.active && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inativo</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(s.categories || []).map(c => (
                    <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-sm text-gray-500">
                  {s.phone && <span>{s.phone}</span>}
                  {s.delivery_days?.length > 0 && (
                    <span>Entrega: {s.delivery_days.join(', ')}</span>
                  )}
                  {s.min_order > 0 && (
                    <span>Mín: R$ {Number(s.min_order).toFixed(2)}</span>
                  )}
                </div>
              </div>
              <div className="text-right ml-4">
                <p className="text-2xl font-bold text-gray-800">{s.product_count}</p>
                <p className="text-xs text-gray-400">produtos</p>
              </div>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="text-center py-12 text-gray-400">Nenhum fornecedor cadastrado.</div>
        )}
      </div>
    </div>
  );
}
