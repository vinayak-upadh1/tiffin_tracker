import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { IndianRupee, MessageCircle, CheckCircle2 } from "lucide-react";
import { paymentsApi, type Payment, type MarkPaidPayload } from "../api/payments";

function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snacks: "snacks",
  dinner: "dinner",
};

function formatBreakdown(breakdown: Record<string, number>): string {
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([meal, count]) => `${count} ${MEAL_LABELS[meal] ?? meal}`)
    .join(", ");
}

export default function PaymentsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [markingPayment, setMarkingPayment] = useState<Payment | null>(null);
  const queryClient = useQueryClient();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments", month],
    queryFn: () => paymentsApi.list(month),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: MarkPaidPayload }) =>
      paymentsApi.markPaid(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setMarkingPayment(null);
    },
  });

  const reminderMutation = useMutation({
    mutationFn: (payment: Payment) =>
      paymentsApi.logReminder(payment.id).then((res) => {
        const digits = payment.subscriber_phone.replace(/\D/g, "");
        const phone = digits.length > 10 ? digits.slice(-10) : digits;
        window.open(
          `https://wa.me/91${phone}?text=${encodeURIComponent(res.message)}`,
          "_blank"
        );
        return res;
      }),
  });

  const totalDue = payments.reduce((s, p) => s + Number(p.amount_due), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_paid), 0);
  const unpaidCount = payments.filter((p) => p.status !== "paid").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unpaidCount > 0
              ? `${unpaidCount} unpaid · ₹${(totalDue - totalPaid).toLocaleString("en-IN")} outstanding`
              : payments.length > 0
              ? "All paid this month"
              : "No records"}
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <IndianRupee size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium text-sm">No payment records for this month</p>
            <p className="text-gray-400 text-xs mt-1">
              Payment records are created automatically when a subscription is assigned.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Subscriber</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Due</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 hidden sm:table-cell">
                    Paid
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      i < payments.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{p.subscriber_name}</p>
                        <BillingTypeBadge type={p.billing_type} />
                      </div>
                      <p className="text-xs text-gray-400">{p.subscriber_phone}</p>
                      {p.billing_type === "postpaid" && p.meal_breakdown && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatBreakdown(p.meal_breakdown) || "No meals delivered"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      ₹{Number(p.amount_due).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 hidden sm:table-cell">
                      {Number(p.amount_paid) > 0
                        ? `₹${Number(p.amount_paid).toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status !== "paid" && (
                          <button
                            onClick={() => setMarkingPayment(p)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                            title="Mark paid"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => reminderMutation.mutate(p)}
                          disabled={reminderMutation.isPending}
                          className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                          title="Send WhatsApp reminder"
                        >
                          <MessageCircle size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {markingPayment && (
        <MarkPaidModal
          payment={markingPayment}
          onClose={() => setMarkingPayment(null)}
          onSave={(data) => markPaidMutation.mutate({ id: markingPayment.id, data })}
          isPending={markPaidMutation.isPending}
          error={markPaidMutation.isError}
        />
      )}
    </div>
  );
}

function BillingTypeBadge({ type }: { type: string }) {
  const styles =
    type === "postpaid"
      ? "bg-orange-100 text-orange-700"
      : "bg-blue-100 text-blue-700";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles}`}>
      {type === "postpaid" ? "Postpaid" : "Prepaid"}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    partial: "bg-yellow-100 text-yellow-700",
    pending: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MarkPaidModal({
  payment,
  onClose,
  onSave,
  isPending,
  error,
}: {
  payment: Payment;
  onClose: () => void;
  onSave: (data: MarkPaidPayload) => void;
  isPending: boolean;
  error: boolean;
}) {
  const [amount, setAmount] = useState(String(payment.amount_due));
  const [method, setMethod] = useState<MarkPaidPayload["payment_method"]>("gpay");
  const [notes, setNotes] = useState("");

  const billingDisplay = payment.billing_month
    ? format(new Date(payment.billing_month + "T00:00:00"), "MMMM yyyy")
    : "—";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Mark Payment Received</h2>
        <p className="text-sm text-gray-500 mb-1">
          {payment.subscriber_name} · {billingDisplay}
        </p>
        {payment.billing_type === "postpaid" && payment.meal_breakdown && (
          <p className="text-xs text-gray-400 mb-4">{formatBreakdown(payment.meal_breakdown)}</p>
        )}
        {payment.billing_type === "prepaid" && (
          <p className="text-xs text-gray-400 mb-4" />
        )}

        {error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
            Failed to save. Please try again.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount Received (₹)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as MarkPaidPayload["payment_method"])}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="gpay">GPay</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in advance"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({ amount_paid: Number(amount), payment_method: method, notes: notes || undefined })
            }
            disabled={isPending || !amount || Number(amount) <= 0}
            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
