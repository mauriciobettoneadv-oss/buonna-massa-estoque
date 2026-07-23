import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const isOwner = ['dono', 'proprietario'].includes(user?.role);
  const isGerente = user?.role === 'gerente';

  return (
    <nav className="bg-brand-red text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-bold">Buonna Massa</span>
        <Link to="/contagem" className="text-sm hover:underline">Contagem</Link>
        {(isOwner || isGerente) && (
          <Link to="/produtos" className="text-sm hover:underline">Produtos</Link>
        )}
        {isOwner && (
          <>
            <Link to="/relatorio" className="text-sm hover:underline">Relatório</Link>
            <Link to="/cotacao" className="text-sm hover:underline">Cotação</Link>
            <Link to="/fornecedores" className="text-sm hover:underline">Fornecedores</Link>
            <Link to="/usuarios" className="text-sm hover:underline">Usuários</Link>
            <Link to="/notificacoes" className="text-sm hover:underline">🔔 Notificações</Link>
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
