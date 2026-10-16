import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

export default function CountHistory() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    request('/stock-counts/finalized', { token })
      .then(setCounts)
      .catch((err) => setError(err.message));
  }, [token]);

  if (!counts) return <p className="text-gray-500 p-4">Carregando histórico...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold text-brand-red mb-4">Histórico de Contagens</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {counts.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhuma contagem finalizada ainda.</p>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y">
          {counts.map((c) => (
            <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{c.unit_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  {c.finalized_at && (
                    <> · Finalizada em {new Date(c.finalized_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                  )}
                </p>
                {c.items_to_buy > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5">{c.items_to_buy} itens para comprar</p>
                )}
              </div>
              <button
                onClick={() => navigate(`/relatorio?countId=${c.id}`)}
                className="text-sm text-brand-red hover:underline font-medium"
              >
                Ver relatório →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
