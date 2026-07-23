import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const API = import.meta.env.VITE_API_URL;

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bestForProduct(prices, suppliers, productId) {
  let best = null;
  for (const s of suppliers) {
    const p = prices.find((px) => px.supplier_id === s.id && px.product_id === productId);
    const price = Number(p?.unit_price || 0);
    if (price > 0 && (best === null || price < best.price)) {
      best = { price, supplier: s.name, supplierId: s.id };
    }
  }
  return best;
}

// ─── New Quotation Modal ──────────────────────────────────────────────────────

function NewQuotationModal({ onClose, onCreated, token }) {
  const [counts, setCounts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    request('/stock-counts/finalized', { token }).then(setCounts).catch(() => {});
  }, [token]);

  function toggle(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function create() {
    if (!selected.length) return;
    setLoading(true);
    try {
      const q = await request('/quotations', { method: 'POST', token, body: { count_ids: selected } });
      onCreated(q.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-brand-red mb-4">Nova Cotação</h2>
        <p className="text-sm text-gray-600 mb-3">Selecione as contagens finalizadas para cotar:</p>
        <div className="divide-y border rounded-lg mb-4 max-h-64 overflow-y-auto">
          {counts.length === 0 && <p className="p-3 text-sm text-gray-400">Nenhuma contagem finalizada.</p>}
          {counts.map((c) => (
            <label key={c.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="accent-brand-red" />
              <span className="text-sm">
                <strong>{c.unit_name}</strong> — {new Date(c.created_at).toLocaleDateString('pt-BR')}
                <span className="ml-2 text-gray-400">({c.items_to_buy} itens a comprar)</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="border border-gray-300 rounded px-4 py-2 text-sm">Cancelar</button>
          <button onClick={create} disabled={!selected.length || loading} className="bg-brand-red text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar Cotação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extract Result Modal ─────────────────────────────────────────────────────

function ExtractResultModal({ result, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-bold text-brand-red mb-2">Preços extraídos do print</h2>
        <p className="text-sm text-gray-500 mb-4">
          {result.total_matched} de {result.total_extracted} itens identificados e salvos automaticamente.
        </p>
        <div className="overflow-y-auto flex-1 divide-y border rounded-lg mb-4">
          {result.matches.map((m, i) => (
            <div key={i} className="flex items-center gap-3 p-2 text-sm">
              <span className={`w-10 text-center text-xs font-bold rounded-full px-1 py-0.5 ${m.confidence >= 80 ? 'bg-green-100 text-green-700' : m.confidence >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                {m.confidence}%
              </span>
              <div className="flex-1">
                <p className="font-medium">{m.product_name}</p>
                <p className="text-xs text-gray-400">Extraído: "{m.extracted_name}"</p>
              </div>
              <span className="font-semibold text-green-700">{fmt(m.unit_price)}</span>
            </div>
          ))}
          {result.matches.length === 0 && <p className="p-4 text-gray-400 text-sm text-center">Nenhum produto reconhecido.</p>}
        </div>
        <button onClick={onClose} className="bg-brand-red text-white rounded px-4 py-2 text-sm w-full">
          Fechar e ver preços
        </button>
      </div>
    </div>
  );
}

// ─── Orders View ──────────────────────────────────────────────────────────────

function OrdersView({ quotationId, token, onBack }) {
  const [orders, setOrders] = useState(null);
  const [activeUnit, setActiveUnit] = useState(0);
  const [copied, setCopied] = useState({});

  useEffect(() => {
    request(`/quotations/${quotationId}/orders`, { token }).then((d) => setOrders(d.orders));
  }, [quotationId, token]);

  if (!orders) return <p className="text-gray-500 p-4">Carregando pedidos...</p>;

  function buildOrderText(order) {
    const date = new Date().toLocaleDateString('pt-BR');
    let text = '===========================================\n';
    text += `PEDIDO DE COMPRA – BUONNA MASSA\nUnidade: ${order.unit_name}\nData: ${date}\n`;
    text += '===========================================\n\n';
    for (const [supplier, items] of Object.entries(order.by_supplier)) {
      text += `FORNECEDOR: ${supplier}\n`;
      let sub = 0;
      for (const item of items) {
        sub += item.total_price;
        text += `  - ${item.name}: ${item.qty_to_buy} ${item.purchase_unit}`;
        if (item.unit_price > 0) text += ` × ${fmt(item.unit_price)} = ${fmt(item.total_price)}`;
        text += '\n';
      }
      if (sub > 0) text += `  Subtotal: ${fmt(sub)}\n`;
      text += '\n';
    }
    const total = order.items.reduce((s, i) => s + i.total_price, 0);
    if (total > 0) text += `TOTAL GERAL: ${fmt(total)}\n`;
    text += '===========================================';
    return text;
  }

  const order = orders[activeUnit];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-brand-red hover:underline mb-4">← Voltar à cotação</button>
      <h2 className="text-lg font-bold text-brand-red mb-4">Pedidos de Compra</h2>
      <div className="flex gap-2 mb-4">
        {orders.map((o, i) => (
          <button key={o.unit_id} onClick={() => setActiveUnit(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${activeUnit === i ? 'bg-brand-red text-white' : 'bg-white border border-gray-300'}`}>
            {o.unit_name}
          </button>
        ))}
      </div>
      {order && (
        <div className="bg-white rounded-lg shadow p-4">
          {Object.entries(order.by_supplier).map(([supplier, items]) => {
            const sub = items.reduce((s, i) => s + i.total_price, 0);
            return (
              <div key={supplier} className="mb-5">
                <h3 className="font-semibold text-gray-700 mb-2">📦 {supplier}</h3>
                <div className="divide-y border rounded-lg">
                  {items.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-3 p-2 text-sm">
                      <span className="flex-1">{item.name}</span>
                      <span className="text-gray-500">{item.qty_to_buy} {item.purchase_unit}</span>
                      {item.unit_price > 0 && <>
                        <span className="text-gray-400">× {fmt(item.unit_price)}</span>
                        <span className="font-medium w-24 text-right">{fmt(item.total_price)}</span>
                      </>}
                    </div>
                  ))}
                </div>
                {sub > 0 && <p className="text-right text-sm font-semibold mt-1">{fmt(sub)}</p>}
              </div>
            );
          })}
          {order.items.some((i) => i.total_price > 0) && (
            <p className="text-right font-bold text-brand-red border-t pt-2">
              Total {order.unit_name}: {fmt(order.items.reduce((s, i) => s + i.total_price, 0))}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => { navigator.clipboard.writeText(buildOrderText(order)); setCopied((p) => ({ ...p, [order.unit_id]: true })); }}
              className="border border-brand-red text-brand-red rounded px-4 py-2 text-sm hover:bg-brand-red hover:text-white">
              {copied[order.unit_id] ? 'Copiado!' : 'Copiar pedido'}
            </button>
            <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildOrderText(order))}`, '_blank')}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm hover:opacity-90">
              Enviar via WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supplier Tab Content ─────────────────────────────────────────────────────

function SupplierTab({ supplier, quotationId, products, data, localPrices, onPriceChange, onSave, onDelete, onExtracted, token }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const sp = localPrices[supplier.id] || {};

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API}/quotations/${quotationId}/suppliers/${supplier.id}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao extrair preços.');
      }
      const result = await res.json();
      setExtractResult(result);
      onExtracted();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="bg-white rounded-b-lg rounded-tr-lg shadow">
      {extractResult && (
        <ExtractResultModal result={extractResult} onClose={() => setExtractResult(null)} />
      )}
      <div className="flex items-center justify-between p-3 border-b gap-3">
        <span className="font-medium text-sm">{supplier.name}</span>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current.click()}
            disabled={uploading}
            className="flex items-center gap-1 bg-blue-600 text-white rounded px-3 py-1 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? (
              <><span className="animate-spin">⟳</span> Lendo print...</>
            ) : (
              <>📷 Ler preços do print</>
            )}
          </button>
          <button onClick={() => onSave(supplier.id)} className="bg-brand-red text-white rounded px-3 py-1 text-sm hover:opacity-90">
            Salvar preços
          </button>
          <button onClick={() => onDelete(supplier.id)} className="text-red-500 text-sm hover:underline">Remover</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 px-3 py-1 bg-blue-50">
        Envie um print/foto da lista de preços do fornecedor e os preços serão preenchidos automaticamente por IA.
      </p>

      {products.map((p) => {
        const best = bestForProduct(data.prices, data.suppliers, p.product_id);
        const isWinner = best?.supplierId === supplier.id && Number(sp[p.product_id] || 0) > 0;
        const totalQty = Object.values(p.qtys).reduce((s, q) => s + q, 0);
        return (
          <div key={p.product_id} className={`flex items-center gap-3 px-3 py-2 border-b last:border-0 ${isWinner ? 'bg-green-50' : ''}`}>
            <span className="flex-1 text-sm">{p.name}</span>
            <span className="text-xs text-gray-400">{totalQty} {p.purchase_unit}</span>
            {isWinner && <span className="text-xs text-green-600 font-medium">✓ menor preço</span>}
            <input
              type="number"
              step="0.01"
              min="0"
              value={sp[p.product_id] ?? ''}
              onChange={(e) => onPriceChange(supplier.id, p.product_id, e.target.value)}
              onBlur={() => onSave(supplier.id)}
              className={`w-24 border rounded px-2 py-1 text-center text-sm ${isWinner ? 'border-green-500 font-bold' : 'border-gray-300'}`}
            />
            <span className="text-xs text-gray-400 w-10">R$/un</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Quotation() {
  const { token } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [localPrices, setLocalPrices] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showQuotationRequest, setShowQuotationRequest] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierId, setNewSupplierId] = useState('');
  const [globalSuppliers, setGlobalSuppliers] = useState([]);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [error, setError] = useState('');
  const [quotationRequestText, setQuotationRequestText] = useState('');
  const [copiedRequest, setCopiedRequest] = useState(false);

  async function loadList() {
    const list = await request('/quotations', { token });
    setQuotations(list);
  }

  async function loadQuotation(id) {
    const d = await request(`/quotations/${id}`, { token });
    setData(d);
    const lp = {};
    for (const s of d.suppliers) {
      lp[s.id] = {};
      for (const p of d.products) {
        const found = d.prices.find((px) => px.supplier_id === s.id && px.product_id === p.product_id);
        lp[s.id][p.product_id] = found ? String(Number(found.unit_price)) : '';
      }
    }
    setLocalPrices(lp);
    if (d.suppliers.length > 0 && activeTab === null) setActiveTab(d.suppliers[0].id);
  }

  useEffect(() => { loadList().catch(() => {}); }, [token]);
  useEffect(() => {
    request('/suppliers', { token }).then(setGlobalSuppliers).catch(() => {});
  }, [token]);
  useEffect(() => { if (selectedId) loadQuotation(selectedId).catch((e) => setError(e.message)); }, [selectedId]);

  function handleCreated(id) {
    setShowModal(false);
    setSelectedId(id);
    setActiveTab(null);
    loadList();
  }

  async function handleAddSupplier() {
    const name = newSupplierId
      ? globalSuppliers.find((s) => String(s.id) === newSupplierId)?.name || newSupplierName.trim()
      : newSupplierName.trim();
    if (!name) return;
    setAddingSupplier(true);
    try {
      const body = { name, supplier_id: newSupplierId ? Number(newSupplierId) : undefined };
      const s = await request(`/quotations/${selectedId}/suppliers`, { method: 'POST', token, body });
      setNewSupplierName('');
      setNewSupplierId('');
      await loadQuotation(selectedId);
      setActiveTab(s.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingSupplier(false);
    }
  }

  async function handleDeleteSupplier(supplierId) {
    await request(`/quotations/${selectedId}/suppliers/${supplierId}`, { method: 'DELETE', token });
    await loadQuotation(selectedId);
    if (activeTab === supplierId) setActiveTab(data?.suppliers.find((s) => s.id !== supplierId)?.id || null);
  }

  function handlePriceChange(supplierId, productId, value) {
    setLocalPrices((prev) => ({ ...prev, [supplierId]: { ...(prev[supplierId] || {}), [productId]: value } }));
  }

  async function saveSupplierPrices(supplierId) {
    const priceMap = localPrices[supplierId] || {};
    const prices = Object.entries(priceMap).map(([product_id, unit_price]) => ({
      product_id: Number(product_id),
      unit_price: Number(unit_price) || 0,
    }));
    await request(`/quotations/${selectedId}/suppliers/${supplierId}/prices`, { method: 'PUT', token, body: { prices } });
    await loadQuotation(selectedId);
  }

  function generateQuotationRequest() {
    if (!data) return;
    const date = new Date().toLocaleDateString('pt-BR');
    let text = '===========================================\n';
    text += 'PEDIDO DE COTAÇÃO – BUONNA MASSA\n';
    text += `Data: ${date}\n`;
    text += '===========================================\n\n';
    text += 'Prezado fornecedor, solicito cotação para os itens abaixo:\n\n';

    for (const p of data.products) {
      text += `- ${p.name}\n`;
    }

    text += '\n===========================================\n';
    text += 'Por favor, envie os preços unitários.\nBuonna Massa Pizzaria';
    setQuotationRequestText(text);
    setShowQuotationRequest(true);
    setCopiedRequest(false);
  }

  if (showOrders && selectedId) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <OrdersView quotationId={selectedId} token={token} onBack={() => setShowOrders(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      {showModal && <NewQuotationModal token={token} onClose={() => setShowModal(false)} onCreated={handleCreated} />}

      {showQuotationRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg flex flex-col">
            <h2 className="text-lg font-bold text-brand-red mb-3">Pedido de Cotação</h2>
            <p className="text-xs text-gray-500 mb-3">Mensagem única com todos os itens para enviar aos fornecedores.</p>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 border rounded p-3 max-h-96 overflow-y-auto mb-4">{quotationRequestText}</pre>
            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(quotationRequestText); setCopiedRequest(true); }}
                className="border border-brand-red text-brand-red rounded px-4 py-2 text-sm hover:bg-brand-red hover:text-white"
              >
                {copiedRequest ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(quotationRequestText)}`, '_blank')}
                className="bg-green-600 text-white rounded px-4 py-2 text-sm hover:opacity-90"
              >
                Enviar via WhatsApp
              </button>
              <button onClick={() => setShowQuotationRequest(false)} className="ml-auto border border-gray-300 rounded px-4 py-2 text-sm">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-brand-red">Cotação de Compras</h1>
        <button onClick={() => setShowModal(true)} className="bg-brand-red text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
          + Nova Cotação
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {/* List */}
      {!selectedId && (
        <div className="bg-white rounded-lg shadow divide-y">
          {quotations.length === 0 && <p className="p-4 text-gray-400 text-sm">Nenhuma cotação ainda.</p>}
          {quotations.map((q) => (
            <button key={q.id} onClick={() => { setSelectedId(q.id); setActiveTab(null); setShowOrders(false); }}
              className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50">
              <span className="text-sm font-medium">Cotação #{q.id}</span>
              <span className="text-xs text-gray-500">{q.units?.join(' + ')}</span>
              <span className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('pt-BR')}</span>
              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${q.status === 'finalizada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{q.status}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      {selectedId && data && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => { setSelectedId(null); setData(null); }} className="text-sm text-brand-red hover:underline">← Voltar</button>
            <h2 className="font-semibold">Cotação #{selectedId}</h2>
            <span className="text-xs text-gray-500">{data.counts.map((c) => c.unit_name).join(' + ')}</span>
            <div className="ml-auto flex gap-2">
              <button onClick={generateQuotationRequest} className="border border-brand-red text-brand-red rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-red hover:text-white">
                Pedido de Cotação
              </button>
              <button onClick={() => setShowOrders(true)} className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
                Pedidos de Compra
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {globalSuppliers.length > 0 ? (
              <select
                value={newSupplierId}
                onChange={(e) => { setNewSupplierId(e.target.value); setNewSupplierName(''); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
              >
                <option value="">— Selecionar fornecedor cadastrado —</option>
                {globalSuppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
                <option value="__novo__">+ Novo fornecedor (digitar nome)</option>
              </select>
            ) : null}
            {(newSupplierId === '__novo__' || globalSuppliers.length === 0) && (
              <input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSupplier()}
                placeholder="Nome do fornecedor..."
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
              />
            )}
            <button
              onClick={handleAddSupplier}
              disabled={addingSupplier || (!newSupplierId && !newSupplierName.trim()) || newSupplierId === '__novo__' && !newSupplierName.trim()}
              className="bg-brand-red text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              + Adicionar Fornecedor
            </button>
          </div>

          {data.suppliers.length > 0 && (
            <div className="flex gap-1 mb-0 flex-wrap">
              {data.suppliers.map((s) => (
                <button key={s.id} onClick={() => setActiveTab(s.id)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 ${activeTab === s.id ? 'bg-white border-brand-red text-brand-red' : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'}`}>
                  {s.name}
                </button>
              ))}
              <button onClick={() => setActiveTab('best')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 ${activeTab === 'best' ? 'bg-white border-green-600 text-green-700' : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'}`}>
                ⭐ Melhor Preço
              </button>
            </div>
          )}

          {activeTab && activeTab !== 'best' && (() => {
            const supplier = data.suppliers.find((s) => s.id === activeTab);
            if (!supplier) return null;
            return (
              <SupplierTab
                key={supplier.id}
                supplier={supplier}
                quotationId={selectedId}
                products={data.products}
                data={data}
                localPrices={localPrices}
                onPriceChange={handlePriceChange}
                onSave={saveSupplierPrices}
                onDelete={handleDeleteSupplier}
                onExtracted={() => loadQuotation(selectedId)}
                token={token}
              />
            );
          })()}

          {activeTab === 'best' && (
            <div className="bg-white rounded-b-lg rounded-tr-lg shadow">
              <div className="px-3 py-2 border-b text-sm text-gray-500">Menor preço por item entre todos os fornecedores.</div>
              {data.products.map((p) => {
                const best = bestForProduct(data.prices, data.suppliers, p.product_id);
                return (
                  <div key={p.product_id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0">
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className="text-xs text-gray-400">
                      {Object.entries(p.qtys).map(([uid, qty]) => {
                        const unit = data.counts.find((c) => String(c.unit_id) === String(uid));
                        return `${unit?.unit_name || uid}: ${qty}`;
                      }).join(' | ')} {p.purchase_unit}
                    </span>
                    {best
                      ? <span className="text-green-700 font-semibold text-sm">{fmt(best.price)} <span className="text-xs font-normal text-gray-500">({best.supplier})</span></span>
                      : <span className="text-gray-400 text-sm">—</span>}
                  </div>
                );
              })}
            </div>
          )}

          {data.suppliers.length === 0 && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
              Adicione fornecedores acima para começar a cotar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
