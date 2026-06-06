import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, UtensilsCrossed } from "lucide-react";
import { plansApi, type Plan } from "../api/plans";
import PlanModal from "../components/PlanModal";

const MEAL_LABEL: Record<string, string> = {
  lunch: "Lunch",
  dinner: "Dinner",
  both: "Lunch + Dinner",
};

const MEAL_COLOR: Record<string, string> = {
  lunch: "bg-orange-50 text-orange-700 border-orange-200",
  dinner: "bg-blue-50 text-blue-700 border-blue-200",
  both: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function PlansPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: plansApi.list,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      plansApi.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plans"] }),
  });

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setModalOpen(true);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    setModalOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Plans</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your meal subscription plans</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Plan</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <UtensilsCrossed size={20} className="text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-sm">No plans yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first meal plan to get started</p>
          <button
            onClick={openAdd}
            className="mt-3 text-indigo-600 text-sm font-medium hover:underline"
          >
            Add your first plan →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-xl border border-gray-100 p-5 transition-opacity ${
                !plan.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 mr-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{plan.name}</h3>
                  <span
                    className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium border ${
                      MEAL_COLOR[plan.meal_type] ?? "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {MEAL_LABEL[plan.meal_type] ?? plan.meal_type}
                  </span>
                </div>
                <button
                  onClick={() => openEdit(plan)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 flex-shrink-0"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
              </div>

              <div className="flex items-end justify-between mt-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{Number(plan.price_per_month).toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {plan.deliveries_per_month} deliveries / month
                  </p>
                </div>
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: plan.id, is_active: !plan.is_active })
                  }
                  disabled={toggleMutation.isPending}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
                    plan.is_active
                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {plan.is_active ? "Active" : "Inactive"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        plan={editing}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
