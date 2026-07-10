#!/usr/bin/env python3
"""
Lightweight HTTP server that exposes rocm-smi GPU metrics for remote
consumption by the GreatAegis backend.

Run inside the rocm Docker container on the AMD GPU droplet:

    python rocm_metrics_server.py &

The server listens on port 8001 and exposes:
    GET /health  — simple health check
    GET /gpu     — raw rocm-smi --showmetrics --json output
"""
import json
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler


class RocmMetricsHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        elif self.path == "/gpu":
            try:
                result = subprocess.run(
                    ["rocm-smi", "--showmetrics", "--json"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if result.returncode != 0:
                    self._respond(503, {"error": "rocm-smi exited non-zero",
                                        "stderr": result.stderr.strip()})
                    return
                data = json.loads(result.stdout)
                self._respond(200, data)
            except FileNotFoundError:
                self._respond(503, {"error": "rocm-smi not found"})
            except subprocess.TimeoutExpired:
                self._respond(504, {"error": "rocm-smi timed out"})
            except json.JSONDecodeError as exc:
                self._respond(502, {"error": f"rocm-smi output not JSON: {exc}"})
            except Exception as exc:
                self._respond(500, {"error": str(exc)})
        else:
            self._respond(404, {"error": "not found"})

    def _respond(self, code: int, payload: dict | list):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    host, port = "0.0.0.0", 8001
    server = HTTPServer((host, port), RocmMetricsHandler)
    print(f"rocm-smi metrics server on http://{host}:{port}/gpu")
    server.serve_forever()
