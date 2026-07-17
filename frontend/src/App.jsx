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

        <Route element={<ProtectedRoute />}>
          <Route path="/contagem" element={<Counting />} />
        </Route>

        <Route element={<ProtectedRoute roles={['dono', 'gerente', 'proprietario']} />}>
          <Route path="/produtos" element={<Products />} />
          <Route path="/relatorio" element={<Report />} />
          <Route path="/cotacao" element={<Quotation />} />
          <Route path="/usuarios" element={<Users />} />
          <Route path="/fornecedores" element={<Suppliers />} />
        </Route>

        <Route element={<ProtectedRoute roles={['dono', 'proprietario']} />}>
          <Route path="/notificacoes" element={<NotificationSettings />} />
        </Route>

        <Route path="/" element={<Navigate to="/contagem" replace />} />
        <Route path="*" element={<Navigate to="/contagem" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
