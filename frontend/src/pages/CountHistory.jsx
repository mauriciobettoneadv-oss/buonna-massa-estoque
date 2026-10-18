import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const STATUS_BADGE = {
  aberta: { label: 'Aberta', cls: 'bg-yellow-100 text-yellow-700' },
  salva: { label: 'Salva', cls: 'bg-blue-100 text-blue-700' },
  finalizada: { label: 'Finalizada', cls: 'bg-green-100 text-green-700' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CountHistory() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [itemsCache, setItemsCache] = useState({});
  const [loadingItems, setLoadingItems] = useState({});
  const [selected, setSelected] = useState([]);
  const [compareModal, setCompareModal] = useState(false);
  const [compareData, setCompareData] = useState(null);

  useEffect(() => {
    request('/stock-counts/history', { token })
      .then(setCounts)
      .catch((err) => setError(err.message));
  }, [token]);

  async function toggleExpand(id) {
    const isOpen = expanded[id];
    setExpanded((prev) => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !itemsCache[id]) {
      setLoadingItems((prev) => ({ ...prev, [id]: true }));
      try {
        const data = await request(`/stock-counts/${id}`, { token });
        setItemsCache((prev) => ({ ...prev, [id]: data.items }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingItems((prev) => ({ ...prev, [id]: false }));
      }
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function openCompare() {
    if (selected.length < 2) return;
    const [idA, idB] = selected;
    let itemsA = itemsCache[idA];
    let itemsB = itemsCache[idB];
    if (!itemsA) {
      const d = await request(`/stock-counts/${idA}`, { token });
      itemsA = d.items;
      setItemsCache((prev) => ({ ...prev, [idA]: itemsA }));
    }
    if (!itemsB) {
      const d = await request(`/stock-counts/${idB}`, { token });
      itemsB = d.items;
      setItemsCache((prev) => ({ ...prev, [idB]: itemsB }));
    }
    const countA = counts.find((c) => c.id === idA);
    const countB = counts.find((c) => c.id === idB);
    const mapA = Object.fromEntries(itemsA.map((i) => [i.product_id, i]));
    const mapB = Object.fromEntries(itemsB.map((i) => [i.product_id, i]));
    const allIds = [...new Set([...itemsA.map((i) => i.product_id), ...itemsB.map((i) => i.product_id)])];
    const rows = allIds.map((pid) => ({
      name: (mapA[pid] || mapB[pid]).name,
      a: mapA[pid] || null,
      b: mapB[pid] || null,
    }));
    setCompareData({ countA, countB, rows });
    setCompareModal(true);
  }

  if (!counts) return <p className="text-gray-500 p-4">Carregando histórico...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Histórico de Contagens</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {selected.length === 2 && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-gray-600">{selected.length} contagens selecionadas</span>
          <button
            onClick={openCompare}
            className="bg-brand-red text-white text-sm px-4 py-1.5 rounded font-medium hover:opacity-90"
          >
            Comparar
          </button>
          <button onClick={() => setSelected([])} className="text-sm text-gray-500 hover:underline">Limpar</button>
        </div>
      )}

      {counts.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhuma contagem encontrada.</p>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y">
          {counts.map((c) => {
            const badge = STATUS_BADGE[c.status] || STATUS_BADGE.aberta;
            const isExpanded = expanded[c.id];
            const isSelected = selected.includes(c.id);
            return (
              <div key={c.id} className={isSelected ? 'bg-yellow-50' : ''}>
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(c.id)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                    className="w-4 h-4 accent-brand-red"
                    onChange={() => {}}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-800">{c.unit_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDate(c.created_at)}
                      {c.created_by_name && <> · {c.created_by_name}</>}
                      {c.items_counted > 0 && <> · {c.items_counted} produtos contados</>}
                      {c.items_to_buy > 0 && <> · {c.items_to_buy} para comprar</>}
                    </p>
                  </div>
                  {c.status === 'finalizada' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/relatorio?countId=${c.id}`); }}
                      className="text-sm text-brand-red hover:underline font-medium shrink-0"
                    >
                      Relatório →
                    </button>
                  )}
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 border-t bg-gray-50">
                    {loadingItems[c.id] ? (
                      <p className="text-xs text-gray-400 py-2">Carregando itens...</p>
                    ) : itemsCache[c.id] ? (
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-gray-500 border-b">
                            <th className="text-left pb-1">Produto</th>
                            <th className="text-right pb-1">Tem</th>
                            <th className="text-right pb-1">Comprar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsCache[c.id].filter((i) => Number(i.current_stock) > 0 || Number(i.qty_to_buy) > 0).map((item) => (
                            <tr key={item.product_id} className="border-b border-gray-100">
                              <td className="py-1 text-gray-700">{item.name}</td>
                              <td className="text-right text-gray-600">{item.current_stock} {item.unit_measure}</td>
                              <td className="text-right text-gray-600">{item.qty_to_buy} {item.purchase_unit || item.unit_measure}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {compareModal && compareData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">Comparação de Contagens</h2>
              <button onClick={() => setCompareModal(false)} className="text-gray-500 hover:text-gray-800 text-lg">✕</button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left pb-2">Produto</th>
                    <th className="text-right pb-2 text-blue-700">{compareData.countA.unit_name} {fmtDate(compareData.countA.created_at).slice(0,10)}</th>
                    <th className="text-right pb-2 text-green-700">{compareData.countB.unit_name} {fmtDate(compareData.countB.created_at).slice(0,10)}</th>
                  </tr>
                </thead>
                <tbody>
                  {compareData.rows.map((row) => (
                    <tr key={row.name} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">{row.name}</td>
                      <td className="text-right text-blue-700">
                        {row.a ? `${row.a.current_stock} / comprar ${row.a.qty_to_buy}` : '—'}
                      </td>
                      <td className="text-right text-green-700">
                        {row.b ? `${row.b.current_stock} / comprar ${row.b.qty_to_buy}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
