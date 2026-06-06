import api from "./client";

export interface Subscription {
  id: number;
  subscriber_id: number;
  plan_id: number;
  operator_id: number;
  start_date: string;
  end_date: string | null;
  status: string;
}

export interface SubscriptionPayload {
  subscriber_id: number;
  plan_id: number;
  start_date?: string;
}

export const subscriptionsApi = {
  list: (): Promise<Subscription[]> =>
    api.get("/subscriptions").then((r) => r.data),
  create: (data: SubscriptionPayload): Promise<Subscription> =>
    api.post("/subscriptions", data).then((r) => r.data),
};
