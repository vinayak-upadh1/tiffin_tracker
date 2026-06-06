import api from "./client";

export interface DeliveryEntry {
  subscriber_id: number;
  subscriber_name: string;
  subscriber_phone: string;
  subscription_id: number;
  plan_id: number;
  plan_name: string;
  meal_type: "lunch" | "dinner";
  status: "delivered" | "skipped" | "paused" | null;
}

export interface BulkDeliveryItem {
  subscriber_id: number;
  subscription_id: number;
  meal_type: "lunch" | "dinner";
  status: "delivered" | "skipped";
  notes?: string;
}

export const deliveriesApi = {
  list: (date: string): Promise<DeliveryEntry[]> =>
    api.get("/deliveries", { params: { date } }).then((r) => r.data),
  bulkMark: (date: string, deliveries: BulkDeliveryItem[]) =>
    api.post("/deliveries/bulk", { date, deliveries }).then((r) => r.data),
};
