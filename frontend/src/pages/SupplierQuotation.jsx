import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function SupplierQuotation() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [prices, setPrices] = useState({}); // product_id -> { value, unavailable }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/cotacao/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        // Pré-popula preços existentes
        const initial = {};
        for (const p of d.products) {
          initial[p.product_id] = {
            value: p.current_price != null && p.current_price > 0 ? String(p.current_price).replace('.', ',') : '',
            unavailable: p.current_price === 0 && p.current_price !== null,
          };
        }
        setPrices(initial);
      })
      .catch(() => setError('Não foi possível carregar a cotação.'))
      .finally(() => setLoading(false));
  }, [token]);

  function handlePrice(productId, value) {
    // Aceita apenas números e vírgula/ponto
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setPrices((prev) => ({ ...prev, [productId]: { ...prev[productId], value: cleaned, unavailable: false } }));
  }

  function toggleUnavailable(productId) {
    setPrices((prev) => ({
      ...prev,
      [productId]: { value: '', unavailable: !prev[productId]?.unavailable },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const payload = data.products.map((p) => {
        const entry = prices[p.product_id] || {};
        const raw = entry.value?.replace(',', '.') || '0';
        return {
          product_id: p.product_id,
          unit_price: parseFloat(raw) || 0,
          unavailable: !!entry.unavailable,
        };
      });

      const r = await fetch(`${API}/cotacao/${token}/precos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: payload }),
      });
      const result = await r.json();
      if (result.error) throw new Error(result.error);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filled = data?.products.filter((p) => {
    const e = prices[p.product_id];
    return e?.unavailable || (e?.value && e.value !== '');
  }).length ?? 0;
  const total = data?.products.length ?? 0;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#888' }}>Carregando cotação...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔒</div>
          <p style={{ color: '#c0392b', fontWeight: '600', marginBottom: '8px' }}>Link inválido ou expirado</p>
          <p style={{ color: '#888', fontSize: '0.875rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '480px', margin: '0 auto', padding: '0 16px 80px' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#c0392b', margin: '0 -16px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ color: '#fff', fontWeight: '700', fontSize: '1rem' }}>Buonna Massa</div>
        <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '0.8rem', marginTop: '2px' }}>Planilha de Cotação</div>
      </div>

      {saved && (
        <div style={{ background: '#f0faf2', border: '1.5px solid #27703a', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', color: '#27703a', fontWeight: '600', fontSize: '0.875rem' }}>
          ✅ Cotação salva com sucesso! Obrigado, {data.supplier_name}.
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: '700', fontSize: '1rem', color: '#1a1916', marginBottom: '2px' }}>{data.supplier_name}</div>
        {data.expires_at && (
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            Link válido até {new Date(data.expires_at).toLocaleDateString('pt-BR')}
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ height: '6px', background: '#e2e0db', borderRadius: '99px', overflow: 'hidden', marginBottom: '4px' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#c0392b', borderRadius: '99px', transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: '0.75rem', color: '#888' }}>{filled} de {total} produtos preenchidos</div>
      </div>

      {/* Lista de produtos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.products.map((product) => {
          const entry = prices[product.product_id] || {};
          const isFilled = entry.unavailable || (entry.value && entry.value !== '');
          return (
            <div
              key={product.product_id}
              style={{
                border: `1.5px solid ${isFilled ? (entry.unavailable ? '#d4953a' : '#27703a') : '#e2e0db'}`,
                borderRadius: '10px',
                padding: '12px',
                background: isFilled ? (entry.unavailable ? '#fef9ec' : '#f0faf2') : '#fff',
              }}
            >
              <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1a1916', marginBottom: '2px' }}>{product.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '8px' }}>
                Unidade: {product.purchase_unit} · Qtd necessária: {product.total_qty} {product.purchase_unit}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: '0.875rem', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={entry.unavailable ? '' : (entry.value || '')}
                    disabled={entry.unavailable}
                    onChange={(e) => handlePrice(product.product_id, e.target.value)}
                    style={{
                      width: '100%',
                      border: '1.5px solid #e2e0db',
                      borderRadius: '7px',
                      padding: '9px 10px 9px 30px',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      background: entry.unavailable ? '#f5f5f3' : '#fff',
                      color: '#1a1916',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={() => toggleUnavailable(product.product_id)}
                  style={{
                    border: `1.5px solid ${entry.unavailable ? '#d4953a' : '#e2e0db'}`,
                    background: entry.unavailable ? '#fef9ec' : 'transparent',
                    color: entry.unavailable ? '#92600a' : '#888',
                    borderRadius: '7px',
                    padding: '8px 10px',
                    fontSize: '0.72rem',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontWeight: entry.unavailable ? '600' : '400',
                  }}
                >
                  {entry.unavailable ? '✓ Sem estoque' : 'Sem estoque'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão salvar fixo no fundo */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #e2e0db', maxWidth: '480px', margin: '0 auto' }}>
        <button
          onClick={handleSave}
          disabled={saving || filled === 0}
          style={{
            width: '100%',
            background: saving || filled === 0 ? '#e2e0db' : '#c0392b',
            color: saving || filled === 0 ? '#888' : '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '13px',
            fontSize: '0.9rem',
            fontWeight: '600',
            fontFamily: 'inherit',
            cursor: saving || filled === 0 ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Salvando...' : `💾 Salvar Cotação (${filled}/${total})`}
        </button>
      </div>
    </div>
  );
}
