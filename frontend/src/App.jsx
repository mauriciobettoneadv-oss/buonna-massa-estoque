import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Counting from './pages/Counting';
import Products from './pages/Products';
import Report from './pages/Report';
import Quotation from './pages/Quotation';
import Users from './pages/Users';
import Suppliers from './pages/Suppliers';
import NotificationSettings from './pages/NotificationSettings';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Todos os autenticados */}
        <Route element={<ProtectedRoute />}>
          <Route path="/contagem" element={<Counting />} />
        </Route>

        {/* Dono/proprietario/gerente: produtos */}
        <Route element={<ProtectedRoute roles={['dono', 'proprietario', 'gerente']} />}>
          <Route path="/produtos" element={<Products />} />
        </Route>

        {/* Somente dono/proprietario */}
        <Route element={<ProtectedRoute roles={['dono', 'proprietario']} />}>
          <Route path="/relatorio" element={<Report />} />
          <Route path="/cotacao" element={<Quotation />} />
          <Route path="/usuarios" element={<Users />} />
          <Route path="/fornecedores" element={<Suppliers />} />
          <Route path="/notificacoes" element={<NotificationSettings />} />
        </Route>

        <Route path="/" element={<Navigate to="/contagem" replace />} />
        <Route path="*" element={<Navigate to="/contagem" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
