const API_BASE_URL = process.env.FRONTEND_API_BASE_URL || "http://localhost:5000";

const normalizeBase = (value) => String(value || "").replace(/\/$/, "");

const TOKEN_STORAGE_KEY = "auth_token";

export const tokenStorage = {
  get() {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  },
  set(token) {
    if (typeof window === "undefined") return;
    const normalized = String(token || "").trim();
    if (!normalized) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
  },
  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  },
};

export const createApiClient = (baseUrl = API_BASE_URL) => {
  const resolvedBase = normalizeBase(baseUrl);

  return async (path, options = {}) => {
    const token = tokenStorage.get();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${resolvedBase}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.message || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };
};

export const apiClient = createApiClient();
