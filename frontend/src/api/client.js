import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const client = axios.create({ baseURL, timeout: 120000 });

// Attach the JWT on every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("hc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize error messages coming back from FastAPI.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "Request failed";
    return Promise.reject(new Error(typeof detail === "string" ? detail : JSON.stringify(detail)));
  }
);

export default client;
