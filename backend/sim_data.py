"""
Deterministic-random simulation data for the GreatAegis AI Gateway.

A single PRNG seeded per session so data varies between restarts but is
internally consistent across a single run.
"""

import random
from datetime import datetime, timedelta, timezone

from models import ChartDataPoint, LogEntry, GPUDeviceInfo

_SEED: int | None = None


def _rng():
    global _SEED
    if _SEED is None:
        _SEED = random.randint(0, 2**31 - 1)
    return random.Random(_SEED)


# ── Metrics helpers ────────────────────────────────────────────────────────

def generate_metrics() -> tuple[int, int, float, float, list[ChartDataPoint]]:
    """Return (total_routed, attacks_intercepted, opex_pct, latency_s, chart_data)."""
    rng = _rng()
    total = rng.randint(14_500, 18_500)
    attacks = rng.randint(200, 900)
    opex = round(rng.uniform(34.0, 52.0), 1)
    latency = round(rng.uniform(0.012, 0.038), 3)

    now = datetime.now(timezone.utc)
    points: list[ChartDataPoint] = []
    for i in range(24):
        ts = now - timedelta(hours=23 - i)
        points.append(
            ChartDataPoint(
                timestamp=ts.strftime("%H:%M"),
                public_tokens=rng.randint(80, 600),
                private_pod=rng.randint(20, 200),
            )
        )
    return total, attacks, opex, latency, points


# ── Log helpers ────────────────────────────────────────────────────────────

_CLASSIFICATIONS = [
    ("Public", 0.70),
    ("Public", 0.15),
    ("Public", 0.05),
    ("Highly Confidential", 0.05),
    ("Highly Confidential", 0.03),
    ("Highly Confidential", 0.02),
]

_FILE_NAMES = [
    "prompt_batch_20241023.jsonl",
    "user_query_cache_export.ndjson",
    "internal_audit_trail.log",
    "model_inference_00234.txt",
    "sales_forecast_q4_2024.csv",
    "board_memo_revenue.xlsx",
    "support_ticket_export.json",
    "api_usage_trends.tsv",
    "hr_salary_review_2024.pdf",
    "customer_feedback_sentiment.csv",
    "infra_cost_report.md",
    "corporate_strategy.pptx",
    "slack_export_security_audit.log",
    "finops_budget_allocation.xlsx",
    "product_roadmap_confidential.pdf",
]

_SIZES_BYTES = [
    12_345, 88_192, 4_203, 97_280, 512_000,
    2_048_000, 8_192, 1_024, 256_000, 131_072,
    43_000, 1_048_576, 7_000, 3_500_000, 768_000,
]


def generate_logs() -> list[LogEntry]:
    rng = _rng()
    now = datetime.now(timezone.utc)
    logs: list[LogEntry] = []
    for i in range(15):
        classification = rng.choices(
            [c for c, _ in _CLASSIFICATIONS],
            weights=[w for _, w in _CLASSIFICATIONS],
            k=1,
        )[0]
        file_name = rng.choice(_FILE_NAMES)
        file_size = rng.choice(_SIZES_BYTES)
        ts = now - timedelta(minutes=rng.randint(0, 720), seconds=rng.randint(0, 59))
        ciphertext = _gen_ciphertext(rng)
        logs.append(
            LogEntry(
                id=f"log-{i + 1:03d}",
                timestamp=ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                file_name=file_name,
                classification=classification,
                file_size=file_size,
                ciphertext=ciphertext,
            )
        )
    return logs


def _gen_ciphertext(rng: random.Random) -> str:
    """Produce a hex string that looks like a real ML-KEM ciphertext."""
    length = rng.randint(64, 128)
    return rng.choice("abcdef0123456789") + "".join(
        rng.choice("abcdef0123456789") for _ in range(length)
    )


# ── GPU telemetry helpers ───────────────────────────────────────────────────

def generate_gpu_telemetry() -> list[GPUDeviceInfo]:
    """
    Simulate plausible AMD Instinct MI300X GPU metrics (like rocm-smi output).

    Returns stats for 2 MI300X devices with temperature, VRAM, and
    utilisation values that drift slightly on each call.
    """
    rng = _rng()
    devices: list[GPUDeviceInfo] = []
    for device_id in range(2):
        devices.append(
            GPUDeviceInfo(
                device_id=device_id,
                name="AMD Instinct MI300X",
                temperature_c=round(rng.uniform(42.0, 68.0), 1),
                vram_used_gb=round(rng.uniform(32.0, 96.0), 1),
                vram_total_gb=192.0,
                utilization_pct=round(rng.uniform(15.0, 85.0), 1),
                power_watts=round(rng.uniform(280.0, 550.0), 1),
                power_cap_watts=750.0,
                sclk_mhz=rng.randint(1500, 2100),
                mclk_mhz=rng.randint(1000, 1500),
            )
        )
    return devices


# ── Offline telemetry (disaster-recovery indicator) ──────────────────────────

def generate_offline_telemetry() -> list[GPUDeviceInfo]:
    """
    Return near-zero "Awaiting Connection" stubs when the AMD private
    pod is unreachable in production mode.

    Frontend uses these values to render the amber hardware-offline
    warning banner while the gateway operates in SECURE_FALLBACK mode.
    """
    return [
        GPUDeviceInfo(
            device_id=0,
            name="AMD Instinct MI300X — Awaiting Connection",
            temperature_c=0.0,
            vram_used_gb=0.0,
            vram_total_gb=192.0,
            utilization_pct=0.0,
            power_watts=0.0,
            power_cap_watts=750.0,
            sclk_mhz=0,
            mclk_mhz=0,
        ),
        GPUDeviceInfo(
            device_id=1,
            name="AMD Instinct MI300X — Awaiting Connection",
            temperature_c=0.0,
            vram_used_gb=0.0,
            vram_total_gb=192.0,
            utilization_pct=0.0,
            power_watts=0.0,
            power_cap_watts=750.0,
            sclk_mhz=0,
            mclk_mhz=0,
        ),
    ]
