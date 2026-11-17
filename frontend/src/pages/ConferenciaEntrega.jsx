import { useEffect, useState } from 'react';
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
  ok: 'Entrega Confirmada',
  divergente: 'Com Divergências',
};

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ConferenciaEntrega() {
  const { token } = useAuth();
  const [entregas, setEntregas] = useState([]);
  const [conferencias, setConferencias] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState(null);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Direct-from-quotation state
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

  async function fetchConferencias() {
    try {
      const data = await request('/conferencia-pedido', { token });
      setConferencias(data.filter(c => c.status === 'confirmada'));
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchClosedQuotations() {
    try {
      const data = await request('/quotations', { token });
      setClosedQuotations((data || []).filter(q => q.status === 'fechada'));
    } catch (e) { console.error(e); }
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
        method: 'POST',
        token,
        body: {
          quotation_id: directQuotation.id,
          supplier_id: directSupplier.id,
          unit_id: directUnit?.unit_id || null,
        },
      });
      setShowDirectModal(false);
      setDirectQuotation(null);
      setDirectQuotationData(null);
      setDirectSupplier(null);
      setDirectUnit(null);
      await openEntrega(nova.id);
      await fetchEntregas();
    } catch (e) {
      alert('Erro ao criar conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntregas();
  }, [token]);

  async function handleNovaEntrega(cpId) {
    setLoading(true);
    try {
      const nova = await request('/conferencia-entrega', {
        method: 'POST',
        token,
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

  async function openEntrega(id) {
    setLoading(true);
    setResult(null);
    try {
      const data = await request(`/conferencia-entrega/${id}`, { token });
      setSelectedEntrega(data);
      setItens(data.itens || []);
    } catch (e) {
      alert('Erro ao abrir conferência: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(idx, field, value) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleFinalizar() {
    setSaving(true);
    setResult(null);
    try {
      const data = await request(`/conferencia-entrega/${selectedEntrega.id}/finalizar`, {
        method: 'PUT',
        token,
        body: { itens },
      });
      setSelectedEntrega(data);
      setItens(data.itens || []);
      setResult(data.status);
      await fetchEntregas();
    } catch (e) {
      alert('Erro ao finalizar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
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
            onClick={() => { setSelectedEntrega(null); setResult(null); }}
            className="text-sm text-brand-red hover:underline"
          >
            ← Voltar à lista
          </button>
        )}
      </div>

      {/* Lista de entregas */}
      {!selectedEntrega && (
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
      )}

      {/* Tela de conferência */}
      {selectedEntrega && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center justify-between">
            <span className="font-semibold text-gray-700">Entrega #{selectedEntrega.id}</span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_BADGE[selectedEntrega.status] || 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[selectedEntrega.status] || selectedEntrega.status}
            </span>
          </div>

          {result === 'ok' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 font-medium text-sm">
              ✅ Entrega confirmada! Todos os itens foram conferidos corretamente.
            </div>
          )}
          {result === 'divergente' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <p className="font-semibold mb-2">⚠️ Divergências encontradas na entrega:</p>
              <ul className="space-y-1">
                {itens.filter(i => i.status !== 'ok').map((i, idx) => (
                  <li key={idx}>
                    {i.status === 'nao_entregue' && `❌ ${i.nome}: Não entregue`}
                    {i.status === 'qtd_errada' && `⚠️ ${i.nome}: Qtd esperada ${i.qtd_pedida}, recebida ${i.qtd_recebida}`}
                    {i.status === 'preco_divergente' && `💰 ${i.nome}: Valor esperado R$${i.valor_pedido}, cobrado R$${i.valor_recebido}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {itens.map((item, idx) => (
              <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-gray-800">{item.nome || item.product_name || `Item ${idx + 1}`}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Pedido: {item.qtd_pedida} un × R$ {parseFloat(item.valor_pedido || 0).toFixed(2)}
                      {' = '}R$ {(parseFloat(item.qtd_pedida || 0) * parseFloat(item.valor_pedido || 0)).toFixed(2)}
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

      {/* Modal para selecionar conferência de pedido */}
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

      {/* Modal direto sem espelho */}
      {showDirectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Conferência sem espelho</h2>
            <p className="text-xs text-gray-500 mb-4">Para fornecedores que não enviam espelho (Bressan, BRF, Ambev, Coca-Cola…). A conferência é feita diretamente no momento do recebimento.</p>

            {/* Step 1: selecionar cotação */}
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

            {/* Step 2: selecionar unidade */}
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

                {/* Step 3: selecionar fornecedor */}
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
