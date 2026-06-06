import api from "./client";

export interface DashboardSummary {
  active_count: number;
  delivered_today: number;
  unpaid_this_month: number;
  unpaid_total_amount: number;
}

export const dashboardApi = {
  summary: (): Promise<DashboardSummary> =>
    api.get("/dashboard/summary").then((r) => r.data),
};
