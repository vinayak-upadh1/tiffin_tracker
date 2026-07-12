import axios from "axios";

// ---------------------------------------------------------------------------
// In-memory token store — no localStorage; XSS-safe.
// AuthContext writes here via setAccessToken(); the request interceptor reads it.
// ---------------------------------------------------------------------------
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  // withCredentials sends the HttpOnly refresh_token cookie on every request.
  // The backend ignores it on all endpoints except /auth/refresh and /auth/logout.
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Request interceptor — attach access token to every outgoing request
// ---------------------------------------------------------------------------
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor — silent token refresh with request queue
// ---------------------------------------------------------------------------

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function flushQueue(error: unknown, token: string | null): void {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!)
  );
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const is401 = error.response?.status === 401;
    // Never retry the refresh endpoint itself — would cause an infinite loop.
    const isRefreshCall = (original?.url as string | undefined)?.includes("/auth/refresh");

    if (is401 && !isRefreshCall && !original?._retry) {
      // If another refresh is already in-flight, queue this request and wait.
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post<{ access_token: string }>("/auth/refresh");
        const newToken = data.access_token;
        setAccessToken(newToken);
        flushQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        flushQueue(refreshError, null);
        setAccessToken(null);
        // Refresh failed → session is truly expired; send the user to login.
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
