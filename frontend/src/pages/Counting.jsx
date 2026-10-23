import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CONTINUOUS_UNITS = ['kg', 'g', 'mg', 'l', 'ml', 'litro', 'litros', 'gramas'];
function isDecimalUnit(unit) {
  return CONTINUOUS_UNITS.includes((unit || '').toLowerCase().trim());
}

const COUNT_STATUS_LABEL = {
  aberta: { label: 'Em andamento', color: 'bg-yellow-100 text-yellow-700' },
  salva: { label: 'Aguardando compras', color: 'bg-blue-100 text-blue-700' },
  finalizada: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
};
const OWNER_ROLES = ['dono', 'proprietario', 'gerente'];

function itemBorderStyle(item) {
  const current = Number(item.current_stock);
  const min = Number(item.min_stock);
  if (current <= 0) return { borderLeft: '4px solid #812f28', background: '#fef2f2' };
  if (current < min) return { borderLeft: '4px solid #ee4723', background: '#fffbea' };
  return { borderLeft: '4px solid #2d6a4f', background: '#fff' };
}

function statusIconEl(item) {
  const current = Number(item.current_stock);
  const min = Number(item.min_stock);
  if (current <= 0) return <span className="text-base w-5 shrink-0" title="Sem estoque">🔴</span>;
  if (current < min) return <span className="text-base w-5 shrink-0" title="Abaixo do mínimo">⚠️</span>;
  return <span className="text-base w-5 shrink-0" title="OK">✅</span>;
}

function HighlightText({ text, search }) {
  if (!search) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(search.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </>
  );
}

function StepButton({ onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ minWidth: 44, minHeight: 44 }}
      className="flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 font-bold text-lg hover:bg-gray-100 disabled:opacity-40 select-none"
    >
      {label}
    </button>
  );
}

function SortableItem({ item, isReadOnly, search, suggestions, onUpdate, onSave }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.product_id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...itemBorderStyle(item),
  };

  const step = isDecimalUnit(item.unit_measure) ? 0.1 : 1;
  const buyStep = isDecimalUnit(item.purchase_unit || item.unit_measure) ? 0.1 : 1;
  const sugg = suggestions[item.product_id];
  const buyUnit = item.purchase_unit || item.unit_measure;

  function adj(field, delta) {
    const current = Number(item[field]) || 0;
    const next = Math.max(0, parseFloat((current + delta).toFixed(3)));
    onUpdate(item.product_id, field, next);
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1 shadow-sm">
      {/* Drag handle */}
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 text-lg px-1 select-none shrink-0">⠿</span>

      {statusIconEl(item)}

      {/* Product name */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-800 leading-tight">
          <HighlightText text={item.name} search={search} />
        </p>
      </div>

      {/* TEM field */}
      <div className="flex items-center gap-1 shrink-0">
        <StepButton onClick={() => { adj('current_stock', -step); onSave({ ...item, current_stock: Math.max(0, Number(item.current_stock) - step) }); }} disabled={isReadOnly} label="−" />
        <input
          type="number"
          step={step}
          min="0"
          value={item.current_stock}
          disabled={isReadOnly}
          onChange={(e) => onUpdate(item.product_id, 'current_stock', e.target.value)}
          onBlur={() => onSave(item)}
          className="w-14 border border-gray-300 rounded px-1 py-1 text-center text-sm disabled:bg-gray-100"
        />
        <StepButton onClick={() => { adj('current_stock', step); onSave({ ...item, current_stock: Number(item.current_stock) + step }); }} disabled={isReadOnly} label="+" />
        {item.unit_measure && <span className="text-xs text-gray-400 w-10 truncate">{item.unit_measure}</span>}
      </div>

      <div className="w-px h-8 bg-gray-200 shrink-0" />

      {/* COMPRAR field */}
      <div className="flex flex-col items-start shrink-0">
        <div className="flex items-center gap-1">
          <StepButton onClick={() => { adj('qty_to_buy', -buyStep); onSave({ ...item, qty_to_buy: Math.max(0, Number(item.qty_to_buy) - buyStep) }); }} disabled={isReadOnly} label="−" />
          <input
            type="number"
            step={buyStep}
            min="0"
            value={item.qty_to_buy}
            disabled={isReadOnly}
            onChange={(e) => onUpdate(item.product_id, 'qty_to_buy', e.target.value)}
            onBlur={() => onSave(item)}
            className="w-14 border border-gray-300 rounded px-1 py-1 text-center text-sm disabled:bg-gray-100"
          />
          <StepButton onClick={() => { adj('qty_to_buy', buyStep); onSave({ ...item, qty_to_buy: Number(item.qty_to_buy) + buyStep }); }} disabled={isReadOnly} label="+" />
          {buyUnit && <span className="text-xs text-gray-400 w-10 truncate">{buyUnit}</span>}
        </div>
        {sugg && sugg.n_counts > 0 && (
          <p className="text-xs text-gray-400 mt-0.5 pl-1">
            Média {sugg.n_counts >= 4 ? '4' : sugg.n_counts} sem.: {sugg.avg_qty} {buyUnit}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Counting() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [countId, setCountId] = useState(null);
  const [countStatus, setCountStatus] = useState('aberta');
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  const isOwnerOrManager = OWNER_ROLES.includes(user?.role);
  const isReadOnly = countStatus === 'finalizada';

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    request('/units', { token }).then(setUnits).catch((err) => setError(err.message));
  }, [token]);

  async function selectUnit(id) {
    setUnitId(id);
    setSuggestions({});
    if (!id) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const count = await request('/stock-counts', { method: 'POST', token, body: { unit_id: Number(id) } });
      setCountId(count.id);
      setCountStatus(count.status);
      const data = await request(`/stock-counts/${count.id}`, { token });
      setItems(data.items);
      setCountStatus(data.count.status);
      // Load suggestions in background
      request(`/stock-counts/suggestions/${id}`, { token })
        .then(setSuggestions)
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const updateLocalItem = useCallback((productId, field, value) => {
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
  }, []);

  async function saveItem(item) {
    if (isReadOnly) return;
    try {
      await request(`/stock-counts/${countId}/items`, {
        method: 'PUT', token,
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

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.product_id === active.id);
      const newIdx = prev.findIndex((i) => i.product_id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      // Fire and forget reorder
      request('/products/reorder', {
        method: 'PUT', token,
        body: { ids: reordered.map((i) => i.product_id) },
      }).catch(() => {});
      return reordered;
    });
  }

  async function handleSaveCount() {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const updated = await request(`/stock-counts/${countId}/save`, { method: 'POST', token });
      setCountStatus(updated.status);
      setSuccessMsg('Contagem salva! Donos e Gerentes foram notificados por WhatsApp.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizeCount() {
    if (!window.confirm('Finalizar a contagem? Após finalizar, ela não poderá mais ser editada.')) return;
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

  const statusInfo = COUNT_STATUS_LABEL[countStatus] || COUNT_STATUS_LABEL.aberta;
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  // Progress bar: items that have been touched (stock > 0 or to_buy > 0)
  const touchedCount = items.filter((i) => Number(i.current_stock) > 0 || Number(i.qty_to_buy) > 0).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((touchedCount / total) * 100) : 0;

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
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {successMsg && <p className="text-green-600 text-sm mb-4 font-medium">{successMsg}</p>}
      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && countId && (
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {countStatus === 'finalizada' && (
            <span className="text-xs text-gray-500">Esta contagem está concluída e não pode ser editada.</span>
          )}
          {countStatus === 'salva' && !isOwnerOrManager && (
            <span className="text-xs text-gray-500">Aguardando Dono ou Gerente para finalizar.</span>
          )}
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{touchedCount} de {total} itens preenchidos ({pct}%)</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${pct}%`, background: '#812f28' }}
              />
            </div>
          </div>

          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="🔍 Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:border-brand-red"
            />
          </div>
        </>
      )}

      {!loading && items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredItems.map((i) => i.product_id)} strategy={verticalListSortingStrategy}>
            <div className="mb-4">
              {/* Table header */}
              <div className="flex items-center gap-2 px-2 pb-2 mb-1 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <span className="w-5 shrink-0" />
                <span className="w-5 shrink-0" />
                <span className="flex-1">Produto</span>
                <div className="flex flex-col items-center shrink-0" style={{ minWidth: 148 }}>
                  <span>TEM</span>
                </div>
                <div className="w-px shrink-0" />
                <div className="flex flex-col items-center shrink-0" style={{ minWidth: 148 }}>
                  <span>COMPRAR</span>
                </div>
              </div>
              {filteredItems.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum produto encontrado.</p>
              )}
              {filteredItems.map((item) => (
                <SortableItem
                  key={item.product_id}
                  item={item}
                  isReadOnly={isReadOnly}
                  search={search}
                  suggestions={suggestions}
                  onUpdate={updateLocalItem}
                  onSave={saveItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {countId && items.length > 0 && !isReadOnly && (
        <div className="flex gap-3 flex-wrap">
          {countStatus !== 'finalizada' && (
            <button
              onClick={handleSaveCount}
              disabled={saving}
              className="bg-blue-600 text-white rounded-lg px-6 py-2 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : countStatus === 'salva' ? '💾 Atualizar Contagem' : '💾 Salvar Contagem'}
            </button>
          )}
          {isOwnerOrManager && countStatus === 'salva' && (
            <button
              onClick={handleFinalizeCount}
              disabled={finalizing}
              className="bg-brand-red text-white rounded-lg px-6 py-2 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {finalizing ? 'Finalizando...' : '✅ Finalizar Contagem'}
            </button>
          )}
        </div>
      )}

      {countId && countStatus === 'finalizada' && isOwnerOrManager && (
        <button
          onClick={() => navigate(`/relatorio?countId=${countId}`)}
          className="bg-brand-red text-white rounded-lg px-6 py-2 font-medium hover:opacity-90"
        >
          Ver Relatório
        </button>
      )}
    </div>
  );
}
