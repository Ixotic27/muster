import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../utils/api';
const AuthContext = createContext(null);
export function AuthProvider({
  children
}) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await api('/auth/me');
      setUser(data.user);
    } catch (e) {
      if (e.status === 403 && e.data?.requiresPasswordChange && e.data?.user) setUser({
        ...e.data.user,
        mustChangePassword: true
      });else {
        setUser(null);
        if (e.status !== 401) setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const authenticate = async (mode, body) => {
    const data = await api(`/auth/${mode}`, {
      method: 'POST',
      body
    });
    const account = data.requiresPasswordChange ? {
      ...data.user,
      mustChangePassword: true
    } : data.user;
    setUser(account);
    setError('');
    return account;
  };
  const logout = async () => {
    await api('/auth/logout', {
      method: 'POST'
    });
    setUser(null);
  };
  return <AuthContext.Provider value={{
    user,
    setUser,
    loading,
    error,
    refresh,
    authenticate,
    logout
  }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
