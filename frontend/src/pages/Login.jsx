import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import request from '../api/client';

const EyeIcon = ({ open }) =>
  open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoErr, setLogoErr] = useState(false);

  // Forgot password state: 'login' | 'forgot' | 'code' | 'reset'
  const [step, setStep] = useState('login');
  const [fpEmail, setFpEmail] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpPassword, setFpPassword] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState('');
  const [fpSuccess, setFpSuccess] = useState('');

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

  async function handleForgot(e) {
    e.preventDefault();
    setFpError('');
    setFpLoading(true);
    try {
      await request('/auth/forgot-password', { method: 'POST', body: { email: fpEmail } });
      setStep('code');
      setFpSuccess('Código enviado! Verifique seu e-mail.');
    } catch (err) {
      setFpError(err.message);
    } finally {
      setFpLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setFpError('');
    setFpLoading(true);
    try {
      await request('/auth/reset-password', {
        method: 'POST',
        body: { email: fpEmail, code: fpCode, password: fpPassword },
      });
      setStep('login');
      setError('');
      setFpSuccess('');
      alert('Senha redefinida com sucesso! Faça login com a nova senha.');
    } catch (err) {
      setFpError(err.message);
    } finally {
      setFpLoading(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#812f28]';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {logoErr ? (
            <>
              <p className="text-3xl font-bold text-[#231f20]" style={{ fontFamily: 'Besley, Georgia, serif' }}>Buonna Massa</p>
              <p className="text-[#812f28] text-sm tracking-widest uppercase mt-1">Pizzaria • Desde 1996</p>
            </>
          ) : (
            <img
              src="/logo.png"
              alt="Pizzaria Buonna Massa"
              className="h-44 object-contain"
              onError={() => setLogoErr(true)}
            />
          )}
          <span
            className="mt-2 px-4 py-0.5 rounded-full text-white text-xs font-semibold tracking-widest uppercase"
            style={{ background: '#812f28', letterSpacing: '0.15em' }}
          >
            Estoque
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">

          {/* LOGIN */}
          {step === 'login' && (
            <>
              <p className="text-center text-xs text-gray-400 mb-6 tracking-widest uppercase">Acesso ao Sistema</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls + ' pr-10'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      <EyeIcon open={showPass} />
                    </button>
                  </div>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#812f28' }}
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setStep('forgot'); setFpEmail(email); setFpError(''); setFpSuccess(''); }}
                    className="text-sm text-[#812f28] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </form>
            </>
          )}

          {/* FORGOT — insere e-mail */}
          {step === 'forgot' && (
            <>
              <button onClick={() => setStep('login')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
                ← Voltar
              </button>
              <p className="text-sm font-semibold text-gray-700 mb-1">Redefinir senha</p>
              <p className="text-xs text-gray-400 mb-4">Informe seu e-mail para receber um código de verificação.</p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" required value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} className={inputCls} />
                </div>
                {fpError && <p className="text-sm text-red-600">{fpError}</p>}
                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full text-white rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#812f28' }}
                >
                  {fpLoading ? 'Enviando...' : 'Enviar código'}
                </button>
              </form>
            </>
          )}

          {/* CODE + NEW PASSWORD */}
          {step === 'code' && (
            <>
              <button onClick={() => setStep('forgot')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
                ← Voltar
              </button>
              {fpSuccess && <p className="text-sm text-green-600 mb-3">{fpSuccess}</p>}
              <p className="text-sm font-semibold text-gray-700 mb-1">Insira o código</p>
              <p className="text-xs text-gray-400 mb-4">Enviamos um código de 6 dígitos para <strong>{fpEmail}</strong>.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={fpCode}
                    onChange={(e) => setFpCode(e.target.value.replace(/\D/g, ''))}
                    className={inputCls + ' tracking-[0.5em] text-center text-xl font-bold'}
                    placeholder="000000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={fpPassword}
                    onChange={(e) => setFpPassword(e.target.value)}
                    className={inputCls}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                {fpError && <p className="text-sm text-red-600">{fpError}</p>}
                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full text-white rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#812f28' }}
                >
                  {fpLoading ? 'Salvando...' : 'Redefinir senha'}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setFpSuccess(''); handleForgot({ preventDefault: () => {} }); }}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Reenviar código
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-gray-300 text-xs mt-6">Pizzaria Buonna Massa © 1996</p>
      </div>
    </div>
  );
}
