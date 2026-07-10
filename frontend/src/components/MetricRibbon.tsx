import { Route, Shield, TrendingDown, Clock } from "lucide-react";
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
        icon={<Shield size={16} />}
        label="PQC-Protected Requests"
        value={data.attacks_intercepted}
        suffix="encrypted"
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
