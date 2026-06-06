import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { subscribersApi, type Subscriber, type SubscriberPayload } from "../api/subscribers";
import { subscriptionsApi } from "../api/subscriptions";
import { plansApi } from "../api/plans";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z
    .string()
    .min(10, "Enter a valid 10-digit phone number")
    .regex(/^\d[\d\s\-+()]{9,}$/, "Enter a valid phone number"),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "paused", "cancelled"]),
  plan_id: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  subscriber: Subscriber | null;
  onSuccess: () => void;
}

export default function SubscriberDrawer({ open, onClose, subscriber, onSuccess }: Props) {
  const isEditing = !!subscriber;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: plansApi.list,
    enabled: open && !isEditing,
  });

  useEffect(() => {
    if (open) {
      reset(
        subscriber
          ? {
              name: subscriber.name,
              phone: subscriber.phone,
              address: subscriber.address ?? "",
              notes: subscriber.notes ?? "",
              status: subscriber.status,
            }
          : { name: "", phone: "", address: "", notes: "", status: "active" as const, plan_id: "" }
      );
    }
  }, [open, subscriber, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: SubscriberPayload = {
        name: data.name,
        phone: data.phone,
        address: data.address || undefined,
        notes: data.notes || undefined,
        status: data.status,
      };
      if (isEditing) {
        return subscribersApi.update(subscriber.id, payload);
      }
      const newSubscriber = await subscribersApi.create(payload);
      if (data.plan_id) {
        await subscriptionsApi.create({
          subscriber_id: newSubscriber.id,
          plan_id: Number(data.plan_id),
        });
      }
      return newSubscriber;
    },
    onSuccess,
  });

  if (!open) return null;

  const activePlans = plans.filter((p) => p.is_active);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {isEditing ? "Edit Subscriber" : "Add Subscriber"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="flex flex-col flex-1 p-6 gap-4 overflow-y-auto"
        >
          {mutation.isError && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail ?? "Something went wrong. Please try again."}
            </div>
          )}

          <Field label="Full Name *" error={errors.name?.message}>
            <input
              {...register("name")}
              className={inputClass(!!errors.name)}
              placeholder="Priya Sharma"
            />
          </Field>

          <Field label="Phone Number *" error={errors.phone?.message}>
            <input
              {...register("phone")}
              className={inputClass(!!errors.phone)}
              placeholder="9876543210"
              inputMode="tel"
            />
          </Field>

          <Field label="Address" error={errors.address?.message}>
            <input
              {...register("address")}
              className={inputClass(false)}
              placeholder="Flat 4B, Shivaji Nagar"
            />
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <textarea
              {...register("notes")}
              rows={2}
              className={`${inputClass(false)} resize-none`}
              placeholder="No onions, extra dal..."
            />
          </Field>

          {isEditing && (
            <Field label="Status" error={errors.status?.message}>
              <select {...register("status")} className={inputClass(false)}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
          )}

          {!isEditing && activePlans.length > 0 && (
            <Field label="Assign Plan (optional)" error={undefined}>
              <select {...register("plan_id")} className={inputClass(false)}>
                <option value="">— No plan yet —</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ₹{Number(p.price_per_month).toLocaleString("en-IN")}/mo
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Assigning a plan creates a payment record for this month automatically.
              </p>
            </Field>
          )}

          <div className="flex gap-3 mt-auto pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Subscriber"}
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
