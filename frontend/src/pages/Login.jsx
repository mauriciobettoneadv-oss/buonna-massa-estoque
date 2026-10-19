import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoErr, setLogoErr] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'proprietario' ? '/contagem' : '/contagem');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#812f28' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          {logoErr ? (
            <div className="text-center">
              <p className="text-white text-4xl font-bold" style={{ fontFamily: 'Besley, Georgia, serif' }}>Buonna Massa</p>
              <p className="text-white/70 text-sm tracking-widest uppercase mt-1">Pizzaria • Desde 1996</p>
            </div>
          ) : (
            <img
              src="/logo.png"
              alt="Pizzaria Buonna Massa"
              className="h-48 object-contain drop-shadow-lg"
              onError={() => setLogoErr(true)}
            />
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <p className="text-center text-sm text-gray-400 mb-6 tracking-wide uppercase">Acesso ao Sistema</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-red text-white rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50 mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">Pizzaria Buonna Massa © 1996</p>
      </div>
    </div>
  );
}
