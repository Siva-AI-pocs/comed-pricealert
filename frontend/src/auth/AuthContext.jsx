import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { authApi } from "../api/auth.js";
import { setUnauthorizedHandler } from "../api/client.js";

const AuthContext = createContext(null);

// status: "loading" | "authenticated" | "anonymous"
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  // Bootstrap session on mount, and drop to anonymous on any 401 elsewhere.
  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("anonymous");
    });
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const me = await authApi.login(email, password);
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const register = useCallback(async (email, password) => {
    const me = await authApi.register(email, password);
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: clear local session regardless of the network result.
    try {
      await authApi.logout();
    } catch {
      // ignore — logging out locally is what matters
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, status, login, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
