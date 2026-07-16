import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';

export default function ProtectedRoute({ roles }) {
  const { token, user } = useAuth();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/contagem" replace />;

  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}
