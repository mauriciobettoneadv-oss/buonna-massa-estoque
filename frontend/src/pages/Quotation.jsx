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
                <strong>{c.unit_name}</strong> — finalizada em {new Date(c.finalized_at || c.created_at).toLocaleDateString('pt-BR')}
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
  const brandWarnings = result.matches.filter((m) => m.brand_warning);
  const unitWarnings = result.matches.filter((m) => m.unit_warning);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-bold text-brand-red mb-2">Preços extraídos</h2>
        <p className="text-sm text-gray-500 mb-2">
          {result.total_matched} de {result.total_extracted} itens identificados e salvos automaticamente.
        </p>

        {brandWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2">
            <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Divergência de marca:</p>
            {brandWarnings.map((m, i) => (
              <p key={i} className="text-xs text-amber-700">{m.product_name}: {m.brand_warning}</p>
            ))}
          </div>
        )}

        {unitWarnings.length > 0 && (
          <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 mb-2">
            <p className="text-xs font-semibold text-orange-700 mb-1">📦 Divergência de unidade — verifique os preços abaixo:</p>
            {unitWarnings.map((m, i) => (
              <p key={i} className="text-xs text-orange-700">{m.product_name}: {m.unit_warning}</p>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex-1 divide-y border rounded-lg mb-4">
          {result.matches.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 p-2 text-sm ${m.unit_warning ? 'bg-orange-50' : m.brand_warning ? 'bg-amber-50' : ''}`}>
              <span className={`mt-0.5 w-10 text-center text-xs font-bold rounded-full px-1 py-0.5 flex-shrink-0 ${m.confidence >= 80 ? 'bg-green-100 text-green-700' : m.confidence >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                {m.confidence}%
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{m.product_name}</p>
                <p className="text-xs text-gray-400">
                  Extraído: "{m.extracted_name}"
                  {m.extracted_unit && (
                    <span className={`ml-2 font-medium ${m.unit_warning ? 'text-orange-600' : 'text-gray-500'}`}>
                      por {m.extracted_unit}
                      {m.expected_unit && m.unit_warning && ` (esperado: por ${m.expected_unit})`}
                    </span>
                  )}
                </p>
                {m.brand_warning && <p className="text-xs text-amber-600">⚠ {m.brand_warning}</p>}
                {m.unit_warning && <p className="text-xs text-orange-600">📦 {m.unit_warning}</p>}
              </div>
              <span className={`font-semibold flex-shrink-0 ${m.unit_warning ? 'text-orange-700' : 'text-green-700'}`}>
                {fmt(m.unit_price)}
              </span>
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
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState({});
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [supplierOverrides, setSupplierOverrides] = useState({});
  const [openPicker, setOpenPicker] = useState(null);

  useEffect(() => {
    request(`/quotations/${quotationId}/orders`, { token }).then(setData);
  }, [quotationId, token]);

  if (!data) return <p className="text-gray-500 p-4">Carregando pedidos...</p>;

  const { orders, supplier_options: supplierOptions = {} } = data;

  const unitIdByName = {};
  for (const o of orders) unitIdByName[o.unit_name] = o.unit_id;

  function ovrKey(unitName, productId) {
    return `${unitIdByName[unitName]}_${productId}`;
  }

  function effQty(unitName, item) {
    const k = ovrKey(unitName, item.product_id);
    return qtyOverrides[k] !== undefined ? Number(qtyOverrides[k]) : item.qty_to_buy;
  }

  function effUnitPrice(unitName, item) {
    const k = ovrKey(unitName, item.product_id);
    return supplierOverrides[k] !== undefined ? supplierOverrides[k].unit_price : (item.unit_price || 0);
  }

  function effSupplierName(unitName, item) {
    const k = ovrKey(unitName, item.product_id);
    return supplierOverrides[k] ? supplierOverrides[k].supplier_name : (item.supplier_name || '—');
  }

  function effTotal(unitName, item) {
    return effQty(unitName, item) * effUnitPrice(unitName, item) * (item.multiplier || 1);
  }

  function setQtyOverride(unitName, productId, val) {
    const k = ovrKey(unitName, productId);
    setQtyOverrides((prev) => {
      if (val === '' || val === undefined) { const n = { ...prev }; delete n[k]; return n; }
      return { ...prev, [k]: Number(val) };
    });
  }

  function buildSupplierMap() {
    const map = {};
    for (const order of orders) {
      for (const item of order.items) {
        const supplier = effSupplierName(order.unit_name, item);
        if (!map[supplier]) map[supplier] = {};
        if (!map[supplier][order.unit_name]) map[supplier][order.unit_name] = [];
        map[supplier][order.unit_name].push(item);
      }
    }
    return map;
  }

  function buildSupplierText(supplierName, unitMap) {
    const date = new Date().toLocaleDateString('pt-BR');
    let text = `PEDIDO – BUONNA MASSA\nFornecedor: ${supplierName}\nData: ${date}\n`;
    text += '─────────────────────────────────\n';
    let grandTotal = 0;
    for (const [unitName, items] of Object.entries(unitMap)) {
      if (orders.length > 1) text += `\n📍 ${unitName}\n`;
      for (const item of items) {
        const qty = effQty(unitName, item);
        const price = effUnitPrice(unitName, item);
        const total = qty * price * (item.multiplier || 1);
        grandTotal += total;
        text += `• ${item.name}: ${qty} ${item.purchase_unit}`;
        if (price > 0) {
          if (item.price_unit && item.price_unit.toLowerCase() !== (item.purchase_unit || '').toLowerCase()) {
            text += ` × ${fmt(price)}/${item.price_unit} = ${fmt(total)}`;
          } else {
            text += ` × ${fmt(price)} = ${fmt(total)}`;
          }
        }
        text += '\n';
      }
      const sub = items.reduce((s, i) => s + effTotal(unitName, i), 0);
      if (sub > 0 && orders.length > 1) text += `  Subtotal ${unitName}: ${fmt(sub)}\n`;
    }
    text += '─────────────────────────────────\n';
    if (grandTotal > 0) text += `TOTAL: ${fmt(grandTotal)}`;
    return text;
  }

  function renderSupplierPicker(unitName, item) {
    const k = ovrKey(unitName, item.product_id);
    const options = supplierOptions[item.product_id] || [];
    if (options.length <= 1) return null;
    const currentName = effSupplierName(unitName, item);
    const isOverridden = !!supplierOverrides[k];
    const isOpen = openPicker === k;
    return (
      <div className="mt-1">
        <button
          onClick={(e) => { e.stopPropagation(); setOpenPicker(isOpen ? null : k); }}
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            isOverridden
              ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
              : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
          }`}
        >
          {isOverridden ? '✏ ' : ''}{currentName} ▾
        </button>
        {isOpen && (
          <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white z-10">
            {options.map((opt) => {
              const isDefault = !isOverridden && opt.supplier_name === item.supplier_name;
              const isSelected = isOverridden
                ? supplierOverrides[k]?.supplier_name === opt.supplier_name
                : isDefault;
              const restrictedForUnit = opt.is_restricted && !opt.delivery_cities.includes(unitName);
              return (
                <button
                  key={opt.supplier_id}
                  onClick={() => {
                    setSupplierOverrides((prev) => {
                      const isOriginal = opt.supplier_name === item.supplier_name && opt.unit_price === (item.unit_price || 0);
                      if (isOriginal) { const n = { ...prev }; delete n[k]; return n; }
                      return { ...prev, [k]: { supplier_name: opt.supplier_name, unit_price: opt.unit_price } };
                    });
                    setOpenPicker(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left border-b last:border-0 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <span className="flex items-center gap-1.5">
                    {isSelected && <span className="text-blue-600 font-bold">✓</span>}
                    <span className={isSelected ? 'font-semibold text-blue-700' : 'text-gray-800'}>{opt.supplier_name}</span>
                    {restrictedForUnit && (
                      <span className="bg-orange-100 text-orange-700 px-1.5 rounded-full text-[10px] font-medium">retirada</span>
                    )}
                  </span>
                  <span className="text-gray-700 font-medium ml-3">{fmt(opt.unit_price)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const supplierMap = buildSupplierMap();
  const unitNames = orders.map((o) => o.unit_name);

  return (
    <div onClick={() => setOpenPicker(null)}>
      <button onClick={onBack} className="text-sm text-brand-red hover:underline mb-4">← Voltar à cotação</button>
      <h2 className="text-lg font-bold text-brand-red mb-1">Pedidos de Compra</h2>
      <p className="text-xs text-gray-400 mb-5">Ajuste quantidades e fornecedores se necessário, depois clique em "Copiar" para enviar.</p>

      <div className="space-y-5">
        {Object.entries(supplierMap).map(([supplierName, unitMap]) => {
          const grandTotal = Object.entries(unitMap).reduce(
            (s, [uName, items]) => s + items.reduce((ss, i) => ss + effTotal(uName, i), 0), 0
          );
          const key = supplierName;
          return (
            <div key={key} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                <span className="font-semibold text-gray-800">📦 {supplierName}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const text = buildSupplierText(supplierName, unitMap);
                      navigator.clipboard.writeText(text).catch(() => {});
                      setCopied((p) => ({ ...p, [key]: 'copied' }));
                      setTimeout(() => setCopied((p) => ({ ...p, [key]: null })), 3000);
                    }}
                    className="border border-brand-red text-brand-red rounded px-3 py-1 text-xs font-medium hover:bg-brand-red hover:text-white transition-colors"
                  >
                    {copied[key] === 'copied' ? '✓ Copiado!' : '📋 Copiar'}
                  </button>
                  <button
                    onClick={() => {
                      const text = buildSupplierText(supplierName, unitMap);
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="bg-green-600 text-white rounded px-3 py-1 text-xs font-medium hover:opacity-90"
                  >
                    WhatsApp
                  </button>
                </div>
              </div>

              {unitNames.length > 1 ? (
                <div style={{ gridTemplateColumns: `repeat(${unitNames.length}, 1fr)` }} className="grid divide-x">
                  {unitNames.map((unitName) => {
                    const items = unitMap[unitName] || [];
                    const sub = items.reduce((s, i) => s + effTotal(unitName, i), 0);
                    return (
                      <div key={unitName}>
                        <div className="px-3 py-2 bg-brand-red/5 border-b text-xs font-semibold text-brand-red text-center">
                          {unitName}
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-4">—</p>
                        ) : (
                          <div className="divide-y">
                            {items.map((item) => (
                              <div key={item.product_id} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                <div className="text-sm text-gray-800">{item.name}</div>
                                <div className="flex items-center justify-between mt-1 gap-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={effQty(unitName, item)}
                                      onChange={(e) => setQtyOverride(unitName, item.product_id, e.target.value)}
                                      className="w-14 border border-gray-300 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:border-brand-red"
                                    />
                                    <span className="text-xs text-gray-500">{item.purchase_unit}</span>
                                  </div>
                                  {effUnitPrice(unitName, item) > 0 && (
                                    <span className="text-xs font-medium text-gray-700">{fmt(effTotal(unitName, item))}</span>
                                  )}
                                </div>
                                {renderSupplierPicker(unitName, item)}
                              </div>
                            ))}
                          </div>
                        )}
                        {sub > 0 && (
                          <div className="px-3 py-2 border-t text-right text-xs font-semibold text-gray-700">
                            {fmt(sub)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y">
                  {Object.entries(unitMap).flatMap(([unitName, items]) =>
                    items.map((item) => (
                      <div key={item.product_id} className="px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <span className="flex-1 text-gray-800">{item.name}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={effQty(unitName, item)}
                              onChange={(e) => setQtyOverride(unitName, item.product_id, e.target.value)}
                              className="w-14 border border-gray-300 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:border-brand-red"
                            />
                            <span className="text-gray-500 text-xs">{item.purchase_unit}</span>
                          </div>
                          {effUnitPrice(unitName, item) > 0 && (
                            <>
                              <span className="text-gray-400 text-xs">× {fmt(effUnitPrice(unitName, item))}</span>
                              <span className="font-medium w-20 text-right">{fmt(effTotal(unitName, item))}</span>
                            </>
                          )}
                        </div>
                        {renderSupplierPicker(unitName, item)}
                      </div>
                    ))
                  )}
                </div>
              )}

              {grandTotal > 0 && (
                <div className="px-4 py-2 border-t text-right text-sm font-bold text-brand-red">
                  Total: {fmt(grandTotal)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Supplier Tab Content ─────────────────────────────────────────────────────

function SupplierTab({ supplier, quotationId, products, data, localPrices, onPriceChange, onSave, onDelete, onExtracted, token, onTokenGenerated, readOnly }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [search, setSearch] = useState('');
  const sp = localPrices[supplier.id] || {};

  // Badge: respondeu se tem algum preço > 0
  const hasAnyPrice = data.prices.some(
    (px) => px.supplier_id === supplier.id && Number(px.unit_price) > 0
  );

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCopyLink() {
    setGeneratingLink(true);
    try {
      let accessToken = supplier.access_token;
      if (!accessToken) {
        const result = await request(`/quotations/${quotationId}/suppliers/${supplier.id}/token`, { method: 'POST', token });
        accessToken = result.access_token;
        onTokenGenerated(supplier.id, result);
      }
      const link = `${window.location.origin}/cotacao/${accessToken}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch (e) {
      alert('Erro ao gerar link: ' + (e.message || e));
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
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

  async function handlePasteExtract() {
    if (!pasteText.trim()) return;
    setPasting(true);
    try {
      const res = await fetch(`${API}/quotations/${quotationId}/suppliers/${supplier.id}/extract-text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao extrair preços do texto.');
      }
      const result = await res.json();
      setExtractResult(result);
      setShowPaste(false);
      setPasteText('');
      onExtracted();
    } catch (err) {
      alert(err.message);
    } finally {
      setPasting(false);
    }
  }

  return (
    <div className="bg-white rounded-b-lg rounded-tr-lg shadow">
      {extractResult && (
        <ExtractResultModal result={extractResult} onClose={() => setExtractResult(null)} />
      )}
      <div className="flex items-center justify-between p-4 border-b gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base">{supplier.name}</span>
          {hasAnyPrice
            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✅ Respondeu</span>
            : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">⏳ Aguardando</span>
          }
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileRef.current.click()}
              disabled={uploading || pasting}
              className="flex items-center gap-1 bg-blue-600 text-white rounded px-3 py-1 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? <><span className="animate-spin">⟳</span> Lendo...</> : <>📷 Imagem / PDF</>}
            </button>
            <button
              onClick={() => setShowPaste((v) => !v)}
              disabled={uploading || pasting}
              className="flex items-center gap-1 bg-violet-600 text-white rounded px-3 py-1 text-sm hover:opacity-90 disabled:opacity-50"
            >
              📋 Colar cotação
            </button>
            <button onClick={() => onSave(supplier.id)} className="bg-brand-red text-white rounded px-3 py-1 text-sm hover:opacity-90">
              Salvar preços
            </button>
            <button onClick={() => onDelete(supplier.id)} className="text-red-500 text-sm hover:underline">Remover</button>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="px-4 py-2 bg-green-50 border-b flex items-center gap-2 flex-wrap">
          <span className="text-xs text-green-700 flex-1">
            {supplier.access_token
              ? `Link gerado — o fornecedor pode preencher os preços diretamente.`
              : `Gere um link e envie para o fornecedor preencher os preços.`}
          </span>
          <button
            onClick={handleCopyLink}
            disabled={generatingLink}
            className="flex items-center gap-1 bg-green-600 text-white rounded px-3 py-1 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {generatingLink ? '⟳ Gerando...' : linkCopied ? '✓ Copiado!' : '🔗 Copiar link'}
          </button>
        </div>
      )}

      {!readOnly && showPaste && (
        <div className="px-3 py-2 bg-violet-50 border-b">
          <p className="text-xs text-violet-700 mb-1">Cole o texto da cotação (WhatsApp, e-mail, etc.):</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            className="w-full border border-violet-300 rounded p-2 text-sm font-mono resize-y"
            placeholder="Cole aqui a mensagem do fornecedor com os preços..."
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handlePasteExtract}
              disabled={pasting || !pasteText.trim()}
              className="bg-violet-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
            >
              {pasting ? 'Extraindo...' : 'Extrair preços'}
            </button>
            <button onClick={() => { setShowPaste(false); setPasteText(''); }} className="text-sm text-gray-500 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-b">
        <input
          type="text"
          placeholder="🔍 Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 w-full text-sm focus:outline-none focus:border-brand-red"
        />
      </div>

      {filteredProducts.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum produto encontrado.</p>
      )}

      {filteredProducts.map((p) => {
        const best = bestForProduct(data.prices, data.suppliers, p.product_id);
        const isWinner = best?.supplierId === supplier.id && Number(sp[p.product_id] || 0) > 0;
        const totalQty = Object.values(p.qtys).reduce((s, q) => s + q, 0);
        const priceEntry = data.prices.find((px) => px.supplier_id === supplier.id && px.product_id === p.product_id);
        const altBrand = priceEntry?.alt_brand;
        return (
          <div key={p.product_id} className={`px-4 py-2.5 border-b last:border-0 ${isWinner ? 'bg-green-50' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm font-medium">{p.name}</span>
              <span className="text-xs text-gray-400">{totalQty} {p.purchase_unit}</span>
              {isWinner && <span className="text-xs text-green-600 font-medium">✓ menor preço</span>}
              <input
                type="number"
                step="0.01"
                min="0"
                value={sp[p.product_id] ?? ''}
                onChange={(e) => !readOnly && onPriceChange(supplier.id, p.product_id, e.target.value)}
                onBlur={() => !readOnly && onSave(supplier.id)}
                disabled={readOnly}
                className={`w-24 border rounded px-2 py-1 text-center text-sm ${isWinner ? 'border-green-500 font-bold' : 'border-gray-300'} ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              />
              <span className="text-xs text-gray-400 w-16">R$/{p.price_unit || 'un'}</span>
            </div>
            {altBrand && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                  🏷 Outra marca: {altBrand}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Best Price Tab ───────────────────────────────────────────────────────────

function priceMultiplier(p) {
  const pu = (p.price_unit || '').toLowerCase().trim();
  const buyUnit = (p.purchase_unit || '').toLowerCase().trim();
  if (!pu || pu === buyUnit) return 1;
  const BOX_UNITS = ['caixa', 'fardo'];
  const isBoxPurchase = BOX_UNITS.includes(buyUnit);
  const qty = isBoxPurchase ? (Number(p.box_qty) || 1) : 1;
  const weight = Number(p.box_unit_weight) || 1;
  return pu === 'kilo' ? qty * weight : (isBoxPurchase ? qty : 1);
}

function BestPriceTab({ data }) {
  // Compute supplier totals (sum of qty*best_price*multiplier for each product where supplier is cheapest)
  const supplierTotals = {};
  const supplierHasPrice = {};

  for (const s of data.suppliers) {
    supplierTotals[s.id] = { name: s.name, total: 0, id: s.id };
    supplierHasPrice[s.id] = data.prices.some(
      (px) => px.supplier_id === s.id && Number(px.unit_price) > 0
    );
  }

  for (const p of data.products) {
    const best = bestForProduct(data.prices, data.suppliers, p.product_id);
    if (best) {
      const totalQty = Object.values(p.qtys).reduce((s, q) => s + q, 0);
      const mult = priceMultiplier(p);
      supplierTotals[best.supplierId].total += totalQty * best.price * mult;
    }
  }

  const totalsArr = Object.values(supplierTotals).filter((s) => s.total > 0);

  return (
    <div className="bg-white rounded-b-lg rounded-tr-lg shadow">
      {/* Resumo por fornecedor */}
      {totalsArr.length > 0 && (
        <div className="p-4 border-b bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumo por fornecedor</p>
          <div className="flex flex-wrap gap-3">
            {totalsArr.map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-sm">
                <span className="font-semibold text-sm text-gray-800">{s.name}</span>
                <span className="text-sm font-bold text-green-700">{fmt(s.total)}</span>
                {supplierHasPrice[s.id]
                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ Respondeu</span>
                  : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">⏳ Aguardando</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-b text-sm text-gray-500">Menor preço por item entre todos os fornecedores.</div>
      {data.products.map((p) => {
        const best = bestForProduct(data.prices, data.suppliers, p.product_id);
        const bestEntry = best ? data.prices.find((px) => px.supplier_id === best.supplierId && px.product_id === p.product_id) : null;
        const altBrand = bestEntry?.alt_brand;

        // Warning: restricted supplier ≥10% cheaper than unrestricted best
        const unrestricted = data.suppliers.filter((s) => !Array.isArray(s.delivery_cities) || !s.delivery_cities.length);
        const universalBest = bestForProduct(data.prices, unrestricted, p.product_id);
        const restrictedWarning = (() => {
          if (!universalBest) return null;
          for (const s of data.suppliers) {
            if (!Array.isArray(s.delivery_cities) || !s.delivery_cities.length) continue;
            const px = data.prices.find((pp) => pp.supplier_id === s.id && pp.product_id === p.product_id);
            const price = Number(px?.unit_price || 0);
            if (!price) continue;
            if (price < universalBest.price * 0.9) {
              return { supplierName: s.name, cities: s.delivery_cities, pct: Math.round((1 - price / universalBest.price) * 100), price };
            }
          }
          return null;
        })();

        return (
          <div key={p.product_id} className="px-4 py-2.5 border-b last:border-0">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm font-medium">{p.name}</span>
              <span className="text-xs text-gray-400">
                {Object.entries(p.qtys).map(([uid, qty]) => {
                  const unit = data.counts.find((c) => String(c.unit_id) === String(uid));
                  return `${unit?.unit_name || uid}: ${qty}`;
                }).join(' | ')} {p.purchase_unit}
              </span>
              {best
                ? <span className="bg-green-100 text-green-800 font-semibold text-sm px-2 py-0.5 rounded">
                    {fmt(best.price * priceMultiplier(p))}<span className="text-xs font-normal text-green-600">/{p.purchase_unit || 'un'}</span>
                    {' '}<span className="text-xs font-normal text-green-600">({best.supplier})</span>
                    {p.price_unit && p.price_unit.toLowerCase() !== (p.purchase_unit || '').toLowerCase() && (
                      <span className="text-xs font-normal text-gray-400 ml-1">{fmt(best.price)}/{p.price_unit}</span>
                    )}
                  </span>
                : <span className="text-gray-400 text-sm">—</span>}
            </div>
            {altBrand && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                  🏷 Outra marca: {altBrand} <span className="font-normal text-amber-600">({best?.supplier})</span>
                </span>
              </div>
            )}
            {restrictedWarning && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  ⚡ {restrictedWarning.supplierName} entrega só em {restrictedWarning.cities.join(', ')} — {restrictedWarning.pct}% mais barato que o 2º melhor
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Quotation() {
  const { token, user } = useAuth();
  const isOwner = ['dono', 'proprietario'].includes(user?.role);
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
  const [showClosed, setShowClosed] = useState(false);
  const [closingId, setClosingId] = useState(null);

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

  async function handleAddAllSuppliers() {
    if (!globalSuppliers.length) return;
    const alreadyIds = new Set((data?.suppliers || []).map((s) => s.supplier_id));
    const toAdd = globalSuppliers.filter((s) => !alreadyIds.has(s.id));
    if (!toAdd.length) { setError('Todos os fornecedores já estão nesta cotação.'); return; }
    setAddingSupplier(true);
    try {
      for (const s of toAdd) {
        await request(`/quotations/${selectedId}/suppliers`, { method: 'POST', token, body: { name: s.name, supplier_id: s.id } });
      }
      await loadQuotation(selectedId);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingSupplier(false);
    }
  }

  function handleTokenGenerated(supplierId, updatedSupplier) {
    setData((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) => s.id === supplierId ? { ...s, ...updatedSupplier } : s),
    }));
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

  async function handleCloseQuotation() {
    if (!window.confirm('Fechar esta cotação? Ela ficará somente leitura.')) return;
    setClosingId(selectedId);
    try {
      await request(`/quotations/${selectedId}/close`, { method: 'POST', token });
      await loadList();
      await loadQuotation(selectedId);
    } catch (e) {
      setError(e.message);
    } finally {
      setClosingId(null);
    }
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

  const openQuotations = quotations.filter((q) => q.status !== 'fechada');
  const closedQuotations = quotations.filter((q) => q.status === 'fechada');

  const isClosed = data?.quotation?.status === 'fechada';

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
        {isOwner && (
          <button onClick={() => setShowModal(true)} className="bg-brand-red text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
            + Nova Cotação
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {/* List */}
      {!selectedId && (
        <div>
          {/* Abertas */}
          <div className="bg-white rounded-lg shadow divide-y mb-4">
            <div className="px-4 py-2 bg-gray-50 rounded-t-lg">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abertas ({openQuotations.length})</span>
            </div>
            {openQuotations.length === 0 && <p className="p-4 text-gray-400 text-sm">Nenhuma cotação aberta.</p>}
            {openQuotations.map((q) => (
              <button key={q.id} onClick={() => { setSelectedId(q.id); setActiveTab(null); setShowOrders(false); }}
                className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50">
                <span className="text-sm font-medium">Cotação #{q.id}</span>
                <span className="text-xs text-gray-500">{q.units?.join(' + ')}</span>
                <span className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('pt-BR')}</span>
                <span className="ml-auto text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">{q.status || 'aberta'}</span>
              </button>
            ))}
          </div>

          {/* Fechadas */}
          <div className="bg-white rounded-lg shadow divide-y">
            <button
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 rounded-t-lg hover:bg-gray-100"
              onClick={() => setShowClosed((v) => !v)}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fechadas/Concluídas ({closedQuotations.length})</span>
              <span className="text-xs text-gray-400">{showClosed ? '▲ Ocultar' : '▼ Mostrar cotações fechadas'}</span>
            </button>
            {showClosed && (
              <>
                {closedQuotations.length === 0 && <p className="p-4 text-gray-400 text-sm">Nenhuma cotação fechada.</p>}
                {closedQuotations.map((q) => (
                  <button key={q.id} onClick={() => { setSelectedId(q.id); setActiveTab(null); setShowOrders(false); }}
                    className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50 opacity-70">
                    <span className="text-sm font-medium">Cotação #{q.id}</span>
                    <span className="text-xs text-gray-500">{q.units?.join(' + ')}</span>
                    <span className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('pt-BR')}</span>
                    <span className="ml-auto text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600">Concluída</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Detail */}
      {selectedId && data && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button onClick={() => { setSelectedId(null); setData(null); }} className="text-sm text-brand-red hover:underline">← Voltar</button>
            <h2 className="font-semibold">Cotação #{selectedId}</h2>
            {isClosed && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-medium">Concluída</span>
            )}
            <span className="text-xs text-gray-500">
              {data.counts.map((c) => `${c.unit_name} (${new Date(c.finalized_at).toLocaleDateString('pt-BR')})`).join(' + ')}
            </span>
            <div className="ml-auto flex gap-2 flex-wrap">
              {isOwner && !isClosed && (
                <button
                  onClick={handleCloseQuotation}
                  disabled={!!closingId}
                  className="border border-gray-400 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
                >
                  {closingId ? 'Fechando...' : 'Fechar Cotação'}
                </button>
              )}
              <button onClick={generateQuotationRequest} className="border border-brand-red text-brand-red rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-red hover:text-white">
                Pedido de Cotação
              </button>
              <button onClick={() => setShowOrders(true)} className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
                Pedidos de Compra
              </button>
            </div>
          </div>

          {!isClosed && isOwner && (
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
              {globalSuppliers.length > 0 && (
                <button
                  onClick={handleAddAllSuppliers}
                  disabled={addingSupplier}
                  className="border border-brand-red text-brand-red rounded-lg px-4 py-2 text-sm hover:bg-brand-red hover:text-white disabled:opacity-50"
                >
                  {addingSupplier ? 'Adicionando...' : '+ Adicionar todos'}
                </button>
              )}
            </div>
          )}

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
                onTokenGenerated={handleTokenGenerated}
                token={token}
                readOnly={isClosed}
              />
            );
          })()}

          {activeTab === 'best' && <BestPriceTab data={data} />}

          {data.suppliers.length === 0 && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
              {isClosed ? 'Cotação concluída — sem fornecedores registrados.' : 'Adicione fornecedores acima para começar a cotar.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
