import api from "./client";

export type SubscriberStatus = "active" | "paused" | "cancelled";

export interface Subscriber {
  id: number;
  operator_id: number;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  status: SubscriberStatus;
  created_at: string;
  updated_at: string;
}

export interface SubscriberPayload {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  status?: SubscriberStatus;
}

export const subscribersApi = {
  list: (status?: string) =>
    api
      .get<Subscriber[]>("/subscribers", { params: status ? { status } : {} })
      .then((r) => r.data),

  create: (data: SubscriberPayload) =>
    api.post<Subscriber>("/subscribers", data).then((r) => r.data),

  get: (id: number) =>
    api.get<Subscriber>(`/subscribers/${id}`).then((r) => r.data),

  update: (id: number, data: Partial<SubscriberPayload>) =>
    api.put<Subscriber>(`/subscribers/${id}`, data).then((r) => r.data),

  delete: (id: number) => api.delete(`/subscribers/${id}`),
};
