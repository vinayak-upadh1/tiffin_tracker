import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, Truck, Save } from "lucide-react";
import { deliveriesApi, type DeliveryEntry, type DeliveryStatus, type BulkDeliveryItem } from "../api/deliveries";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${ampm}`;
}

type LocalStatus = DeliveryStatus;

const STATUS_CYCLE: Record<string, LocalStatus> = {
  pending: "delivered",
  delivered: "skipped",
  skipped: "pending",
};

function statusIcon(status: LocalStatus) {
  if (status === "delivered") return <CheckCircle2 size={18} />;
  if (status === "skipped") return <XCircle size={18} />;
  return <Clock size={18} />;
}

function statusColors(status: LocalStatus) {
  if (status === "delivered") return "bg-green-100 text-green-600 hover:bg-green-200";
  if (status === "skipped") return "bg-red-100 text-red-500 hover:bg-red-200";
  return "bg-gray-100 text-gray-400 hover:bg-gray-200";
}

function statusLabel(status: LocalStatus) {
  if (status === "delivered") return <span className="text-xs font-medium text-green-600">Delivered</span>;
  if (status === "skipped") return <span className="text-xs font-medium text-red-500">Skipped</span>;
  return <span className="text-xs font-medium text-gray-400">Pending</span>;
}

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
      const key = entryKey(e);
      initial[key] = (e.status as LocalStatus) ?? "pending";
    });
    setLocalStatus(initial);
    setSaved(false);
  }, [entries]);

  const toggle = (key: string) => {
    setLocalStatus((prev) => ({
      ...prev,
      [key]: STATUS_CYCLE[prev[key] ?? "pending"],
    }));
    setSaved(false);
  };

  const bulkMutation = useMutation({
    mutationFn: () => {
      const deliveries: BulkDeliveryItem[] = entries.map((e) => ({
        subscriber_id: e.subscriber_id,
        subscription_id: e.subscription_id,
        meal_type: e.meal_type,
        status: localStatus[entryKey(e)] ?? "pending",
      }));
      return deliveriesApi.bulkMark(selectedDate, deliveries);
    },
    onSuccess: () => setSaved(true),
  });

  const deliveredCount = Object.values(localStatus).filter((s) => s === "delivered").length;

  // group entries by delivery_time (null → "Unscheduled")
  const groups = groupByTime(entries);

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

      {isLoading ? (
        <div className="p-8 text-center">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Truck size={20} className="text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-sm">No active subscribers on a plan</p>
          <p className="text-gray-400 text-xs mt-1">
            Add subscribers and assign them a plan to start tracking deliveries.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ label, entries: groupEntries }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50/80 border-b border-gray-100 flex items-center gap-2">
                <Clock size={13} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {label}
                </span>
              </div>
              <ul className="divide-y divide-gray-50">
                {groupEntries.map((entry) => {
                  const key = entryKey(entry);
                  const status: LocalStatus = localStatus[key] ?? "pending";
                  return (
                    <li key={key} className="flex items-center gap-4 px-4 py-3">
                      <button
                        onClick={() => toggle(key)}
                        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${statusColors(status)}`}
                        title="Click to cycle: pending → delivered → skipped"
                      >
                        {statusIcon(status)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {entry.subscriber_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {entry.plan_name} ·{" "}
                          <span className="capitalize">{entry.meal_type}</span>
                        </p>
                      </div>
                      {statusLabel(status)}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function entryKey(e: DeliveryEntry) {
  return `${e.subscriber_id}:${e.subscription_id}:${e.meal_type}`;
}

function groupByTime(entries: DeliveryEntry[]): { label: string; entries: DeliveryEntry[] }[] {
  const map = new Map<string, DeliveryEntry[]>();
  for (const e of entries) {
    const key = e.delivery_time ?? "__unscheduled__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  const result: { label: string; entries: DeliveryEntry[] }[] = [];
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "__unscheduled__") return 1;
    if (b === "__unscheduled__") return -1;
    return a.localeCompare(b);
  });

  for (const key of keys) {
    result.push({
      label: key === "__unscheduled__" ? "Unscheduled" : formatTime(key),
      entries: map.get(key)!,
    });
  }
  return result;
}
