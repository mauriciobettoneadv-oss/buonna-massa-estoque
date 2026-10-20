import { useEffect, useState } from 'react';

const CONTINUOUS_UNITS = ['kg', 'g', 'mg', 'l', 'ml', 'litro', 'litros', 'gramas'];
function isDecimalUnit(unit) {
  return CONTINUOUS_UNITS.includes((unit || '').toLowerCase().trim());
}
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

export default function Report() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const countId = searchParams.get('countId');
  const [items, setItems] = useState([]);
  const [countInfo, setCountInfo] = useState(null);
  const [reportText, setReportText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [historyTab, setHistoryTab] = useState('contagens'); // 'contagens' | 'compras'
  const [quotations, setQuotations] = useState([]);
  const [quotationsLoading, setQuotationsLoading] = useState(false);

  useEffect(() => {
    if (!countId) {
      setHistoryLoading(true);
      request('/stock-counts/history', { token })
        .then(setHistory)
        .catch(err => setError(err.message))
        .finally(() => setHistoryLoading(false));
      setQuotationsLoading(true);
      request('/quotations', { token })
        .then(list => setQuotations(list.filter(q => q.status === 'fechada')))
        .catch(() => {})
        .finally(() => setQuotationsLoading(false));
      return;
    }
    setLoading(true);
    setFinalized(false);
    setReportText('');
    request(`/stock-counts/${countId}/report`, { token })
      .then((data) => {
        setCountInfo(data.count);
        setItems(data.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [countId, token]);

  function updateQty(productId, value) {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, qty_to_buy: value } : i)));
  }

  async function saveQty(item) {
    try {
      await request(`/stock-counts/${countId}/items`, {
        method: 'PUT',
        token,
        body: {
          product_id: item.product_id,
          current_stock: Number(item.current_stock) || 0,
          qty_to_buy: Number(item.qty_to_buy) || 0,
        },
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function generateReport() {
    setError('');
    const unitName = countInfo?.unit_name || '';
    const date = countInfo ? new Date(countInfo.created_at).toLocaleDateString('pt-BR') : '';

    const grouped = items.reduce((acc, item) => {
      acc[item.category] = acc[item.category] || [];
      acc[item.category].push(item);
      return acc;
    }, {});

    let text = '===========================================\n';
    text += 'LISTA DE COMPRAS – BUONNA MASSA\n';
    text += `Unidade: ${unitName}\n`;
    text += `Data: ${date}\n`;
    text += '===========================================\n\n';

    for (const [category, catItems] of Object.entries(grouped)) {
      text += `${category.toUpperCase()}\n`;
      for (const item of catItems) {
        text += `- ${item.name}: ${Number(item.qty_to_buy)} ${item.purchase_unit}\n`;
      }
      text += '\n';
    }

    text += '===========================================';
    setReportText(text);
    setCopied(false);
  }

  async function finalizeCount() {
    setFinalizing(true);
    setError('');
    try {
      await request(`/stock-counts/${countId}/finalize`, { method: 'POST', token });
      setFinalized(true);
      setCountInfo(ci => ci ? { ...ci, status: 'finalizada' } : ci);
      generateReport();
    } catch (err) {
      setError(err.message || 'Erro ao finalizar contagem.');
    } finally {
      setFinalizing(false);
    }
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
  }

  function sendToWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
    window.open(url, '_blank');
  }

  if (!countId) {
    const saved = history.filter(h => h.status === 'salva');
    const finalized = history.filter(h => h.status === 'finalizada');
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-xl font-bold text-brand-red mb-4">Relatório de Compras</h1>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setHistoryTab('contagens')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${historyTab === 'contagens' ? 'bg-white text-brand-red shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Contagens
          </button>
          <button
            onClick={() => setHistoryTab('compras')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${historyTab === 'compras' ? 'bg-white text-brand-red shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Pedidos de Compra
          </button>
        </div>

        {historyTab === 'contagens' && (
          <>
            {historyLoading && <p className="text-gray-500">Carregando contagens...</p>}
            {saved.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Contagens aguardando finalização</h2>
                <div className="space-y-2">
                  {saved.map(c => (
                    <div
                      key={c.id}
                      className="bg-white border border-yellow-300 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:border-brand-red hover:shadow-sm transition-all"
                      onClick={() => setSearchParams({ countId: c.id })}
                    >
                      <div>
                        <p className="font-medium text-gray-800">{c.unit_name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')} · {c.items_to_buy} itens a comprar
                          {c.saved_by_name && ` · salva por ${c.saved_by_name}`}
                        </p>
                      </div>
                      <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">Salva</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {finalized.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Contagens finalizadas</h2>
                <div className="space-y-2">
                  {finalized.map(c => (
                    <div
                      key={c.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:border-brand-red hover:shadow-sm transition-all"
                      onClick={() => setSearchParams({ countId: c.id })}
                    >
                      <div>
                        <p className="font-medium text-gray-800">{c.unit_name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')} · {c.items_to_buy} itens
                          {c.finalized_by_name && ` · finalizada por ${c.finalized_by_name}`}
                        </p>
                      </div>
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">Finalizada</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!historyLoading && saved.length === 0 && finalized.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhuma contagem salva ou finalizada encontrada.</p>
            )}
          </>
        )}

        {historyTab === 'compras' && (
          <>
            {quotationsLoading && <p className="text-gray-500">Carregando pedidos...</p>}
            {!quotationsLoading && quotations.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhum pedido de compra fechado encontrado.</p>
            )}
            {quotations.length > 0 && (
              <div className="space-y-2">
                {quotations.map(q => (
                  <div
                    key={q.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-800">Cotação #{q.id}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(q.created_at).toLocaleDateString('pt-BR')}
                        {q.units?.filter(Boolean).length > 0 && ` · ${q.units.filter(Boolean).join(', ')}`}
                      </p>
                    </div>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">Fechada</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <button onClick={() => setSearchParams({})} className="text-sm text-brand-red hover:underline mb-4 flex items-center gap-1">
        ← Voltar para lista
      </button>
      <h1 className="text-xl font-bold text-brand-red mb-4">Validação e Relatório de Compras</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500 mb-4">Carregando...</p>}

      {countInfo && (
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm text-gray-600">
            Unidade: <strong>{countInfo.unit_name}</strong> — {new Date(countInfo.created_at).toLocaleDateString('pt-BR')} — {items.length} itens a comprar
            {' · '}
            <span className={`font-medium ${countInfo.status === 'finalizada' ? 'text-green-600' : 'text-yellow-600'}`}>
              {countInfo.status === 'finalizada' ? 'Finalizada' : 'Salva'}
            </span>
          </p>
          {countInfo.status === 'salva' && (
            <button
              onClick={finalizeCount}
              disabled={finalizing}
              className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {finalizing ? 'Finalizando...' : '✓ Finalizar Contagem'}
            </button>
          )}
          {finalized && (
            <span className="text-green-600 text-sm font-medium">Contagem finalizada!</span>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow divide-y mb-4">
        {!loading && items.length === 0 && <p className="p-4 text-gray-500">Nenhum item a comprar.</p>}
        {items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-3 p-3">
            <span className="flex-1 text-sm">{item.name}</span>
            <span className="text-xs text-gray-500">
              Atual: {item.current_stock} {item.unit_measure}
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step={isDecimalUnit(item.purchase_unit) ? '0.01' : '1'}
                min="0"
                value={item.qty_to_buy}
                onChange={(e) => updateQty(item.product_id, e.target.value)}
                onBlur={() => saveQty(items.find((i) => i.product_id === item.product_id))}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-center"
              />
              <span className="text-xs text-gray-500">{item.purchase_unit}</span>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <button
          onClick={generateReport}
          className="bg-brand-red text-white rounded-lg px-6 py-2 font-medium hover:opacity-90 mb-4"
        >
          Gerar Relatório
        </button>
      )}

      {reportText && (
        <div className="bg-white rounded-lg shadow p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono">{reportText}</pre>
          <div className="flex gap-2 mt-3">
            <button
              onClick={copyToClipboard}
              className="border border-brand-red text-brand-red rounded px-4 py-2 hover:bg-brand-red hover:text-white"
            >
              {copied ? 'Copiado!' : 'Copiar para área de transferência'}
            </button>
            <button
              onClick={sendToWhatsApp}
              className="bg-green-600 text-white rounded px-4 py-2 hover:opacity-90"
            >
              Enviar via WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
