import { useState } from "react";

interface QuantumRuleToggleProps {
  label: string;
  defaultEnabled?: boolean;
  onChange?: (enabled: boolean) => void;
}

const STORAGE_PREFIX = "great-aegis-quantum-rule-";

export default function QuantumRuleToggle({
  label,
  defaultEnabled = true,
  onChange,
}: QuantumRuleToggleProps) {
  // Read persisted value from localStorage on initialisation
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + label);
      if (stored !== null) {
        return stored === "true";
      }
    } catch {
      // localStorage unavailable (SSR / private browsing)
    }
    return defaultEnabled;
  });

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_PREFIX + label, String(next));
    } catch {
      // silently fail if storage unavailable
    }
    onChange?.(next);
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-md transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
      style={{
        backgroundColor: "var(--color-bg-base)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full transition-all duration-300 ${enabled ? "animate-breathe" : ""}`}
          style={{
            backgroundColor: enabled ? "var(--color-success)" : "var(--color-text-muted)",
            boxShadow: enabled ? `0 0 6px var(--color-success-dim)` : "none",
          }}
        />
        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </span>
      </div>

      {/* Pill toggle */}
      <button
        onClick={handleToggle}
        className="relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 cursor-pointer"
        style={{
          backgroundColor: enabled ? "var(--color-accent)" : "var(--color-border-light)",
          boxShadow: enabled ? "0 0 8px var(--color-accent-glow)" : "none",
        }}
        aria-checked={enabled}
        role="switch"
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200"
          style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
