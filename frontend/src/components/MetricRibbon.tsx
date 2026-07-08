import { Route, Ban, TrendingDown, Clock } from "lucide-react";
import MetricCard from "./MetricCard";
import type { MetricsResponse } from "../types/api";

interface MetricRibbonProps {
  data: MetricsResponse;
}

export default function MetricRibbon({ data }: MetricRibbonProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <MetricCard
        icon={<Route size={16} />}
        label="Total Routed AI Requests"
        value={data.total_routed_requests}
      />
      <MetricCard
        icon={<Ban size={16} />}
        label="HNDL Attacks Intercepted"
        value={data.attacks_intercepted}
        suffix="blocked"
      />
      <MetricCard
        icon={<TrendingDown size={16} />}
        label="Network OpEx Savings"
        value={data.opex_savings}
        suffix="%"
      />
      <MetricCard
        icon={<Clock size={16} />}
        label="Cryptographic Latency Overhead"
        value={data.latency_overhead}
        suffix="s"
      />
    </div>
  );
}
