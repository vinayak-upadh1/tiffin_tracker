import api from "./client";

export interface Payment {
  id: number;
  operator_id: number;
  subscriber_id: number;
  subscription_id: number | null;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
  payment_method: string | null;
  status: "pending" | "partial" | "paid";
  paid_at: string | null;
  notes: string | null;
  subscriber_name: string;
  subscriber_phone: string;
  billing_type: "prepaid" | "postpaid";
  meal_breakdown: Record<string, number> | null;
}

export interface MarkPaidPayload {
  amount_paid: number;
  payment_method: "gpay" | "cash" | "upi" | "razorpay" | "other";
  notes?: string;
}

export const paymentsApi = {
  list: (month?: string): Promise<Payment[]> =>
    api.get("/payments", { params: month ? { month } : {} }).then((r) => r.data),
  markPaid: (id: number, data: MarkPaidPayload): Promise<Payment> =>
    api.patch(`/payments/${id}`, data).then((r) => r.data),
  logReminder: (id: number): Promise<{ message: string }> =>
    api.post(`/payments/${id}/remind`).then((r) => r.data),
};
