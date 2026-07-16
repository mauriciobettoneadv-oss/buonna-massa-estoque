import { createContext, useContext, useState } from 'react';
import request from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('bm_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('bm_user');
    return stored ? JSON.parse(stored) : null;
  });

  async function login(email, password) {
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('bm_token', data.token);
    localStorage.setItem('bm_user', JSON.stringify(data.user));
    return data.user;
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem('bm_token');
    localStorage.removeItem('bm_user');
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
