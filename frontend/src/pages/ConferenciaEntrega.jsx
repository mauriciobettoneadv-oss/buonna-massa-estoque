import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const STATUS_OPTIONS = [
  { value: 'ok', label: '✅ Recebido OK' },
  { value: 'qtd_errada', label: '⚠️ Quantidade errada' },
  { value: 'nao_entregue', label: '❌ Não entregue' },
  { value: 'preco_divergente', label: '💰 Preço divergente' },
];

const STATUS_BADGE = {
  aberta: 'bg-yellow-100 text-yellow-700',
  ok: 'bg-green-100 text-green-700',
  divergente: 'bg-red-100 text-red-700',
};

const STATUS_LABEL = {
  aberta: 'Em andamento',
  ok: 'Confirmada',
  divergente: 'Divergência',
};

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

function compressImage(file, maxW = 1200, quality = 0.72) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ConferenciaEntrega() {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  // List state
  const [entregas, setEntregas] = useState([]);
  const [todayEntregas, setTodayEntregas] = useState([]);
  const [loadingToday, setLoadingToday] = useState(true);

  // Detail state
  const [selectedEntrega, setSelectedEntrega] = useState(null);
  const [itens, setItens] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Nota fiscal foto
  const [nfFoto, setNfFoto] = useState(null);
  const [savingFoto, setSavingFoto] = useState(false);
  const [fotoSaved, setFotoSaved] = useState(false);

  // "Com espelho" modal
  const [showModal, setShowModal] = useState(false);
  const [conferencias, setConferencias] = useState([]);

  // "Sem espelho" modal
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [closedQuotations, setClosedQuotations] = useState([]);
  const [directQuotation, setDirectQuotation] = useState(null);
  const [directQuotationData, setDirectQuotationData] = useState(null);
  const [directSupplier, setDirectSupplier] = useState(null);
  const [directUnit, setDirectUnit] = useState(null);
  const [loadingDirectQuotation, setLoadingDirectQuotation] = useState(false);

  async function fetchEntregas() {
    try {
      const data = await request('/conferencia-entrega', { token });
      setEntregas(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchTodayEntregas() {
    setLoadingToday(true);
    try {
      const data = await request('/conferencia-entrega/hoje', { token });
      setTodayEntregas(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingToday(false);
    }
  }

  async function fetchConferencias() {
    try {
      const data = await request('/conferencia-pedido', { token });
      setConferencias(data.filter(c => c.status === 'confirmada'));
    } catch (e) { console.error(e); }
  }

  async function fetchClosedQuotations() {
    try {
      const data = await request('/quotations', { token });
      setClosedQuotations((data || []).filter(q => q.status === 'fechada'));
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    fetchEntregas();
    fetchTodayEntregas();
  }, [token]);

  async function openEntrega(id) {
    setLoading(true);
    setResult(null);
    setNfFoto(null);
    setFotoSaved(false);
    try {
      const data = await request(`/conferencia-entrega/${id}`, { token });
      setSelectedEntrega(data);
      setItens(data.itens || []);
      if (data.nota_fiscal_foto) setNfFoto(data.nota_fiscal_foto);
    } catch (e) {
      alert('Erro ao abrir conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // Starts a conferência directly from today's expected delivery row
  async function startFromHoje(item) {
    setLoading(true);
    try {
      const nova = await request('/conferencia-entrega/from-quotation', {
        method: 'POST', token,
        body: {
          quotation_id: item.quotation_id,
          supplier_id: item.qs_id,
          unit_id: item.unit_id,
        },
      });
      await openEntrega(nova.id);
      fetchEntregas();
      fetchTodayEntregas();
    } catch (e) {
      alert('Erro ao iniciar conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNovaEntrega(cpId) {
    setLoading(true);
    try {
      const nova = await request('/conferencia-entrega', {
        method: 'POST', token,
        body: { conferencia_pedido_id: cpId },
      });
      setShowModal(false);
      await openEntrega(nova.id);
    } catch (e) {
      alert('Erro ao criar conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectDirectQuotation(q) {
    setDirectQuotation(q);
    setDirectSupplier(null);
    setDirectUnit(null);
    setLoadingDirectQuotation(true);
    try {
      const data = await request(`/quotations/${q.id}`, { token });
      setDirectQuotationData(data);
    } catch (e) {
      alert('Erro ao carregar cotação: ' + e.message);
    } finally {
      setLoadingDirectQuotation(false);
    }
  }

  async function handleCreateDirectEntrega() {
    if (!directQuotation || !directSupplier) return;
    setLoading(true);
    try {
      const nova = await request('/conferencia-entrega/from-quotation', {
        method: 'POST', token,
        body: {
          quotation_id: directQuotation.id,
          supplier_id: directSupplier.id,
          unit_id: directUnit?.unit_id || null,
        },
      });
      setShowDirectModal(false);
      setDirectQuotation(null); setDirectQuotationData(null);
      setDirectSupplier(null); setDirectUnit(null);
      await openEntrega(nova.id);
      fetchEntregas();
      fetchTodayEntregas();
    } catch (e) {
      alert('Erro ao criar conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNfFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setNfFoto(compressed);
      setFotoSaved(false);
      // Auto-save photo immediately
      setSavingFoto(true);
      await request(`/conferencia-entrega/${selectedEntrega.id}/foto`, {
        method: 'PUT', token,
        body: { nota_fiscal_foto: compressed },
      });
      setFotoSaved(true);
    } catch (err) {
      alert('Erro ao salvar foto: ' + err.message);
    } finally {
      setSavingFoto(false);
    }
  }

  function updateItem(idx, field, value) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleFinalizar() {
    setSaving(true);
    setResult(null);
    try {
      const body = { itens };
      if (nfFoto) body.nota_fiscal_foto = nfFoto;
      const data = await request(`/conferencia-entrega/${selectedEntrega.id}/finalizar`, {
        method: 'PUT', token, body,
      });
      setSelectedEntrega(data);
      setItens(data.itens || []);
      setResult(data.status);
      fetchEntregas();
      fetchTodayEntregas();
    } catch (e) {
      alert('Erro ao finalizar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  // Group today's deliveries by unit
  const todayByUnit = todayEntregas.reduce((acc, item) => {
    const key = item.unit_name || 'Sem unidade';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const pendingCount = todayEntregas.filter(t => !t.conferencia_id || t.conferencia_status === 'aberta').length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-red">Conferência de Entrega</h1>
        {!selectedEntrega && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { fetchConferencias(); setShowModal(true); }}
              className="bg-brand-red text-white px-4 py-2 rounded hover:opacity-90 text-sm font-medium"
            >
              + Com espelho
            </button>
            <button
              onClick={() => { fetchClosedQuotations(); setShowDirectModal(true); }}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:opacity-90 text-sm font-medium"
            >
              + Sem espelho
            </button>
          </div>
        )}
        {selectedEntrega && (
          <button
            onClick={() => { setSelectedEntrega(null); setResult(null); setNfFoto(null); }}
            className="text-sm text-brand-red hover:underline"
          >
            ← Voltar à lista
          </button>
        )}
      </div>

      {/* ── LIST VIEW ── */}
      {!selectedEntrega && (
        <>
          {/* Today's deliveries banner */}
          {!loadingToday && todayEntregas.length > 0 && (
            <div className="mb-6">
              {pendingCount > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <span className="text-2xl">📦</span>
                  <div>
                    <p className="font-semibold text-amber-800">
                      {pendingCount} entrega{pendingCount > 1 ? 's' : ''} pendente{pendingCount > 1 ? 's' : ''} para hoje — {todayLabel()}
                    </p>
                    <p className="text-sm text-amber-600 mt-0.5">Registre o recebimento antes das 22h30 para evitar alertas.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="font-semibold text-green-800">Todas as entregas conferidas — {todayLabel()}</p>
                    <p className="text-sm text-green-600 mt-0.5">Nenhuma pendência registrada para hoje.</p>
                  </div>
                </div>
              )}

              {/* Deliveries by unit */}
              {Object.entries(todayByUnit).map(([unitName, items]) => (
                <div key={unitName} className="mb-5">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{unitName}</h2>
                  <div className="space-y-2">
                    {items.map((item, i) => {
                      const isDone = item.conferencia_id && item.conferencia_status !== 'aberta';
                      const isInProgress = item.conferencia_id && item.conferencia_status === 'aberta';
                      return (
                        <div key={i} className={`bg-white rounded-lg border p-3 flex items-center justify-between gap-3 ${isDone ? 'border-green-200' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg flex-shrink-0">
                              {isDone ? (item.conferencia_status === 'ok' ? '✅' : '⚠️') : isInProgress ? '🔄' : '📦'}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">{item.supplier_name}</p>
                              <p className="text-xs text-gray-400">Cotação #{item.quotation_id}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isDone && (
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[item.conferencia_status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABEL[item.conferencia_status] || item.conferencia_status}
                              </span>
                            )}
                            <button
                              onClick={() => item.conferencia_id ? openEntrega(item.conferencia_id) : startFromHoje(item)}
                              disabled={loading}
                              className={`text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 ${
                                isDone ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' :
                                isInProgress ? 'bg-yellow-500 text-white hover:opacity-90' :
                                'bg-brand-red text-white hover:opacity-90'
                              }`}
                            >
                              {isDone ? 'Ver' : isInProgress ? 'Continuar' : 'Iniciar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <hr className="border-gray-200 my-6" />
            </div>
          )}

          {/* Historical list */}
          <div>
            {todayEntregas.length > 0 && (
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Histórico</h2>
            )}
            <div className="space-y-3">
              {entregas.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhuma conferência de entrega registrada.</p>
              )}
              {entregas.map(e => (
                <div
                  key={e.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between cursor-pointer hover:border-brand-red"
                  onClick={() => openEntrega(e.id)}
                >
                  <div>
                    <span className="font-medium text-gray-800">Entrega #{e.id}</span>
                    {e.supplier_name && <span className="text-sm font-medium text-gray-700 ml-2">— {e.supplier_name}</span>}
                    {e.conferente_name && <span className="text-sm text-gray-500 ml-2">por {e.conferente_name}</span>}
                    {e.finalizado_em && (
                      <span className="text-xs text-gray-400 ml-2">
                        — {new Date(e.finalizado_em).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[e.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[e.status] || e.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── DETAIL VIEW ── */}
      {selectedEntrega && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center justify-between">
            <div>
              <span className="font-semibold text-gray-700">Entrega #{selectedEntrega.id}</span>
              {selectedEntrega.supplier_name && (
                <span className="ml-2 text-gray-600 font-medium">— {selectedEntrega.supplier_name}</span>
              )}
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_BADGE[selectedEntrega.status] || 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[selectedEntrega.status] || selectedEntrega.status}
            </span>
          </div>

          {/* Nota Fiscal Photo */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">📋 Nota Fiscal</span>
              {selectedEntrega.status === 'aberta' && (
                <label className="cursor-pointer bg-gray-700 hover:bg-gray-800 text-white px-3 py-1 rounded text-xs font-medium">
                  {nfFoto ? '📷 Trocar foto' : '📷 Tirar foto / Anexar'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleNfFoto}
                  />
                </label>
              )}
            </div>
            {!nfFoto && (
              <p className="text-xs text-gray-400">Tire uma foto da nota fiscal para registrar o recebimento.</p>
            )}
            {nfFoto && (
              <div>
                <img src={nfFoto} alt="Nota Fiscal" className="max-h-56 rounded border border-gray-200 object-contain" />
                <p className="text-xs mt-1 text-gray-400">
                  {savingFoto ? '⏳ Salvando...' : fotoSaved ? '✅ Foto salva' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Result banners */}
          {result === 'ok' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 font-medium text-sm">
              ✅ Entrega confirmada! Todos os itens foram conferidos corretamente.
            </div>
          )}
          {result === 'divergente' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <p className="font-semibold mb-2">⚠️ Divergências encontradas:</p>
              <ul className="space-y-1">
                {itens.filter(i => i.status !== 'ok').map((i, idx) => (
                  <li key={idx}>
                    {i.status === 'nao_entregue' && `❌ ${i.nome}: Não entregue`}
                    {i.status === 'qtd_errada' && `⚠️ ${i.nome}: Qtd esperada ${i.qtd_pedida}, recebida ${i.qtd_recebida}`}
                    {i.status === 'preco_divergente' && `💰 ${i.nome}: Valor esperado ${fmt(i.valor_pedido)}, cobrado ${fmt(i.valor_recebido)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick-action bar when status is aberta */}
          {selectedEntrega.status === 'aberta' && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setItens(prev => prev.map(i => ({ ...i, status: 'ok' })))}
                className="flex-1 bg-green-50 border border-green-300 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-100"
              >
                ✅ Tudo certo
              </button>
            </div>
          )}

          {/* Items */}
          <div className="space-y-3">
            {itens.map((item, idx) => (
              <div key={idx} className={`bg-white rounded-lg border p-4 ${item.status !== 'ok' ? 'border-amber-300' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-gray-800">{item.nome || item.product_name || `Item ${idx + 1}`}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Pedido: {item.qtd_pedida} {item.purchase_unit || 'un'} × {fmt(item.valor_pedido)}
                      {' = '}{fmt((item.qtd_pedida || 0) * (item.valor_pedido || 0))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={item.status}
                      onChange={e => updateItem(idx, 'status', e.target.value)}
                      disabled={selectedEntrega.status !== 'aberta'}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {item.status === 'qtd_errada' && (
                      <input
                        type="number" min="0" step="0.01"
                        placeholder="Qtd recebida"
                        value={item.qtd_recebida ?? ''}
                        onChange={e => updateItem(idx, 'qtd_recebida', e.target.value)}
                        disabled={selectedEntrega.status !== 'aberta'}
                        className="w-32 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    )}
                    {item.status === 'preco_divergente' && (
                      <input
                        type="number" min="0" step="0.01"
                        placeholder="Valor cobrado (R$)"
                        value={item.valor_recebido ?? ''}
                        onChange={e => updateItem(idx, 'valor_recebido', e.target.value)}
                        disabled={selectedEntrega.status !== 'aberta'}
                        className="w-40 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedEntrega.status === 'aberta' && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleFinalizar}
                disabled={saving}
                className="bg-brand-red text-white px-6 py-2 rounded hover:opacity-90 font-medium disabled:opacity-50"
              >
                {saving ? 'Finalizando...' : 'Finalizar Conferência'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: com espelho */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-brand-red mb-4">Selecionar Conferência de Pedido</h2>
            {conferencias.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma conferência de pedido com status "confirmada" encontrada.</p>
            ) : (
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {conferencias.map(cp => (
                  <li key={cp.id}>
                    <button
                      onClick={() => handleNovaEntrega(cp.id)}
                      disabled={loading}
                      className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-brand-red hover:bg-red-50 text-sm"
                    >
                      <span className="font-medium">Conferência #{cp.id}</span>
                      {cp.quotation_id && <span className="text-gray-500 ml-2">— Cotação #{cp.quotation_id}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowModal(false)} className="text-sm text-gray-500 hover:underline">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: sem espelho */}
      {showDirectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Conferência sem espelho</h2>
            <p className="text-xs text-gray-500 mb-4">Para fornecedores que não enviam espelho (Bressan, BRF, Ambev, Coca-Cola…).</p>

            <p className="text-sm font-semibold text-gray-700 mb-2">1. Cotação</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {closedQuotations.length === 0 && <p className="text-sm text-gray-400">Nenhuma cotação fechada.</p>}
              {closedQuotations.map(q => (
                <button key={q.id} onClick={() => handleSelectDirectQuotation(q)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${directQuotation?.id === q.id ? 'bg-brand-red text-white border-brand-red' : 'border-gray-300 text-gray-700 hover:border-brand-red'}`}>
                  Cotação #{q.id}
                  {q.units?.length > 0 && <span className="ml-1 opacity-70 text-xs">({q.units.join('+')})</span>}
                </button>
              ))}
            </div>

            {loadingDirectQuotation && <p className="text-sm text-gray-400 mb-4">Carregando...</p>}

            {directQuotationData && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-2">2. Loja (opcional)</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => setDirectUnit(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${!directUnit ? 'bg-brand-red text-white border-brand-red' : 'border-gray-300 text-gray-700 hover:border-brand-red'}`}>
                    Todas as lojas
                  </button>
                  {directQuotationData.counts.map(c => (
                    <button key={c.unit_id} onClick={() => setDirectUnit(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm border ${directUnit?.unit_id === c.unit_id ? 'bg-brand-red text-white border-brand-red' : 'border-gray-300 text-gray-700 hover:border-brand-red'}`}>
                      {c.unit_name}
                    </button>
                  ))}
                </div>

                <p className="text-sm font-semibold text-gray-700 mb-2">3. Fornecedor</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {directQuotationData.suppliers.map(s => (
                    <button key={s.id} onClick={() => setDirectSupplier(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm border ${directSupplier?.id === s.id ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-700 hover:border-gray-500'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-between items-center">
              <button onClick={() => { setShowDirectModal(false); setDirectQuotation(null); setDirectQuotationData(null); setDirectSupplier(null); setDirectUnit(null); }}
                className="text-sm text-gray-500 hover:underline">
                Cancelar
              </button>
              <button
                onClick={handleCreateDirectEntrega}
                disabled={!directQuotation || !directSupplier || loading}
                className="bg-gray-800 text-white px-5 py-2 rounded hover:opacity-90 text-sm font-medium disabled:opacity-40"
              >
                {loading ? 'Criando...' : 'Iniciar Conferência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
