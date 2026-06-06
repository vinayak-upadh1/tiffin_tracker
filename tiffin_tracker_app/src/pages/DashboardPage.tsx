import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, Truck, IndianRupee } from "lucide-react";
import { dashboardApi } from "../api/dashboard";

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: dashboardApi.summary,
    refetchInterval: 60_000,
  });

  const unpaidLabel = summary
    ? `₹${summary.unpaid_total_amount.toLocaleString("en-IN")}`
    : "—";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back. Here's your overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={<Users size={20} className="text-indigo-600" />}
          label="Active Subscribers"
          value={summary ? String(summary.active_count) : "—"}
          bg="bg-indigo-50"
          onClick={() => navigate("/subscribers?status=active")}
        />
        <StatCard
          icon={<Truck size={20} className="text-green-600" />}
          label="Delivered Today"
          value={summary ? String(summary.delivered_today) : "—"}
          bg="bg-green-50"
          onClick={() => navigate("/deliveries")}
        />
        <StatCard
          icon={<IndianRupee size={20} className="text-red-600" />}
          label="Unpaid This Month"
          value={unpaidLabel}
          subLabel={summary && summary.unpaid_this_month > 0 ? `${summary.unpaid_this_month} subscriber${summary.unpaid_this_month > 1 ? "s" : ""}` : undefined}
          bg="bg-red-50"
          onClick={summary && summary.unpaid_this_month > 0 ? () => navigate("/payments") : undefined}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <p className="text-sm font-medium text-gray-700 mb-1">Daily workflow</p>
        <ol className="mt-3 space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">1</span>
            <span>
              Open{" "}
              <button onClick={() => navigate("/deliveries")} className="text-indigo-600 hover:underline font-medium">
                Deliveries
              </button>{" "}
              — tap "Mark All Delivered", uncheck any skipped ones, then Save.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">2</span>
            <span>
              Check{" "}
              <button onClick={() => navigate("/payments")} className="text-indigo-600 hover:underline font-medium">
                Payments
              </button>{" "}
              — mark received payments and tap "Remind" to send WhatsApp messages to unpaid subscribers.
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subLabel,
  bg,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subLabel?: string;
  bg: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white rounded-xl border border-gray-100 p-5 text-left transition-shadow ${onClick ? "hover:shadow-sm cursor-pointer" : "cursor-default"}`}
    >
      <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {subLabel && <p className="text-xs text-red-500 mt-0.5">{subLabel}</p>}
    </button>
  );
}
