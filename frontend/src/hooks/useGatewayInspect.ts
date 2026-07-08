import { useState, useRef, useCallback } from "react";
import type { InspectRequest, InspectResponse } from "../types/api";

const API_BASE = "http://localhost:8000";

interface UseGatewayInspectResult {
  result: InspectResponse | null;
  loading: boolean;
  error: string | null;
  inspect: (payload: InspectRequest) => Promise<void>;
}

export default function useGatewayInspect(): UseGatewayInspectResult {
  const [result, setResult] = useState<InspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  // Track mounted state across re-renders
  const inspect = useCallback(async (payload: InspectRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: InspectResponse = await res.json();
      if (mounted.current) {
        setResult(json);
        setLoading(false);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Inspection failed");
        setLoading(false);
      }
    }
  }, []);

  return { result, loading, error, inspect };
}
