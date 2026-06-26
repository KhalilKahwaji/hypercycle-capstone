import { createContext, useContext, useEffect, useState } from "react";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On boot, if we have a token, fetch the current user.
  useEffect(() => {
    const token = localStorage.getItem("hc_token");
    if (!token) {
      setLoading(false);
      return;
    }
    client
      .get("/users/me")
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem("hc_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = (data) => {
    localStorage.setItem("hc_token", data.access_token);
    setUser(data.user);
  };

  const login = async (username_or_email, password) => {
    const res = await client.post("/users/login", { username_or_email, password });
    persist(res.data);
    return res.data;
  };

  const register = async (payload) => {
    const res = await client.post("/users/register", payload);
    persist(res.data);
    return res.data;
  };

  const loginWithToken = async (token) => {
    localStorage.setItem("hc_token", token);
    const res = await client.get("/users/me");
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("hc_token");
    setUser(null);
  };

  const refreshUser = async () => {
    const res = await client.get("/users/me");
    setUser(res.data.user);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithToken, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
