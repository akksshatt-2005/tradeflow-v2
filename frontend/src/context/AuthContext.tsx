import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { setAccessToken, setStoredRefreshToken, getStoredRefreshToken, prewarmServer } from '../api/client';

export interface User {
  id: string;
  username: string;
}

export interface Company {
  id: string;
  name: string;
  gstin?: string;
  drugLicenseNo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  role: string;
  createdAt?: string;
}

export interface CreateCompanyPayload {
  name: string;
  gstin?: string;
  drugLicenseNo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface AuthContextType {
  user: User | null;
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  selectCompany: (company: Company) => void;
  createCompany: (payload: string | CreateCompanyPayload) => Promise<Company>;
  updateCompany: (companyId: string, payload: Partial<CreateCompanyPayload>) => Promise<Company>;
  deleteCompany: (companyId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCompanies: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getCompanyStorageKey(userId: string): string {
  return `tradeflow_${userId}_active_company`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  // Pre-warm server on load (Rule F1)
  useEffect(() => {
    prewarmServer();
  }, []);

  // Check existing session on mount
  useEffect(() => {
    const initSession = async () => {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        setLoading(false);
        return;
      }

      try {
        const refreshData = await api.post('/auth/refresh', { refreshToken });
        setAccessToken(refreshData.accessToken);
        setStoredRefreshToken(refreshData.refreshToken);
        setUser(refreshData.user);

        // Fetch fresh companies
        const compData = await api.get('/companies/mine');
        const userComps: Company[] = compData.companies || [];
        setCompanies(userComps);

        // Rule C4: Validate cached company against fresh list
        const cachedRaw = localStorage.getItem(getCompanyStorageKey(refreshData.user.id));
        if (cachedRaw) {
          try {
            const cachedComp = JSON.parse(cachedRaw);
            const isValid = userComps.some(c => c.id === cachedComp.id);
            if (isValid) {
              const freshComp = userComps.find(c => c.id === cachedComp.id)!;
              setActiveCompany(freshComp);
            } else {
              localStorage.removeItem(getCompanyStorageKey(refreshData.user.id));
              if (userComps.length === 1) setActiveCompany(userComps[0]);
            }
          } catch {
            localStorage.removeItem(getCompanyStorageKey(refreshData.user.id));
            if (userComps.length === 1) setActiveCompany(userComps[0]);
          }
        } else if (userComps.length === 1) {
          setActiveCompany(userComps[0]);
          localStorage.setItem(getCompanyStorageKey(refreshData.user.id), JSON.stringify(userComps[0]));
        }
      } catch (err) {
        console.warn('Session init failed:', err);
        setAccessToken(null);
        setStoredRefreshToken(null);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // Listen to unauthorized event
    const handleUnauthorized = () => {
      setUser(null);
      setCompanies([]);
      setActiveCompany(null);
    };

    window.addEventListener('tradeflow:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('tradeflow:unauthorized', handleUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    const data = await api.post('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    setStoredRefreshToken(data.refreshToken);
    setUser(data.user);

    const userComps: Company[] = data.companies || [];
    setCompanies(userComps);

    // Rule C4: Cache safety on login
    const cachedRaw = localStorage.getItem(getCompanyStorageKey(data.user.id));
    if (cachedRaw) {
      try {
        const cachedComp = JSON.parse(cachedRaw);
        const isValid = userComps.some(c => c.id === cachedComp.id);
        if (isValid) {
          const fresh = userComps.find(c => c.id === cachedComp.id)!;
          setActiveCompany(fresh);
        } else {
          localStorage.removeItem(getCompanyStorageKey(data.user.id));
          if (userComps.length === 1) {
            setActiveCompany(userComps[0]);
            localStorage.setItem(getCompanyStorageKey(data.user.id), JSON.stringify(userComps[0]));
          } else {
            setActiveCompany(null);
          }
        }
      } catch {
        localStorage.removeItem(getCompanyStorageKey(data.user.id));
        setActiveCompany(userComps.length === 1 ? userComps[0] : null);
      }
    } else if (userComps.length === 1) {
      setActiveCompany(userComps[0]);
      localStorage.setItem(getCompanyStorageKey(data.user.id), JSON.stringify(userComps[0]));
    } else {
      setActiveCompany(null);
    }
  };

  const signup = async (username: string, password: string) => {
    const data = await api.post('/auth/signup', { username, password });
    setAccessToken(data.accessToken);
    setStoredRefreshToken(data.refreshToken);
    setUser(data.user);
    setCompanies([]);
    setActiveCompany(null);
  };

  const selectCompany = (company: Company) => {
    setActiveCompany(company);
    if (user) {
      localStorage.setItem(getCompanyStorageKey(user.id), JSON.stringify(company));
    }
  };

  const createCompany = async (payload: string | CreateCompanyPayload): Promise<Company> => {
    const body = typeof payload === 'string' ? { name: payload } : payload;
    const data = await api.post('/companies', body);
    const newComp: Company = data.company;
    const updated = [...companies, newComp];
    setCompanies(updated);
    selectCompany(newComp);
    return newComp;
  };

  const updateCompany = async (companyId: string, payload: Partial<CreateCompanyPayload>): Promise<Company> => {
    const data = await api.put(`/companies/${companyId}`, payload);
    const updatedComp: Company = data.company;
    const updatedList = companies.map(c => c.id === companyId ? { ...c, ...updatedComp } : c);
    setCompanies(updatedList);
    if (activeCompany?.id === companyId) {
      selectCompany(updatedComp);
    }
    return updatedComp;
  };

  const deleteCompany = async (companyId: string): Promise<void> => {
    await api.delete(`/companies/${companyId}`);
    const updatedList = companies.filter(c => c.id !== companyId);
    setCompanies(updatedList);
    if (activeCompany?.id === companyId) {
      if (updatedList.length > 0) {
        selectCompany(updatedList[0]);
      } else {
        setActiveCompany(null);
        if (user) {
          localStorage.removeItem(getCompanyStorageKey(user.id));
        }
      }
    }
  };

  const refreshCompanies = async () => {
    if (!user) return;
    const data = await api.get('/companies/mine');
    const userComps: Company[] = data.companies || [];
    setCompanies(userComps);
  };

  const logout = async () => {
    const refreshToken = getStoredRefreshToken();
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (_) {}

    if (user) {
      localStorage.removeItem(getCompanyStorageKey(user.id));
    }
    setAccessToken(null);
    setStoredRefreshToken(null);
    setUser(null);
    setCompanies([]);
    setActiveCompany(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        activeCompany,
        loading,
        login,
        signup,
        selectCompany,
        createCompany,
        updateCompany,
        deleteCompany,
        logout,
        refreshCompanies
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
