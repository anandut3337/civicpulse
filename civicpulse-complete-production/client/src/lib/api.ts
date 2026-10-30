import axios from 'axios';

export const TOKEN_KEY = 'civicpulse_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const baseURL = `${(import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;

export const api = axios.create({ baseURL });

// Attach the JWT (if we have one) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 means the token is missing/expired: drop it so the UI falls back to logged-out state.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) clearToken();
    return Promise.reject(error);
  },
);

/** Pulls a readable message out of our backend's `{ success:false, error:{message} } ` envelope. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error?.message;
    if (typeof message === 'string') return message;
    if (err.message === 'Network Error') return 'Could not reach the server. Please check your connection.';
  }
  return fallback;
}
