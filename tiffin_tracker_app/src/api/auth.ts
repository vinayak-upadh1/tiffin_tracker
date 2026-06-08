import api from "./client";

export interface Operator {
  id: number;
  name: string;
  email: string;
  phone?: string;
  business_name?: string;
  upi_id?: string;
  profile_picture?: string;
  plan: "trial" | "basic";
  plan_expires_at?: string;
  created_at: string;
}

export interface OperatorUpdate {
  name?: string;
  phone?: string;
  business_name?: string;
  upi_id?: string;
}

export interface Session {
  id: number;
  device_label: string | null;
  ip_address: string | null;
  last_used_at: string;
  created_at: string;
}

export const authApi = {
  googleAuth: (credential: string) =>
    api
      .post<{ access_token: string; token_type: string }>("/auth/google", { credential })
      .then((r) => r.data),

  /** Exchange the HttpOnly refresh_token cookie for a fresh access token. */
  refresh: () =>
    api
      .post<{ access_token: string; token_type: string }>("/auth/refresh")
      .then((r) => r.data),

  /** Revoke the current device session and clear the refresh cookie. */
  logout: () => api.post("/auth/logout").then((r) => r.data),

  /** Revoke all sessions across every device. */
  logoutAll: () => api.post("/auth/logout/all").then((r) => r.data),

  getMe: () => api.get<Operator>("/auth/me").then((r) => r.data),

  updateProfile: (data: OperatorUpdate) =>
    api.patch<Operator>("/auth/me", data).then((r) => r.data),

  /** List active sessions for the current operator. */
  getSessions: () => api.get<Session[]>("/auth/sessions").then((r) => r.data),

  /** Revoke a specific session by ID (remote logout for one device). */
  deleteSession: (sessionId: number) =>
    api.delete(`/auth/sessions/${sessionId}`).then((r) => r.data),
};
