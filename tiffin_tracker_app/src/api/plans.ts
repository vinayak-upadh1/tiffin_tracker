import api from "./client";

export type MealType = "lunch" | "dinner" | "both";

export interface Plan {
  id: number;
  operator_id: number;
  name: string;
  meal_type: MealType;
  price_per_month: number;
  deliveries_per_month: number;
  is_active: boolean;
  created_at: string;
}

export interface PlanPayload {
  name: string;
  meal_type: MealType;
  price_per_month: number;
  deliveries_per_month: number;
}

export const plansApi = {
  list: () => api.get<Plan[]>("/plans").then((r) => r.data),

  create: (data: PlanPayload) =>
    api.post<Plan>("/plans", data).then((r) => r.data),

  update: (id: number, data: Partial<PlanPayload & { is_active: boolean }>) =>
    api.put<Plan>(`/plans/${id}`, data).then((r) => r.data),

  delete: (id: number) => api.delete(`/plans/${id}`),
};
