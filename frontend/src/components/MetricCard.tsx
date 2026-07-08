import { useEffect, useRef, useState } from "react";

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
}

/**
 * A single KPI card with an animated counter that counts up on mount/update.
 */
export default function MetricCard({ icon, label, value, suffix = "" }: MetricCardProps) {
  const raw = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
  const [display, setDisplay] = useState(0);
  const prevRaw = useRef(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = prevRaw.current;
    const end = raw;
    const duration = 800;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = start + (end - start) * eased;
      setDisplay(current);

      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDisplay(end);
        prevRaw.current = end;
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const formatted =
    typeof value === "number"
      ? value % 1 === 0
        ? display.toFixed(0)
        : display.toFixed(1)
      : display.toFixed(0);

  return (
    <div
      className="rounded-lg px-5 py-4 flex flex-col gap-1.5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        minWidth: "180px",
        flex: 1,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-accent)" }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
        {formatted}
        {suffix && (
          <span className="text-sm ml-0.5" style={{ color: "var(--color-text-muted)" }}>
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}
