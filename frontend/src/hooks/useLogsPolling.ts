import { useState, useEffect, useRef } from "react";
import type { LogEntry } from "../types/api";

const API_BASE = "http://localhost:8000";
const POLL_INTERVAL = 5000;

interface UseLogsPollingResult {
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
}

export default function useLogsPolling(): UseLogsPollingResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/gateway/logs`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LogEntry[] = await res.json();
        if (mounted.current) {
          setLogs(json);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Failed to fetch logs");
          setLoading(false);
        }
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { logs, loading, error };
}
