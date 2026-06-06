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

export const authApi = {
  googleAuth: (credential: string) =>
    api
      .post<{ access_token: string; token_type: string }>("/auth/google", { credential })
      .then((r) => r.data),

  getMe: () => api.get<Operator>("/auth/me").then((r) => r.data),

  updateProfile: (data: OperatorUpdate) =>
    api.patch<Operator>("/auth/me", data).then((r) => r.data),
};
