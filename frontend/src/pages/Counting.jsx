import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const CONTINUOUS_UNITS = ['kg', 'g', 'mg', 'l', 'ml', 'litro', 'litros', 'gramas'];

function isDecimalUnit(unit) {
  return CONTINUOUS_UNITS.includes((unit || '').toLowerCase().trim());
}

function statusIcon(item) {
  const current = Number(item.current_stock);
  const min = Number(item.min_stock);
  if (current <= 0) return '🔴';
  if (current < min) return '⚠️';
  return '✅';
}

export default function Counting() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [countId, setCountId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    request('/units', { token }).then(setUnits).catch((err) => setError(err.message));
  }, [token]);

  async function selectUnit(id) {
    setUnitId(id);
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const count = await request('/stock-counts', { method: 'POST', token, body: { unit_id: Number(id) } });
      setCountId(count.id);
      const data = await request(`/stock-counts/${count.id}`, { token });
      setItems(data.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateLocalItem(productId, field, value) {
    setItems((prev) => prev.map((item) => {
      if (item.product_id !== productId) return item;
      const updated = { ...item, [field]: value };
      if (field === 'current_stock') {
        const current = Number(value || 0);
        const min = Number(item.min_stock);
        const diff = min - current;
        const raw = diff > 0 ? diff : 0;
        updated.qty_to_buy = isDecimalUnit(item.purchase_unit) ? raw : Math.ceil(raw);
      }
      return updated;
    }));
  }

  async function saveItem(item) {
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

  async function finalizeCount() {
    setFinalizing(true);
    setError('');
    try {
      await request(`/stock-counts/${countId}/finalize`, { method: 'POST', token });
      navigate(`/relatorio?countId=${countId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Contagem de Estoque</h1>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
        <select
          value={unitId}
          onChange={(e) => selectUnit(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 w-full max-w-xs"
        >
          <option value="">Selecione a unidade</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && items.length > 0 && (
        <div className="bg-white rounded-lg shadow divide-y">
          {items.map((item) => (
            <div key={item.product_id} className="flex items-center gap-3 p-3">
              <span className="text-lg w-6">{statusIcon(item)}</span>
              <span className="flex-1 text-sm">{item.name}</span>
              <div className="flex flex-col items-center">
                <label className="text-xs text-gray-500">Tem ({item.unit_measure})</label>
                <input
                  type="number"
                  step={isDecimalUnit(item.unit_measure) ? '0.01' : '1'}
                  min="0"
                  value={item.current_stock}
                  onChange={(e) => updateLocalItem(item.product_id, 'current_stock', e.target.value)}
                  onBlur={() => saveItem(items.find((i) => i.product_id === item.product_id))}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-center"
                />
              </div>
              <div className="flex flex-col items-center">
                <label className="text-xs text-gray-500">Comprar ({item.unit_measure})</label>
                <input
                  type="number"
                  step={isDecimalUnit(item.unit_measure) ? '0.01' : '1'}
                  min="0"
                  value={item.qty_to_buy}
                  onChange={(e) => updateLocalItem(item.product_id, 'qty_to_buy', e.target.value)}
                  onBlur={() => saveItem(items.find((i) => i.product_id === item.product_id))}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-center"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {user?.role === 'proprietario' && countId && items.length > 0 && (
        <button
          onClick={finalizeCount}
          disabled={finalizing}
          className="bg-brand-red text-white rounded-lg px-6 py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {finalizing ? 'Finalizando...' : 'Finalizar Contagem'}
        </button>
      )}
    </div>
  );
}
