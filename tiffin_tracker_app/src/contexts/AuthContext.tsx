import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { authApi } from "../api/auth";
import { setAccessToken as setClientToken } from "../api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  /** True while the app is attempting a silent refresh on initial load. */
  isInitializing: boolean;
  login: (accessToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  // Guard against double-invocation in React StrictMode
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    // On every page load, attempt a silent refresh using the HttpOnly cookie.
    // If the cookie is valid the user stays logged in without seeing a login prompt.
    authApi
      .refresh()
      .then(({ access_token }) => {
        setClientToken(access_token);
        setIsAuthenticated(true);
      })
      .catch(() => {
        // Cookie missing or expired — user must log in.
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsInitializing(false);
      });
  }, []);

  const login = (accessToken: string) => {
    setClientToken(accessToken);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      // Always clear local state even if the network call fails
      setClientToken(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isInitializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
  return ctx;
}
