import { useState, useEffect, useRef } from "react";
import type { MetricsResponse } from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const POLL_INTERVAL = 5000; // 5 seconds

interface UseMetricsPollingResult {
  data: MetricsResponse | null;
  loading: boolean;
  error: string | null;
}

export default function useMetricsPolling(): UseMetricsPollingResult {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/gateway/metrics`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MetricsResponse = await res.json();
        if (mounted.current) {
          setData(json);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Failed to fetch metrics");
          setLoading(false);
        }
      }
    };

    // Immediate first fetch
    fetchMetrics();

    // Then poll
    const interval = setInterval(fetchMetrics, POLL_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}
