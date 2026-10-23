import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CATEGORIES = ['Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros'];
const DELIVERY_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const CANAIS_COMPRA_OPTIONS = [
  { value: 'WhatsApp', label: 'WhatsApp', color: 'bg-green-100 text-green-700' },
  { value: 'Site', label: 'Site', color: 'bg-blue-100 text-blue-700' },
  { value: 'Aplicativo', label: 'Aplicativo', color: 'bg-purple-100 text-purple-700' },
];

const EMPTY_SUPPLIER = {
  name: '',
  categories: [],
  phone: '',
  email: '',
  min_order: '',
  delivery_days: [],
  delivery_cities: [],
  notes: '',
  canais_compra: [],
  canal_preferencial: '',
};

function toggleItem(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function Suppliers() {
  const { token } = useAuth();
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState(null); // { supplier, prices }
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [editInfo, setEditInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [priceEdits, setPriceEdits] = useState({}); // product_id -> value string
  const [savingPrice, setSavingPrice] = useState({}); // product_id -> bool
  const [unitContacts, setUnitContacts] = useState({}); // unit_id -> contact fields
  const [savingContact, setSavingContact] = useState({}); // unit_id -> bool
  const [expandedUnit, setExpandedUnit] = useState(null);
  const [mesmoVendedor, setMesmoVendedor] = useState(false);
  const [error, setError] = useState('');

  const loadSuppliers = useCallback(async () => {
    const data = await request('/suppliers', { token });
    setSuppliers(data);
  }, [token]);

  useEffect(() => {
    Promise.all([
      request('/suppliers', { token }),
      request('/products', { token }),
      request('/units', { token }),
    ]).then(([s, p, u]) => {
      setSuppliers(s);
      setProducts(p.filter ? p.filter(x => x.active !== false) : p);
      setUnits(u);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || 'Erro ao carregar fornecedores.');
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
    // Pre-populate unit contacts
    const uc = {};
    (data.contacts || []).forEach(c => {
      uc[c.unit_id] = { contact_name: c.contact_name || '', phone: c.phone || '', email: c.email || '', delivery_days: c.delivery_days || [] };
    });
    setUnitContacts(uc);
    setEditInfo(false);
    setExpandedUnit(null);
    setMesmoVendedor(data.supplier.mesmo_vendedor || false);
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
        delivery_cities: form.delivery_cities || [],
        canais_compra: form.canais_compra || [],
        canal_preferencial: form.canal_preferencial || null,
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
        delivery_cities: selected.supplier.delivery_cities || [],
        notes: selected.supplier.notes,
        canais_compra: selected.supplier.canais_compra || [],
        canal_preferencial: selected.supplier.canal_preferencial || null,
        mesmo_vendedor: mesmoVendedor,
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

  function updateUnitContact(unitId, field, value) {
    setUnitContacts(uc => ({
      ...uc,
      [unitId]: { ...(uc[unitId] || {}), [field]: value },
    }));
  }

  async function handleSaveUnitContact(unitId) {
    setSavingContact(s => ({ ...s, [unitId]: true }));
    try {
      const contact = unitContacts[unitId] || {};
      await request(`/suppliers/${selected.supplier.id}/unit-contacts`, {
        method: 'POST',
        body: { unit_id: unitId, ...contact },
        token,
      });
    } catch (err) {
      setError(err.message || 'Erro ao salvar contato.');
    } finally {
      setSavingContact(s => ({ ...s, [unitId]: false }));
    }
  }

  // Group products by category
  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;
  if (error && !suppliers.length) return <div className="p-8 text-center text-red-600">{error}</div>;

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
                        onChange={() => updateSupplierField('categories', toggleItem(toArray(sup.categories), cat))}
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
                        onChange={() => updateSupplierField('delivery_days', toggleItem(toArray(sup.delivery_days), day))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cidades de entrega</label>
                <div className="flex flex-wrap gap-2">
                  {units.map(u => (
                    <label key={u.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toArray(sup.delivery_cities).includes(u.name)}
                        onChange={() => updateSupplierField('delivery_cities', toggleItem(toArray(sup.delivery_cities), u.name))}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Canal de compra</label>
                <div className="flex flex-wrap gap-3 mb-2">
                  {CANAIS_COMPRA_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toArray(sup.canais_compra).includes(opt.value)}
                        onChange={() => {
                          const updated = toggleItem(toArray(sup.canais_compra), opt.value);
                          updateSupplierField('canais_compra', updated);
                          if (!updated.includes(sup.canal_preferencial)) {
                            updateSupplierField('canal_preferencial', updated[0] || '');
                          }
                        }}
                      />
                      {opt.value}
                    </label>
                  ))}
                </div>
                {toArray(sup.canais_compra).length > 1 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Canal preferencial</p>
                    <div className="flex flex-wrap gap-3">
                      {toArray(sup.canais_compra).map(ch => (
                        <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="canal_preferencial_edit"
                            checked={sup.canal_preferencial === ch}
                            onChange={() => updateSupplierField('canal_preferencial', ch)}
                          />
                          {ch}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
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
              {sup.delivery_cities?.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Cidades de entrega</p>
                  <div className="flex flex-wrap gap-1">
                    {sup.delivery_cities.map(c => (
                      <span key={c} className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full">📍 {c}</span>
                    ))}
                  </div>
                </div>
              )}
              {sup.canais_compra?.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Canal de compra</p>
                  <div className="flex flex-wrap gap-1">
                    {sup.canais_compra.map(c => {
                      const opt = CANAIS_COMPRA_OPTIONS.find(o => o.value === c);
                      const isPref = sup.canal_preferencial === c;
                      return (
                        <span key={c} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${opt ? opt.color : 'bg-gray-100 text-gray-600'}`}>
                          {c}{isPref && <span title="Preferencial">★</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {sup.notes && (
                <div className="col-span-4">
                  <p className="text-gray-500">Observações</p>
                  <p className="text-gray-700">{sup.notes}</p>
                </div>
              )}
              {(selected.contacts || []).length > 0 && (
                <div className="col-span-4">
                  <p className="text-gray-500 mb-1">Contatos por unidade</p>
                  <div className="flex flex-wrap gap-3">
                    {selected.contacts.map(c => (
                      <div key={c.unit_id} className="text-xs bg-blue-50 text-blue-800 px-3 py-1.5 rounded-lg">
                        <span className="font-semibold">{c.unit_name}:</span>{' '}
                        {c.contact_name && <span>{c.contact_name} · </span>}
                        {c.phone && <span>{c.phone}</span>}
                        {c.delivery_days?.length > 0 && <span> · {c.delivery_days.join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unit Contacts section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Contatos por Unidade</h3>

          {/* Mesmo vendedor toggle */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mesmoVendedor}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setMesmoVendedor(val);
                  try {
                    await request(`/suppliers/${sup.id}`, {
                      method: 'PUT',
                      body: {
                        name: sup.name, categories: sup.categories, phone: sup.phone, email: sup.email,
                        min_order: sup.min_order, delivery_days: sup.delivery_days,
                        delivery_cities: sup.delivery_cities || [], notes: sup.notes,
                        canais_compra: sup.canais_compra || [], canal_preferencial: sup.canal_preferencial || null, mesmo_vendedor: val,
                      },
                      token,
                    });
                  } catch (err) {
                    setError(err.message || 'Erro ao salvar.');
                  }
                }}
                className="w-4 h-4 accent-brand-red"
              />
              <span className="text-sm font-medium text-gray-700">Mesmo vendedor para todas as unidades</span>
            </label>
            {mesmoVendedor && <span className="text-xs text-gray-400">Os campos de contato abaixo valem para todas as unidades. Os dias de entrega continuam por unidade.</span>}
          </div>

          {mesmoVendedor ? (
            <div className="border border-gray-200 rounded-lg mb-3 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Contato único (todas as unidades)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome do contato</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    value={(unitContacts['shared'] || {}).contact_name || ''}
                    onChange={e => setUnitContacts(uc => ({ ...uc, shared: { ...(uc.shared || {}), contact_name: e.target.value } }))}
                    onBlur={() => {
                      units.forEach(unit => {
                        const shared = unitContacts['shared'] || {};
                        const existing = unitContacts[unit.id] || {};
                        updateUnitContact(unit.id, 'contact_name', shared.contact_name || existing.contact_name || '');
                        updateUnitContact(unit.id, 'phone', shared.phone || existing.phone || '');
                        updateUnitContact(unit.id, 'email', shared.email || existing.email || '');
                      });
                    }}
                    placeholder="Ex: João Vendas"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefone/WhatsApp</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    value={(unitContacts['shared'] || {}).phone || ''}
                    onChange={e => setUnitContacts(uc => ({ ...uc, shared: { ...(uc.shared || {}), phone: e.target.value } }))}
                    placeholder="19999999999"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    value={(unitContacts['shared'] || {}).email || ''}
                    onChange={e => setUnitContacts(uc => ({ ...uc, shared: { ...(uc.shared || {}), email: e.target.value } }))}
                    placeholder="vendas@fornecedor.com"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const shared = unitContacts['shared'] || {};
                  for (const unit of units) {
                    const existing = unitContacts[unit.id] || {};
                    setUnitContacts(uc => ({
                      ...uc,
                      [unit.id]: { ...existing, contact_name: shared.contact_name || '', phone: shared.phone || '', email: shared.email || '' },
                    }));
                    await handleSaveUnitContact(unit.id);
                  }
                }}
                className="mt-3 bg-brand-red text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90"
              >
                Salvar contato para todas as unidades
              </button>
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-600 mb-2">Dias de entrega por unidade</p>
                {units.map(unit => {
                  const contact = unitContacts[unit.id] || {};
                  return (
                    <div key={unit.id} className="mb-2">
                      <p className="text-xs text-gray-500 mb-1">{unit.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {DELIVERY_DAYS.map(day => (
                          <label key={day} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(contact.delivery_days || []).includes(day)}
                              onChange={() => {
                                updateUnitContact(unit.id, 'delivery_days', toggleItem(contact.delivery_days || [], day));
                                setTimeout(() => handleSaveUnitContact(unit.id), 0);
                              }}
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">Configure telefone, e-mail e dias de entrega separados para cada unidade.</p>
          {units.map(unit => {
            const contact = unitContacts[unit.id] || {};
            const isExpanded = expandedUnit === unit.id;
            const isSaving = savingContact[unit.id];
            const existingContact = (selected.contacts || []).find(c => c.unit_id === unit.id);
            return (
              <div key={unit.id} className="border border-gray-200 rounded-lg mb-3">
                <button
                  type="button"
                  onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg"
                >
                  <span className="font-medium text-sm text-gray-700">{unit.name}</span>
                  <div className="flex items-center gap-2">
                    {existingContact?.phone && (
                      <span className="text-xs text-gray-500">{existingContact.phone}</span>
                    )}
                    <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nome do contato</label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                          value={contact.contact_name || ''}
                          onChange={e => updateUnitContact(unit.id, 'contact_name', e.target.value)}
                          onBlur={() => handleSaveUnitContact(unit.id)}
                          placeholder="Ex: João Vendas"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Telefone/WhatsApp</label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                          value={contact.phone || ''}
                          onChange={e => updateUnitContact(unit.id, 'phone', e.target.value)}
                          onBlur={() => handleSaveUnitContact(unit.id)}
                          placeholder="19999999999"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                        <input
                          type="email"
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                          value={contact.email || ''}
                          onChange={e => updateUnitContact(unit.id, 'email', e.target.value)}
                          onBlur={() => handleSaveUnitContact(unit.id)}
                          placeholder="vendas@fornecedor.com"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">Dias de entrega nesta unidade</label>
                      <div className="flex flex-wrap gap-2">
                        {DELIVERY_DAYS.map(day => (
                          <label key={day} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(contact.delivery_days || []).includes(day)}
                              onChange={() => updateUnitContact(unit.id, 'delivery_days', toggleItem(contact.delivery_days || [], day))}
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveUnitContact(unit.id)}
                        disabled={isSaving}
                        className="bg-brand-red text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {isSaving ? 'Salvando...' : 'Salvar contato'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
            </>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Cidades de entrega</label>
            <div className="flex flex-wrap gap-3">
              {units.map(u => (
                <label key={u.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form.delivery_cities || []).includes(u.name)}
                    onChange={() => setForm({ ...form, delivery_cities: toggleItem(form.delivery_cities || [], u.name) })}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Canal de compra</label>
            <div className="flex flex-wrap gap-3 mb-2">
              {CANAIS_COMPRA_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form.canais_compra || []).includes(opt.value)}
                    onChange={() => {
                      const updated = toggleItem(form.canais_compra || [], opt.value);
                      const pref = updated.includes(form.canal_preferencial) ? form.canal_preferencial : (updated[0] || '');
                      setForm({ ...form, canais_compra: updated, canal_preferencial: pref });
                    }}
                  />
                  {opt.value}
                </label>
              ))}
            </div>
            {(form.canais_compra || []).length > 1 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Canal preferencial</p>
                <div className="flex flex-wrap gap-3">
                  {(form.canais_compra || []).map(ch => (
                    <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="canal_preferencial_create"
                        checked={form.canal_preferencial === ch}
                        onChange={() => setForm({ ...form, canal_preferencial: ch })}
                      />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>
            )}
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
                  {toArray(s.categories).map(c => (
                    <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                  ))}
                  {toArray(s.canais_compra).map(c => {
                    const opt = CANAIS_COMPRA_OPTIONS.find(o => o.value === c);
                    const isPref = s.canal_preferencial === c;
                    return <span key={c} className={`text-xs px-2 py-0.5 rounded-full ${opt ? opt.color : 'bg-gray-100 text-gray-600'}`}>{c}{isPref ? ' ★' : ''}</span>;
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                  {s.phone && <span>{s.phone}</span>}
                  {s.delivery_days?.length > 0 && (
                    <span>Entrega: {s.delivery_days.join(', ')}</span>
                  )}
                  {(() => {
                    const cities = s.delivery_cities?.length > 0
                      ? s.delivery_cities
                      : (s.contact_cities?.length > 0 ? s.contact_cities : []);
                    return cities.length > 0 ? <span>📍 {cities.join(', ')}</span> : null;
                  })()}
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
