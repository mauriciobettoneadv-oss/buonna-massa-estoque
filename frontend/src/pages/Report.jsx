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
  const [searchParams] = useSearchParams();
  const countId = searchParams.get('countId');
  const [items, setItems] = useState([]);
  const [countInfo, setCountInfo] = useState(null);
  const [reportText, setReportText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countId) return;
    setLoading(true);
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

  async function copyToClipboard() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
  }

  function sendToWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
    window.open(url, '_blank');
  }

  if (!countId) {
    return <p className="p-4 text-gray-500">Nenhuma contagem selecionada. Finalize uma contagem primeiro.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Validação e Relatório de Compras</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500 mb-4">Carregando...</p>}

      {countInfo && (
        <p className="text-sm text-gray-600 mb-3">
          Unidade: <strong>{countInfo.unit_name}</strong> — {new Date(countInfo.created_at).toLocaleDateString('pt-BR')} — {items.length} itens a comprar
        </p>
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
