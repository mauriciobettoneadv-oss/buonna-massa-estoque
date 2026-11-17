import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Converte preço/price_unit → preço/purchase_unit (igual ao backend)
function calcMultiplier(p) {
  const pu = (p.price_unit || '').toLowerCase().trim();
  const buyUnit = (p.purchase_unit || '').toLowerCase().trim();
  if (!pu || pu === buyUnit) return 1;
  const BOX_UNITS = ['caixa', 'fardo'];
  const isBox = BOX_UNITS.includes(buyUnit);
  const boxQty = isBox ? (Number(p.box_qty) || 1) : 1;
  const boxWeight = Number(p.box_unit_weight) || 1;
  return pu === 'kilo' ? boxQty * boxWeight : (isBox ? boxQty : 1);
}

export default function ConferenciaPedido() {
  const { token } = useAuth();

  // Step 1: list closed quotations
  const [quotations, setQuotations] = useState([]);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [quotationData, setQuotationData] = useState(null);
  const [loadingQuotation, setLoadingQuotation] = useState(false);

  // Unit filter for conferência (one espelho per unit)
  const [selectedUnitId, setSelectedUnitId] = useState(null);

  // Step 2: items for conferencia
  const [itens, setItens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  // AI extraction
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractInfo, setExtractInfo] = useState(null);

  // History
  const [conferencias, setConferencias] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    request('/quotations', { token })
      .then((list) => setQuotations(list.filter((q) => q.status === 'fechada')))
      .catch(() => {});
    loadHistory();
  }, [token]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const list = await request('/conferencia-pedido', { token });
      setConferencias(list);
    } catch (e) {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function selectQuotation(q) {
    setSelectedQuotation(q);
    setQuotationData(null);
    setItens([]);
    setSavedId(null);
    setSelectedUnitId(null);
    setLoadingQuotation(true);
    try {
      const data = await request(`/quotations/${q.id}`, { token });
      setQuotationData(data);
      // Don't build itens yet — wait for unit selection
    } catch (e) {
      alert('Erro ao carregar cotação: ' + e.message);
    } finally {
      setLoadingQuotation(false);
    }
  }

  function buildItensForUnit(data, unitId) {
    const unit = data.counts.find((c) => String(c.unit_id) === String(unitId));
    const unitName = unit?.unit_name || '';

    // Only consider suppliers that deliver to this unit's city
    // (empty delivery_cities = delivers everywhere)
    const eligibleSuppliers = data.suppliers.filter((s) => {
      const cities = Array.isArray(s.delivery_cities) ? s.delivery_cities : [];
      return cities.length === 0 || cities.includes(unitName);
    });

    return data.products
      .filter((p) => p.qtys[unitId] > 0)
      .map((p) => {
        // best price among suppliers eligible for this unit
        let bestPrice = 0;
        let bestSupplier = '';
        for (const s of eligibleSuppliers) {
          const px = data.prices.find((pr) => pr.supplier_id === s.id && pr.product_id === p.product_id);
          const price = Number(px?.unit_price || 0);
          if (price > 0 && (bestPrice === 0 || price < bestPrice)) {
            bestPrice = price;
            bestSupplier = s.name;
          }
        }
        // Convert agreed price to purchase_unit (vendor invoices per purchase_unit, e.g. Fardo)
        const mult = calcMultiplier(p);
        const precoPorCompra = bestPrice * mult;

        // Quantity: for THIS unit only
        const qtyThisUnit = Number(p.qtys[unitId] || 0);

        return {
          product_id: p.product_id,
          name: p.name,
          purchase_unit: p.purchase_unit,
          price_unit: p.price_unit,
          box_qty: p.box_qty,
          box_unit_weight: p.box_unit_weight,
          multiplier: mult,
          qty_pedida: qtyThisUnit,
          preco_acordado: precoPorCompra,         // per purchase_unit
          preco_acordado_base: bestPrice,          // per price_unit (for display)
          supplier_name: bestSupplier,
          qty_recebida: qtyThisUnit,
          valor_cobrado: precoPorCompra,
          conferido: false,
          aceito: false,
        };
      })
      .filter((item) => item.qty_pedida > 0);
  }

  function handleSelectUnit(unitId) {
    setSelectedUnitId(unitId);
    if (quotationData) {
      setItens(buildItensForUnit(quotationData, unitId));
      setExtractInfo(null);
      setSavedId(null);
    }
  }

  function updateItem(idx, field, value) {
    setItens((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value, conferido: true } : item));
  }

  function markItemOk(idx) {
    setItens((prev) => prev.map((item, i) =>
      i === idx ? { ...item, conferido: true, aceito: false,
        qty_recebida: item.qty_pedida, valor_cobrado: item.preco_acordado } : item
    ));
  }

  function markAllOk() {
    setItens((prev) => prev.map((item) => ({
      ...item, conferido: true, aceito: false,
      qty_recebida: item.qty_pedida, valor_cobrado: item.preco_acordado,
    })));
  }

  function markSupplierOk(supplierName) {
    setItens((prev) => prev.map((item) =>
      item.supplier_name === supplierName
        ? { ...item, conferido: true, aceito: false,
            qty_recebida: item.qty_pedida, valor_cobrado: item.preco_acordado }
        : item
    ));
  }

  function isDivergente(item) {
    if (item.aceito) return false;
    const qtyDiff = Math.abs(Number(item.qty_recebida) - Number(item.qty_pedida)) > 0.001;
    // Allow 1% tolerance on price — rounding differences between price_unit vs purchase_unit
    const acordado = Number(item.preco_acordado);
    const cobrado = Number(item.valor_cobrado);
    const priceDiff = acordado > 0
      ? Math.abs(cobrado - acordado) / acordado > 0.01
      : cobrado > 0;
    return qtyDiff || priceDiff;
  }

  async function handleExtractFromImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractError('');
    setExtractInfo(null);
    setExtracting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const result = await request('/conferencia-pedido/extract-from-image', {
        method: 'POST',
        token,
        body: { image_base64: base64, image_type: file.type, itens },
      });
      // Marca como conferido os itens que o AI preencheu
      setItens((prev) => result.itens.map((item, i) => {
        const original = prev[i];
        const touched = item.qty_recebida !== original?.qty_recebida || item.valor_cobrado !== original?.valor_cobrado;
        return { ...item, conferido: touched };
      }));
      setExtractInfo({
        matched: result.matches?.length || 0,
        nao_identificados: result.nao_identificados || [],
        via_pdf_text: result.via_pdf_text,
      });
    } catch (err) {
      setExtractError(err.message || 'Erro ao processar arquivo.');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    if (!selectedQuotation) return;
    setSaving(true);
    try {
      const result = await request('/conferencia-pedido', {
        method: 'POST',
        token,
        body: { quotation_id: selectedQuotation.id, itens },
      });
      setSavedId(result.id);
      await loadHistory();
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const divergentes = itens.filter((i) => i.conferido && isDivergente(i));

  // Agrupar por fornecedor, mantendo a ordem de aparição
  const porFornecedor = itens.reduce((acc, item, idx) => {
    const key = item.supplier_name || 'Sem fornecedor';
    if (!acc[key]) acc[key] = [];
    acc[key].push({ ...item, _idx: idx });
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Conferência de Pedido</h1>
      <p className="text-sm text-gray-500 mb-4">
        Confira se o pedido do vendedor está de acordo com o que foi cotado.
        {' '}<span className="font-medium text-gray-700">Sem espelho?</span> Marque os itens que chegaram certo com ✓ OK e edite manualmente só os que divergiram.
        {' '}O botão "Importar espelho" é opcional — preenche automaticamente se você tiver o PDF ou foto.
      </p>

      {/* Select quotation */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-3">Selecione uma cotação fechada para conferir:</p>
        {quotations.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma cotação fechada disponível.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {quotations.map((q) => (
              <button
                key={q.id}
                onClick={() => selectQuotation(q)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selectedQuotation?.id === q.id
                    ? 'bg-brand-red text-white border-brand-red'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-red'
                }`}
              >
                Cotação #{q.id}
                {q.units?.length > 0 && <span className="ml-1 text-xs opacity-75">({q.units.join(' + ')})</span>}
                {q.created_at && <span className="ml-1 text-xs opacity-60">· {fmtDate(q.created_at)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unit selector */}
      {loadingQuotation && <p className="text-gray-500 text-sm">Carregando produtos...</p>}

      {quotationData && !loadingQuotation && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Selecione a loja do espelho que você vai conferir:
          </p>
          <div className="flex flex-wrap gap-2">
            {quotationData.counts.map((c) => (
              <button
                key={c.unit_id}
                onClick={() => handleSelectUnit(c.unit_id)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selectedUnitId === c.unit_id
                    ? 'bg-brand-red text-white border-brand-red'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-red'
                }`}
              >
                {c.unit_name}
              </button>
            ))}
          </div>
          {!selectedUnitId && (
            <p className="text-xs text-gray-400 mt-2">Cada fornecedor envia um espelho por loja — selecione a loja antes de importar.</p>
          )}
        </div>
      )}

      {quotationData && itens.length > 0 && !loadingQuotation && selectedUnitId && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-gray-800">
              Cotação #{selectedQuotation.id} — {itens.length} produtos
              {selectedQuotation.created_at && <span className="ml-2 text-sm font-normal text-gray-400">{fmtDate(selectedQuotation.created_at)}</span>}
              {selectedUnitId && quotationData && (
                <span className="ml-2 text-sm font-normal text-blue-600">
                  · {quotationData.counts.find((c) => c.unit_id === selectedUnitId)?.unit_name}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {divergentes.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                  🔴 {divergentes.length} divergência{divergentes.length > 1 ? 's' : ''}
                </span>
              )}
              {itens.some((i) => !i.conferido) && (
                <button
                  onClick={markAllOk}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-600 text-green-700 hover:bg-green-600 hover:text-white transition-colors"
                  title="Marcar todos os itens como recebidos conforme pedido"
                >
                  ✓ Todos chegaram OK
                </button>
              )}
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer border transition-colors ${extracting ? 'border-gray-300 text-gray-400 cursor-not-allowed' : 'border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                {extracting ? 'Processando espelho...' : 'Importar espelho (opcional)'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={extracting}
                  onChange={handleExtractFromImage}
                />
              </label>
            </div>
          </div>
          {extractError && <p className="text-red-600 text-sm mb-3">⚠️ {extractError}</p>}
          {extractInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 text-sm text-blue-800">
              ✅ Espelho processado {extractInfo.via_pdf_text ? '(texto do PDF)' : '(imagem)'} — {extractInfo.matched} itens identificados automaticamente.
              {extractInfo.nao_identificados.length > 0 && (
                <span className="ml-1 text-blue-600">· {extractInfo.nao_identificados.length} item(s) do espelho não encontrado(s) no nosso sistema.</span>
              )}
            </div>
          )}

          {savedId && (
            <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-3 mb-4 text-sm text-green-800">
              ✅ Conferência #{savedId} salva com sucesso!
            </div>
          )}

          <div className="space-y-6 mb-6">
            {Object.entries(porFornecedor).map(([fornecedor, items]) => (
              <div key={fornecedor} className="border border-gray-300 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 border-b border-gray-300">
                  <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">🏭 {fornecedor}</span>
                  <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
                  <div className="ml-auto flex gap-2">
                    {items.some((i) => !i.conferido) && (
                      <button
                        onClick={() => markSupplierOk(fornecedor)}
                        className="text-xs border border-green-500 text-green-700 rounded px-2 py-0.5 hover:bg-green-500 hover:text-white transition-colors"
                      >
                        ✓ Todos OK
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const div = isDivergente(item);
                    return (
                      <div
                        key={item.product_id}
                        className={`p-4 ${item.conferido && div ? 'bg-red-50/40' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-semibold text-gray-800">{item.name}</span>
                          <div className="flex items-center gap-2">
                            {!item.conferido && (
                              <button
                                onClick={() => markItemOk(item._idx)}
                                className="text-xs border border-green-500 text-green-700 rounded-full px-2.5 py-0.5 hover:bg-green-500 hover:text-white transition-colors font-medium"
                              >
                                ✓ OK
                              </button>
                            )}
                            {item.conferido && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.aceito ? 'bg-gray-100 text-gray-500' : div ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {item.aceito ? '✓ Aceito' : div ? '🔴 Divergente' : '✅ OK'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Pedido:</span>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={item.qty_pedida}
                              onChange={(e) => updateItem(item._idx, 'qty_pedida', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-0.5 text-sm w-20 text-center focus:border-brand-red focus:outline-none"
                              title="Corrija a quantidade pedida se necessário"
                            />
                            <span className="text-gray-600 font-medium">{item.purchase_unit}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Preço acordado:</span>{' '}
                            <strong>{fmt(item.preco_acordado)}/{item.purchase_unit}</strong>
                            {item.multiplier > 1 && item.price_unit && (
                              <span className="ml-1 text-xs text-gray-400">
                                ({fmt(item.preco_acordado_base)}/{item.price_unit})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 items-end">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Qtd no pedido do vendedor ({item.purchase_unit})</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.qty_recebida}
                              onChange={(e) => updateItem(item._idx, 'qty_recebida', e.target.value)}
                              className={`border rounded px-3 py-1.5 text-sm w-32 text-center ${
                                item.conferido && !item.aceito && Math.abs(Number(item.qty_recebida) - Number(item.qty_pedida)) > 0.001
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-gray-300'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Valor cobrado (R$/{item.purchase_unit})</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.valor_cobrado}
                              onChange={(e) => updateItem(item._idx, 'valor_cobrado', e.target.value)}
                              className={`border rounded px-3 py-1.5 text-sm w-28 text-center ${
                                item.conferido && !item.aceito && Math.abs(Number(item.valor_cobrado) - Number(item.preco_acordado)) > 0.001
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-gray-300'
                              }`}
                            />
                          </div>
                          {item.conferido && div && !item.aceito && (
                            <div className="flex flex-col gap-1">
                              <div className="text-xs text-red-600">
                                {Math.abs(Number(item.qty_recebida) - Number(item.qty_pedida)) > 0.001 && (
                                  <div>Pedimos {item.qty_pedida}, vendedor lançou {item.qty_recebida} {item.purchase_unit}</div>
                                )}
                                {(() => {
                                  const ac = Number(item.preco_acordado);
                                  const co = Number(item.valor_cobrado);
                                  return ac > 0 && Math.abs(co - ac) / ac > 0.01;
                                })() && (
                                  <div>Acordado {fmt(item.preco_acordado)}/{item.purchase_unit}, cobrado {fmt(item.valor_cobrado)}/{item.purchase_unit}</div>
                                )}
                              </div>
                              <button
                                onClick={() => updateItem(item._idx, 'aceito', true)}
                                className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50 self-start"
                                title="Aceitar esta divergência (ex: peso estimado, unidade diferente)"
                              >
                                ✓ Aceitar divergência
                              </button>
                            </div>
                          )}
                          {item.aceito && (
                            <button
                              onClick={() => updateItem(item._idx, 'aceito', false)}
                              className="text-xs text-gray-400 hover:text-red-500 self-end"
                            >
                              desfazer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-red text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Confirmar Conferência'}
          </button>
        </div>
      )}

      {/* History */}
      {conferencias.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-700 mb-3">Conferências anteriores</h2>
          <div className="bg-white rounded-lg shadow divide-y">
            {conferencias.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">Conf. #{c.id}</span>
                <span className="text-gray-500">Cotação #{c.quotation_id}</span>
                {c.units?.length > 0 && <span className="text-gray-400 text-xs">{c.units.join(' + ')}</span>}
                <span className="text-gray-400 text-xs ml-auto">{new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
                {c.criado_por_name && <span className="text-gray-500 text-xs">{c.criado_por_name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
