import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { plansApi, type Plan, type PlanPayload } from "../api/plans";

const schema = z.object({
  name: z.string().min(1, "Plan name is required"),
  meal_type: z.enum(["lunch", "dinner", "both"]),
  price_per_month: z.number().positive("Price must be greater than 0"),
  deliveries_per_month: z.number().int().min(1).max(31, "Max 31 deliveries per month"),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  onSuccess: () => void;
}

export default function PlanModal({ open, onClose, plan, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset(
        plan
          ? {
              name: plan.name,
              meal_type: plan.meal_type,
              price_per_month: plan.price_per_month,
              deliveries_per_month: plan.deliveries_per_month,
            }
          : { name: "", meal_type: "lunch" as const, price_per_month: 0, deliveries_per_month: 26 }
      );
    }
  }, [open, plan, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: PlanPayload = {
        name: data.name,
        meal_type: data.meal_type,
        price_per_month: data.price_per_month,
        deliveries_per_month: data.deliveries_per_month,
      };
      return plan ? plansApi.update(plan.id, payload) : plansApi.create(payload);
    },
    onSuccess,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{plan ? "Edit Plan" : "Add Plan"}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-6 space-y-4">
          {mutation.isError && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              Something went wrong. Please try again.
            </div>
          )}

          <Field label="Plan Name *" error={errors.name?.message}>
            <input
              {...register("name")}
              className={inputClass(!!errors.name)}
              placeholder="Lunch Only, Lunch + Dinner..."
            />
          </Field>

          <Field label="Meal Type *" error={errors.meal_type?.message}>
            <select {...register("meal_type")} className={inputClass(!!errors.meal_type)}>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="both">Lunch + Dinner</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Price / Month (₹) *" error={errors.price_per_month?.message}>
              <input
                {...register("price_per_month", { valueAsNumber: true })}
                type="number"
                step="0.01"
                className={inputClass(!!errors.price_per_month)}
                placeholder="2200"
                inputMode="decimal"
              />
            </Field>

            <Field label="Deliveries / Month *" error={errors.deliveries_per_month?.message}>
              <input
                {...register("deliveries_per_month", { valueAsNumber: true })}
                type="number"
                className={inputClass(!!errors.deliveries_per_month)}
                placeholder="26"
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? "Saving..." : plan ? "Save Changes" : "Add Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors ${
    hasError ? "border-red-300 bg-red-50" : "border-gray-200"
  }`;
}
