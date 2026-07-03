import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import { subscribersApi, type Subscriber, type SubscriberPayload } from "../api/subscribers";
import { subscriptionsApi, type BillingType } from "../api/subscriptions";
import { plansApi, type Plan } from "../api/plans";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z
    .string()
    .min(10, "Enter a valid 10-digit phone number")
    .regex(/^\d[\d\s\-+()]{9,}$/, "Enter a valid phone number"),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "paused", "cancelled"]),
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
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: plansApi.list,
    enabled: open,
  });

  const { data: allSubscriptions = [] } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: subscriptionsApi.list,
    enabled: open,
  });

  const activePlans = plans.filter((p) => p.is_active);
  const subscriberSubscriptions = isEditing
    ? allSubscriptions.filter((s) => s.subscriber_id === subscriber?.id)
    : [];

  // new subscription form state
  const [newPlanId, setNewPlanId] = useState("");
  const [newBillingType, setNewBillingType] = useState<BillingType>("prepaid");
  const [newDeliveryTime, setNewDeliveryTime] = useState("");
  const [showAddPlan, setShowAddPlan] = useState(false);

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
          : { name: "", phone: "", address: "", notes: "", status: "active" as const }
      );
      setShowAddPlan(false);
      setNewPlanId("");
      setNewBillingType("prepaid");
      setNewDeliveryTime("");
    }
  }, [open, subscriber, reset]);

  const saveMutation = useMutation({
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
      if (newPlanId) {
        await subscriptionsApi.create({
          subscriber_id: newSubscriber.id,
          plan_id: Number(newPlanId),
          billing_type: newBillingType,
          delivery_time: newDeliveryTime || null,
        });
      }
      return newSubscriber;
    },
    onSuccess,
  });

  const addSubMutation = useMutation({
    mutationFn: ({ subscriberId }: { subscriberId: number }) =>
      subscriptionsApi.create({
        subscriber_id: subscriberId,
        plan_id: Number(newPlanId),
        billing_type: newBillingType,
        delivery_time: newDeliveryTime || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      setShowAddPlan(false);
      setNewPlanId("");
      setNewBillingType("prepaid");
      setNewDeliveryTime("");
    },
  });

  const cancelSubMutation = useMutation({
    mutationFn: (subId: number) => subscriptionsApi.cancel(subId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  if (!open) return null;

  const planMap = Object.fromEntries(plans.map((p) => [p.id, p]));

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
          onSubmit={handleSubmit((d) => saveMutation.mutate(d))}
          className="flex flex-col flex-1 p-6 gap-4 overflow-y-auto"
        >
          {saveMutation.isError && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {(saveMutation.error as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail ?? "Something went wrong. Please try again."}
            </div>
          )}

          <Field label="Full Name *" error={errors.name?.message}>
            <input {...register("name")} className={inputClass(!!errors.name)} placeholder="Priya Sharma" />
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
            <input {...register("address")} className={inputClass(false)} placeholder="Flat 4B, Shivaji Nagar" />
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

          {/* Plans section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Plans</label>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => setShowAddPlan((v) => !v)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <Plus size={13} />
                  Add plan
                </button>
              )}
            </div>

            {isEditing && subscriberSubscriptions.length > 0 && (
              <ul className="space-y-2 mb-3">
                {subscriberSubscriptions.map((sub) => {
                  const plan: Plan | undefined = planMap[sub.plan_id];
                  return (
                    <li
                      key={sub.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {plan?.name ?? `Plan #${sub.plan_id}`}
                          <span className="ml-2 text-xs text-gray-400 font-normal capitalize">
                            {plan?.meal_type} ·{" "}
                            <span
                              className={
                                sub.billing_type === "postpaid"
                                  ? "text-orange-500"
                                  : "text-blue-500"
                              }
                            >
                              {sub.billing_type}
                            </span>
                          </span>
                        </p>
                        {sub.delivery_time && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Delivery at {sub.delivery_time.slice(0, 5)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelSubMutation.mutate(sub.id)}
                        disabled={cancelSubMutation.isPending}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove plan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {isEditing && showAddPlan && activePlans.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                  <select
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value)}
                    className={inputClass(false)}
                  >
                    <option value="">— Select plan —</option>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.meal_type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Billing Type
                  </label>
                  <select
                    value={newBillingType}
                    onChange={(e) => setNewBillingType(e.target.value as BillingType)}
                    className={inputClass(false)}
                  >
                    <option value="prepaid">Prepaid (fixed ₹/month)</option>
                    <option value="postpaid">Postpaid (₹/meal delivered)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Delivery Time (optional)
                  </label>
                  <input
                    type="time"
                    value={newDeliveryTime}
                    onChange={(e) => setNewDeliveryTime(e.target.value)}
                    className={inputClass(false)}
                  />
                </div>
                {addSubMutation.isError && (
                  <p className="text-red-500 text-xs">Failed to add. Please try again.</p>
                )}
                <button
                  type="button"
                  disabled={!newPlanId || addSubMutation.isPending}
                  onClick={() => subscriber && addSubMutation.mutate({ subscriberId: subscriber.id })}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {addSubMutation.isPending ? "Adding..." : "Add Plan"}
                </button>
              </div>
            )}

            {!isEditing && activePlans.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plan (optional)</label>
                  <select
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value)}
                    className={inputClass(false)}
                  >
                    <option value="">— No plan —</option>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.meal_type}
                      </option>
                    ))}
                  </select>
                </div>
                {newPlanId && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Billing Type
                      </label>
                      <select
                        value={newBillingType}
                        onChange={(e) => setNewBillingType(e.target.value as BillingType)}
                        className={inputClass(false)}
                      >
                        <option value="prepaid">Prepaid (fixed ₹/month)</option>
                        <option value="postpaid">Postpaid (₹/meal delivered)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Delivery Time (optional)
                      </label>
                      <input
                        type="time"
                        value={newDeliveryTime}
                        onChange={(e) => setNewDeliveryTime(e.target.value)}
                        className={inputClass(false)}
                      />
                    </div>
                  </>
                )}
                <p className="text-xs text-gray-400">
                  Assigning a plan creates a payment record for this month automatically.
                </p>
              </div>
            )}
          </div>

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
              disabled={saveMutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending
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
