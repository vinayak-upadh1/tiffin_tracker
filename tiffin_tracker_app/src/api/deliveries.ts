import api from "./client";

export type MealType = "breakfast" | "lunch" | "snacks" | "dinner";
export type DeliveryStatus = "pending" | "delivered" | "skipped" | "paused";

export interface DeliveryEntry {
  subscriber_id: number;
  subscriber_name: string;
  subscriber_phone: string;
  subscription_id: number;
  plan_id: number;
  plan_name: string;
  meal_type: MealType;
  delivery_time: string | null;
  status: DeliveryStatus | null;
}

export interface BulkDeliveryItem {
  subscriber_id: number;
  subscription_id: number;
  meal_type: MealType;
  status: DeliveryStatus;
  notes?: string;
}

export const deliveriesApi = {
  list: (date: string): Promise<DeliveryEntry[]> =>
    api.get("/deliveries", { params: { date } }).then((r) => r.data),
  bulkMark: (date: string, deliveries: BulkDeliveryItem[]) =>
    api.post("/deliveries/bulk", { date, deliveries }).then((r) => r.data),
};
