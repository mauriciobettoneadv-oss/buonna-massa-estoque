import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoErr, setLogoErr] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const isOwner = ['dono', 'proprietario'].includes(user?.role);
  const isGerente = user?.role === 'gerente';

  return (
    <nav className="bg-[#812f28] text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {logoErr
            ? <span className="font-bold text-white" style={{ fontFamily: 'Besley, Georgia, serif' }}>Buonna Massa</span>
            : <img src="/logo.png" alt="Buonna Massa" className="h-10 object-contain" onError={() => setLogoErr(true)} />
          }
        </div>
        <Link to="/contagem" className="text-sm hover:underline">Contagem</Link>
        {(isOwner || isGerente) && (
          <>
            <Link to="/produtos" className="text-sm hover:underline">Produtos</Link>
            <Link to="/historico" className="text-sm hover:underline">Histórico</Link>
            <Link to="/conferencia-entrega" className="text-sm hover:underline">Conf. Entrega</Link>
          </>
        )}
        {isOwner && (
          <>
            <Link to="/relatorio" className="text-sm hover:underline">Relatório</Link>
            <Link to="/cotacao" className="text-sm hover:underline">Cotação</Link>
            <Link to="/fornecedores" className="text-sm hover:underline">Fornecedores</Link>
            <Link to="/usuarios" className="text-sm hover:underline">Usuários</Link>
            <Link to="/notificacoes" className="text-sm hover:underline">🔔 Notificações</Link>
            <Link to="/conferencia-pedido" className="text-sm hover:underline">Conferência</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span>{user?.name}</span>
        <button onClick={handleLogout} className="bg-white/10 px-3 py-1 rounded hover:bg-white/20">
          Sair
        </button>
      </div>
    </nav>
  );
}
