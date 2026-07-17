import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const DAYS = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const STATUS_BADGE = {
  enviado: 'bg-green-100 text-green-700',
  falhou: 'bg-red-100 text-red-700',
};

const TYPE_LABEL = {
  aviso_principal: 'Aviso Principal',
  lembrete: 'Lembrete',
  contagem_salva: 'Contagem Salva',
  aviso_principal_reenvio: 'Reenvio – Aviso',
  lembrete_reenvio: 'Reenvio – Lembrete',
  contagem_salva_reenvio: 'Reenvio – Contagem Salva',
};

export default function NotificationSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null);
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      request('/notifications/settings', { token }),
      request('/notifications/log', { token }),
    ])
      .then(([s, l]) => { setSettings(s); setLog(l); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleDay(day) {
    const days = settings.schedule_days || [];
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setSettings({ ...settings, schedule_days: next });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const updated = await request('/notifications/settings', { method: 'PUT', token, body: settings });
      setSettings(updated);
      setMsg('Configurações salvas com sucesso!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testNumber) { setError('Informe um número para teste.'); return; }
    setTesting(true);
    setMsg('');
    setError('');
    try {
      const result = await request('/notifications/settings/test', { method: 'POST', token, body: { number: testNumber } });
      setMsg(result.message);
      // Refresh log
      const newLog = await request('/notifications/log', { token });
      setLog(newLog);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-brand-red">Configurações de Notificações</h1>

      {msg && <p className="text-green-600 text-sm font-medium">{msg}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {settings && (
        <form onSubmit={handleSave} className="space-y-6">

          {/* BLOCO 1 — Agendamento */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4 text-lg">📅 Agendamento de Contagem</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Dias da semana para envio</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      (settings.schedule_days || []).includes(d.value)
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário do aviso principal</label>
                <input
                  type="time"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={settings.main_time || '18:00'}
                  onChange={e => setSettings({ ...settings, main_time: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário do lembrete (se não enviada)</label>
                <input
                  type="time"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={settings.reminder_time || '22:00'}
                  onChange={e => setSettings({ ...settings, reminder_time: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Texto do aviso principal</label>
              <textarea
                rows={2}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                value={settings.main_message || ''}
                onChange={e => setSettings({ ...settings, main_message: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Texto do lembrete</label>
              <textarea
                rows={2}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                value={settings.reminder_message || ''}
                onChange={e => setSettings({ ...settings, reminder_message: e.target.value })}
              />
            </div>
          </div>

          {/* BLOCO 2 — Evolution API */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4 text-lg">📱 Configuração Evolution API</h2>

            <p className="text-sm text-gray-500 mb-4">
              A Evolution API é o serviço que envia as mensagens pelo WhatsApp da pizzaria.
              Configure as credenciais abaixo após instalar e conectar o WhatsApp no painel da Evolution.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">URL da Evolution API</label>
                <input
                  type="url"
                  placeholder="https://sua-evolution-api.railway.app"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={settings.evolution_url || ''}
                  onChange={e => setSettings({ ...settings, evolution_url: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key (Global)</label>
                <input
                  type="password"
                  placeholder="sua-chave-secreta"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={settings.evolution_key || ''}
                  onChange={e => setSettings({ ...settings, evolution_key: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Instância</label>
                <input
                  type="text"
                  placeholder="buonna-massa"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={settings.evolution_instance || ''}
                  onChange={e => setSettings({ ...settings, evolution_instance: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número para teste (DDD+número)</label>
                <input
                  type="tel"
                  placeholder="19999999999"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={testNumber}
                  onChange={e => setTestNumber(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="border border-brand-red text-brand-red px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                {testing ? 'Testando...' : '🧪 Testar Conexão'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-brand-red text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </form>
      )}

      {/* BLOCO 3 — Histórico */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700 text-lg">📋 Histórico de Notificações</h2>
          <button
            onClick={async () => {
              const newLog = await request('/notifications/log', { token });
              setLog(newLog);
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            Atualizar
          </button>
        </div>

        {log.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma notificação enviada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Data/Hora</th>
                  <th className="px-3 py-2 text-left">Destinatário</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {log.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {new Date(l.sent_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{l.recipient_name}</div>
                      <div className="text-gray-400 text-xs">{l.recipient_whatsapp}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{TYPE_LABEL[l.message_type] || l.message_type}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[l.status] || 'bg-gray-100 text-gray-500'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">{l.error_detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
