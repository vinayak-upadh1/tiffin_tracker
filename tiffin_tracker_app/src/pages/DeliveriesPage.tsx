import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Truck, Save } from "lucide-react";
import { deliveriesApi, type BulkDeliveryItem } from "../api/deliveries";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

type LocalStatus = "delivered" | "skipped";

export default function DeliveriesPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [localStatus, setLocalStatus] = useState<Record<string, LocalStatus>>({});
  const [saved, setSaved] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["deliveries", selectedDate],
    queryFn: () => deliveriesApi.list(selectedDate),
  });

  useEffect(() => {
    const initial: Record<string, LocalStatus> = {};
    entries.forEach((e) => {
      const key = `${e.subscriber_id}:${e.meal_type}`;
      initial[key] = e.status === "skipped" ? "skipped" : "delivered";
    });
    setLocalStatus(initial);
    setSaved(false);
  }, [entries]);

  const markAllDelivered = () => {
    const all: Record<string, LocalStatus> = {};
    entries.forEach((e) => {
      all[`${e.subscriber_id}:${e.meal_type}`] = "delivered";
    });
    setLocalStatus(all);
    setSaved(false);
  };

  const toggle = (key: string) => {
    setLocalStatus((prev) => ({
      ...prev,
      [key]: prev[key] === "delivered" ? "skipped" : "delivered",
    }));
    setSaved(false);
  };

  const bulkMutation = useMutation({
    mutationFn: () => {
      const deliveries: BulkDeliveryItem[] = entries.map((e) => ({
        subscriber_id: e.subscriber_id,
        subscription_id: e.subscription_id,
        meal_type: e.meal_type,
        status: localStatus[`${e.subscriber_id}:${e.meal_type}`] ?? "delivered",
      }));
      return deliveriesApi.bulkMark(selectedDate, deliveries);
    },
    onSuccess: () => setSaved(true),
  });

  const deliveredCount = Object.values(localStatus).filter((s) => s === "delivered").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Deliveries</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {entries.length > 0
              ? `${deliveredCount} of ${entries.length} delivered`
              : "No active subscribers on a plan"}
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {entries.length > 0 && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={markAllDelivered}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <CheckCircle2 size={16} />
            Mark All Delivered
          </button>
          <button
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {bulkMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {saved && (
        <div className="mb-4 bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg border border-green-200">
          Deliveries saved for {format(new Date(selectedDate + "T00:00:00"), "MMMM d, yyyy")}.
        </div>
      )}

      {bulkMutation.isError && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg border border-red-200">
          Failed to save. Please try again.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Truck size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium text-sm">No active subscribers on a plan</p>
            <p className="text-gray-400 text-xs mt-1">
              Add subscribers and assign them a plan to start tracking deliveries.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {entries.map((entry) => {
              const key = `${entry.subscriber_id}:${entry.meal_type}`;
              const status = localStatus[key] ?? "delivered";
              const isDelivered = status === "delivered";
              return (
                <li key={key} className="flex items-center gap-4 px-4 py-3">
                  <button
                    onClick={() => toggle(key)}
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      isDelivered
                        ? "bg-green-100 text-green-600 hover:bg-green-200"
                        : "bg-red-100 text-red-500 hover:bg-red-200"
                    }`}
                    title={isDelivered ? "Mark as skipped" : "Mark as delivered"}
                  >
                    {isDelivered ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.subscriber_name}</p>
                    <p className="text-xs text-gray-400">
                      {entry.plan_name} ·{" "}
                      <span className="capitalize">{entry.meal_type}</span>
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium ${isDelivered ? "text-green-600" : "text-red-500"}`}
                  >
                    {isDelivered ? "Delivered" : "Skipped"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
