import { createContext, useContext, useState, useEffect } from 'react';
import { getProfile } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    getProfile()
      .then(r => setUser(r.data))
      .catch(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const signIn = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isAdmin     = user?.role === 'admin';
  const isInspector = user?.role === 'inspector';
  const can = (roles) => roles.includes(user?.role);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isAdmin, isInspector, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
