import { useState, useEffect, useRef } from "react";
import type { GPUTelemetryResponse } from "../types/api";

const API_BASE = "http://localhost:8000";
const POLL_INTERVAL = 8_000; // 8 seconds

interface UseTelemetryPollingResult {
  data: GPUTelemetryResponse | null;
  loading: boolean;
  error: string | null;
}

export default function useTelemetryPolling(): UseTelemetryPollingResult {
  const [data, setData] = useState<GPUTelemetryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/gateway/telemetry`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: GPUTelemetryResponse = await res.json();
        if (mounted.current) {
          setData(json);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Failed to fetch GPU telemetry");
          setLoading(false);
        }
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, POLL_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}
