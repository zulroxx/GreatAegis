import { Shield, Globe, Activity, Sun, Moon, Menu } from "lucide-react";
import useHealthPolling from "../hooks/useHealthPolling";
import { useTheme } from "../contexts/ThemeContext";

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { health } = useHealthPolling();
  const { theme, toggleTheme } = useTheme();

  const isOnline = health?.hardware_status === "online";
  const isSimulated = health?.hardware_status === "simulated";
  const isOffline = health?.hardware_status === "offline";

  const statusColor = isOnline
    ? "var(--color-success)"
    : isSimulated
      ? "var(--color-accent)"
      : "var(--color-warning)";

  const statusLabel = isOnline
    ? "LOCKED (ROCm Active via vLLM Hub)"
    : isSimulated
      ? "SIMULATED (Development Mode)"
      : "OFFLINE — SECURE FALLBACK ACTIVE";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-3 sm:px-5"
      style={{
        backgroundColor: "var(--color-bg-sidebar)",
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      {/* ── Hamburger (mobile only) ─────────────────────────────── */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden flex items-center justify-center w-8 h-8 mr-2 rounded-md cursor-pointer transition-all duration-150 active:scale-95"
        style={{ color: "var(--color-text-secondary)" }}
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {/* ── Brand ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 flex-shrink-0" style={{ minWidth: "180px" }}>
        <Shield size={22} style={{ color: "var(--color-accent)" }} />
        <span className="text-base font-semibold tracking-tight select-none hidden sm:inline">
          GreatAegis
        </span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full select-none hidden sm:inline"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#fff",
          }}
        >
          AI Gateway
        </span>
      </div>

      {/* ── Zone switcher (center) ─────────────────────────────── */}
      <div className="flex-1 flex justify-center">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs select-none transition-all duration-150 hover:brightness-110 max-w-[260px] sm:max-w-none"
          style={{
            backgroundColor: "var(--color-bg-base)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Globe size={14} style={{ color: "var(--color-text-muted)" }} className="hidden sm:block" />
          <span className="hidden sm:inline">Zone:</span>
          <span className="truncate" style={{ color: "var(--color-text-primary)" }}>
            enterprise-cluster-alpha.internal
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-muted)" }} className="flex-shrink-0">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* ── Right side controls ─────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3 ml-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: "var(--color-bg-base)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
          aria-pressed={theme === "light"}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
        </button>

        {/* ── Dynamic AMD Pod Status ────────────────────────────── */}
        <div className="flex items-center gap-2">
          {health ? (
            <>
              <span
                className={`w-2 h-2 rounded-full ${isOnline ? "animate-breathe" : ""}`}
                style={{
                  backgroundColor: statusColor,
                  transition: "background-color 300ms",
                }}
              />
              <span
                className="text-xs whitespace-nowrap select-none items-center gap-1 hidden md:flex"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span className="hidden lg:inline">Private AMD Instinct™ Node Status:</span>
                <span
                  className="font-mono font-bold tracking-wide"
                  style={{ color: statusColor, transition: "color 300ms" }}
                >
                  {statusLabel}
                </span>
              </span>
              {isOffline && (
                <Activity
                  size={14}
                  className="animate-breathe"
                  style={{
                    color: "var(--color-warning)",
                  }}
                />
              )}
            </>
          ) : (
            <>
              <span
                className="w-2 h-2 rounded-full animate-breathe"
                style={{ backgroundColor: "var(--color-border-light)" }}
              />
              <span
                className="text-xs whitespace-nowrap select-none hidden md:inline"
                style={{ color: "var(--color-text-muted)" }}
              >
                Connecting to gateway...
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
