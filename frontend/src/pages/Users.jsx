import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const ROLE_LABELS = {
  dono: 'Dono',
  gerente: 'Gerente',
  contador: 'Contador',
  proprietario: 'Proprietário',
};

const ROLE_BADGE = {
  dono: 'bg-red-100 text-red-700',
  proprietario: 'bg-red-100 text-red-700',
  gerente: 'bg-orange-100 text-orange-700',
  contador: 'bg-blue-100 text-blue-700',
};

const EMPTY_FORM = { name: '', email: '', password: '', role: 'contador', unit_id: '' };

export default function Users() {
  const { token, user: currentUser } = useAuth();
  const isDono = ['dono', 'proprietario'].includes(currentUser?.role);
  const isGerente = currentUser?.role === 'gerente';

  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadData() {
    const [u, un] = await Promise.all([
      request('/users', { token }),
      request('/units', { token }),
    ]);
    setUsers(u);
    setUnits(un);
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, [token]);

  function openNew() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function openEdit(u) {
    setEditId(u.id);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, unit_id: u.unit_id ?? '' });
    setError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name,
        email: form.email,
        role: form.role,
        unit_id: form.unit_id !== '' ? Number(form.unit_id) : null,
      };
      if (form.password) body.password = form.password;

      if (editId) {
        const updated = await request(`/users/${editId}`, { method: 'PUT', body, token });
        setUsers(users.map(u => u.id === editId ? { ...u, ...updated } : u));
      } else {
        if (!form.password) { setError('Senha é obrigatória.'); setSaving(false); return; }
        body.password = form.password;
        const created = await request('/users', { method: 'POST', body, token });
        setUsers([...users, { ...created, unit_name: units.find(u => u.id === created.unit_id)?.name }]);
      }
      cancelForm();
    } catch (err) {
      setError(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u) {
    const updated = await request(`/users/${u.id}/active`, { method: 'PATCH', token });
    setUsers(users.map(x => x.id === u.id ? { ...x, active: updated.active } : x));
  }

  async function handleDelete(u) {
    if (!window.confirm(`Excluir o usuário "${u.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await request(`/users/${u.id}`, { method: 'DELETE', token });
      setUsers(users.filter(x => x.id !== u.id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-red">Gestão de Usuários</h1>
        <button onClick={openNew} className="bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          + Novo Usuário
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senha {editId && <span className="text-gray-400 font-normal">(deixe em branco para não alterar)</span>}
              </label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
            {!isGerente && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  {isDono && <option value="dono">Dono</option>}
                  <option value="gerente">Gerente</option>
                  <option value="contador">Contador</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.unit_id}
                onChange={e => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Ambas</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={cancelForm}
              className="border border-gray-300 px-5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">E-mail</th>
              <th className="px-4 py-3 text-left">Perfil</th>
              <th className="px-4 py-3 text-left">Unidade</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.unit_name || 'Ambas'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(u)} className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => handleToggleActive(u)} className="text-xs text-gray-500 hover:underline">
                      {u.active ? 'Desativar' : 'Ativar'}
                    </button>
                    {isDono && (
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={u.id === currentUser?.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
