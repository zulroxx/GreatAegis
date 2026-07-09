import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from "recharts";
import type { ChartDataPoint } from "../types/api";

interface AnalyticsChartProps {
  data: ChartDataPoint[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg px-4 py-3 text-xs shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border-light)",
        color: "var(--color-text-primary)",
      }}
    >
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsChart({ data }: AnalyticsChartProps) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
        Traffic Flow (Last 24 Hours)
      </h3>

      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="gradientPublic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E676" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#00E676" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradientPrivate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00B0FF" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#00B0FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--color-border-light)"
              vertical={false}
            />

            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="public_tokens"
              name="Public API Tokens"
              stroke="#00E676"
              strokeWidth={2}
              fill="url(#gradientPublic)"
              dot={false}
              activeDot={{ r: 4, fill: "#00E676", stroke: "none" }}
            />

            <Area
              type="monotone"
              dataKey="private_pod"
              name="Private AMD Pod Processing"
              stroke="#00B0FF"
              strokeWidth={2}
              fill="url(#gradientPrivate)"
              dot={false}
              activeDot={{ r: 4, fill: "#00B0FF", stroke: "none" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
