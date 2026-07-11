import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../utils/api";

const POLL_INTERVAL = 5_000; // 5 seconds — aligned with other polling hooks

export interface HealthData {
  hardware_status: "online" | "offline" | "simulated";
  app_mode: string;
  models_available: string[];
}

interface UseHealthPollingResult {
  health: HealthData | null;
  loading: boolean;
  reachable: boolean; // true if last fetch succeeded, false if errored
}

export default function useHealthPolling(): UseHealthPollingResult {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchHealth = async () => {
      try {
        const res = await apiFetch(`/api/v1/gateway/health`);
        if (!res.ok) {
          if (mounted.current) setReachable(false);
          return;
        }
        const json = await res.json();
        if (mounted.current) {
          setHealth({
            hardware_status: json.hardware_status ?? "simulated",
            app_mode: json.app_mode ?? "simulated",
            models_available: json.models_available ?? [],
          });
          setReachable(true);
          setLoading(false);
        }
      } catch {
        // Backend not reachable — mark unreachable but keep previous health
        if (mounted.current) {
          setReachable(false);
          setLoading(false);
        }
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { health, loading, reachable };
}
