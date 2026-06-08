import api from "./client";

export type BillingType = "prepaid" | "postpaid";

export interface Subscription {
  id: number;
  subscriber_id: number;
  plan_id: number;
  operator_id: number;
  start_date: string;
  end_date: string | null;
  status: string;
  billing_type: BillingType;
  delivery_time: string | null;
}

export interface SubscriptionPayload {
  subscriber_id: number;
  plan_id: number;
  billing_type?: BillingType;
  start_date?: string;
  delivery_time?: string | null;
}

export const subscriptionsApi = {
  list: (): Promise<Subscription[]> =>
    api.get("/subscriptions").then((r) => r.data),
  create: (data: SubscriptionPayload): Promise<Subscription> =>
    api.post("/subscriptions", data).then((r) => r.data),
  update: (id: number, plan_id: number): Promise<Subscription> =>
    api.patch(`/subscriptions/${id}`, { plan_id }).then((r) => r.data),
  cancel: (id: number): Promise<void> =>
    api.delete(`/subscriptions/${id}`).then(() => undefined),
};
