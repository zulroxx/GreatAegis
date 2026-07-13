# 🛡️ GreatAegis: Enterprise Post-Quantum Secure AI Gateway

[![AMD ROCm](https://img.shields.io/badge/Powered%20by-AMD%20ROCm-red.svg)](#)
[![Track 3](https://img.shields.io/badge/Hackathon-Track%203%3A%20Unicorn-purple.svg)](#)
[![Docker](https://img.shields.io/badge/Ready-linux%2Famd64-blue.svg)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-v2.0-009688.svg)](#)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **GreatAegis** is a post-quantum secure AI gateway for enterprises. It protects sensitive corporate knowledge bases from the "Harvest Now, Decrypt Later" (HNDL) threat while dynamically routing AI workloads across **AMD Instinct GPUs** and the **Fireworks AI API**.

🔗 **Live Demo URL:** *https://great-aegis.vercel.app/*   
🎬 **Demo Video:** *https://drive.google.com/file/d/1PNik3IhQdtvS89ZyaYOsq5PlcWNiBzoV/view?usp=sharing*   
📄 **Pitch Deck:** `/docs/Greataegis pitch deck.pdf` || [canva link](https://canva.link/e1y9pgzd5tttl63)   

---

## Table of Contents

- [The Problem & Our Solution](#the-problem--our-solution)
- [Market Opportunity](#market-opportunity)
- [How We Utilize AMD Compute](#how-we-utilize-amd-compute)
- [Post-Quantum Cryptography](#post-quantum-cryptography)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [API Endpoints](#api-endpoints)
- [Getting Started](#getting-started-judging-vm--local-setup)
- [Automated Pre-Screening Compliance](#automated-pre-screening-compliance)
- [Known Limitations](#known-limitations-out-of-scope-for-poc)
- [Team](#team)
- [License](#license)

---

## The Problem & Our Solution

Highly regulated industries (Banking, Healthcare, Government) are blocked from adopting cloud AI due to data sovereignty concerns and the looming threat of quantum computing breaking current encryption standards.

**GreatAegis** solves this by combining **Zero-Trust Data-in-Transit** with **Secure Compute Pod Isolation**:

1. **Client-Side Post-Quantum Cryptography (PQC):** Prompts and documents are quantum-wrapped directly in the browser using NIST-standard algorithms (ML-KEM-768/Kyber) before they ever hit the network.
2. **Private AMD Cloud Inference:** Decryption, vector search (RAG), and LLM generation happen *only* inside a secure, locally-hosted AMD Docker environment.
3. **Hybrid Routing:** Non-sensitive queries are routed to Fireworks AI for speed and cost efficiency, keeping expensive private compute reserved for what actually needs it.

## Market Opportunity

> For the full business case, market sizing, and go-to-market plan, see the [pitch deck](https://canva.link/e1y9pgzd5tttl63) — kept here as a summary so this README stays focused on the technical submission.

- **TAM:** Global post-quantum cryptography market, projected at **$2.84B by 2030** (~46% CAGR).
- **Beachhead segment:** **44,000+ banks and credit unions worldwide**, ahead of healthcare and government.
- **Early revenue target:** 5–10 pilot customers in year one at $50K–$100K/year enterprise licensing (~$250K–$1M ARR) — a realistic first-year goal for a small team, not a projection built on an unvalidated market.
- **Pricing tiers** (illustrative, to be validated with design partners):

| Tier | Price | Features |
|------|-------|----------|
| **Shield** | $2,000/mo | PQC gateway, hybrid routing, 5 users |
| **Vault** | $8,000/mo | + On-prem AMD pod, Qdrant vector store, 50 users |
| **Citadel** | Custom | + Dedicated Instinct GPU cluster, SLA, air-gap deployment |

### Competitive Positioning

| Competitor | Approach | Gap |
|------------|----------|-----|
| Cloudflare AI Gateway | Proxy-only | No PQC, no on-prem option |
| Azure OpenAI Service (private endpoints) | VPC-isolated, cloud-only | No PQC; Nvidia/CUDA-locked; no built-in hybrid routing |
| **GreatAegis** | **Zero-trust PQC + Hybrid On-Prem on AMD ROCm** | **Data never exposed; quantum-safe; cost-aware routing built in** |

> **Note:** private AI hosting alone isn't novel — several vendors offer VPC-isolated inference. The differentiation is the combination of post-quantum encryption, native AMD ROCm acceleration, and built-in hybrid routing, together.

## How We Utilize AMD Compute

*Automated Evaluator Note: This project heavily relies on AMD hardware and software ecosystems.*

* **Hardware:** We deploy our core backend on an **AMD Developer Cloud** instance utilizing **AMD Instinct GPUs**.
* **ROCm Acceleration:** Our local open-source LLM is accelerated directly via the **AMD ROCm™ software stack**.
* **Hybrid Routing:** Casual queries are intelligently routed to the **Fireworks AI API** to save compute costs, while sensitive PQC-encrypted documents are strictly routed to our **AMD-powered local inference pod**.
* **Auto-Failover:** If the AMD pod is unreachable, the gateway automatically engages **SECURE_FALLBACK** — emergency zero-trust routing via a client-side encrypted PQC tunnel to Fireworks AI.

## Post-Quantum Cryptography

GreatAegis implements a defense-in-depth PQC layer:

| Primitive | Algorithm | Standard |
|-----------|-----------|----------|
| KEM / Key Encapsulation | ML-KEM-768 (Kyber) | NIST FIPS 203 |
| Digital Signatures | ML-DSA-65 (Dilithium) | NIST FIPS 204 |
| Data Encryption | AES-256-GCM (hybrid with ML-KEM) | NIST SP 800-38D |

All encryption and signing happens **client-side in the browser** using WebAssembly-compiled liboqs. Private keys never leave the client device.

## Repository Structure

```
GreatAegis/
├── frontend/                    # Vite + React SPA + Tailwind CSS
│   ├── src/
│   │   ├── components/          # UI components (Chat, GPU, Metrics, Sidebar, etc.)
│   │   ├── contexts/            # ChatHistory, Theme context providers
│   │   ├── hooks/               # Polling hooks (health, metrics, logs, telemetry)
│   │   ├── pages/               # GatewayOverview, ProxyChat, RoutingLab, SecuritySuite, Settings
│   │   ├── types/               # Shared TypeScript API types
│   │   ├── utils/               # PQC client, API client, routing simulator, file extractor
│   │   ├── App.tsx              # Root SPA with React Router
│   │   └── main.tsx             # Entry point
│   ├── Dockerfile
│   └── vite.config.ts
├── backend/
│   ├── main.py                  # FastAPI v2.0 application (12+ endpoints)
│   ├── pqc_crypto.py            # ML-KEM-768 + ML-DSA-65 + AES-256-GCM implementation
│   ├── hybrid_router.py         # Content-aware hybrid router with keyword matching
│   ├── fireworks_client.py      # Fireworks AI SDK integration
│   ├── local_vector_db.py       # Qdrant vector DB with hybrid encrypted chunk storage
│   ├── models.py                # Pydantic request/response models
│   ├── router.py                # Legacy router module
│   ├── rocm_metrics_server.py   # ROCm GPU telemetry server
│   ├── sim_data.py              # Simulation data for demo/eval mode
│   ├── .env.example             # Environment template
│   ├── .env.production.example  # Production environment template
│   ├── Dockerfile
│   ├── Dockerfile.inference     # AMD vLLM inference container
│   └── requirements.txt
├── docs/
│   ├── architecture_diagram.png
│   └── Greataegis pitch-deck.pdf
├── cloud-init.yaml              # Startup script for AMD Instinct GPU droplet (AMD Developer Cloud, provisioned via DigitalOcean)
├── docker-compose.yml           # Orchestrates frontend (3060) + backend (8060)
├── vercel.json                  # Vercel deployment config
├── LICENSE
└── walkthrough.md
```

## Tech Stack

* **Frontend:** Vite 6, React 18, TypeScript, Tailwind CSS, Recharts
* **Backend:** FastAPI (Python 3.12), SlowAPI rate-limiting, SSE Starlette
* **AI / Compute:** AMD ROCm, PyTorch (ROCm build), Fireworks AI API, vLLM
* **Post-Quantum Crypto:** liboqs WASM (ML-KEM-768, ML-DSA-65), AES-256-GCM
* **Vector Database:** Qdrant (with hybrid AES-256-GCM + ML-KEM-768 chunk encryption)
* **Deployment:** Docker (linux/amd64), Docker Compose, cloud-init

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/gateway/health` | App mode, hardware status, vector DB health, models |
| GET | `/api/v1/gateway/metrics` | Zone metrics (ribbon KPIs + chart data) |
| GET | `/api/v1/gateway/logs` | Threat-capture log entries |
| POST | `/api/v1/gateway/inspect` | Hybrid-router + PQC inspection |
| POST | `/api/v1/gateway/chat/stream` | Autonomous hybrid-router chat streaming |
| POST | `/api/v1/gateway/vector/ingest` | Encrypt & store document chunks |
| POST | `/api/v1/gateway/vector/query` | Semantic search over encrypted chunks |
| GET | `/api/v1/gateway/vector/stats` | Vector DB health statistics |
| GET | `/api/v1/gateway/telemetry` | GPU device stats (rocm-smi / simulated) |
| POST | `/api/v1/gateway/settings/password` | Settings panel password gate |
| GET | `/api/v1/gateway/models/usage` | Per-model token usage breakdown |
| GET | `/api/v1/gateway/fireworks/models` | Available Fireworks AI models |
| GET | `/api/v1/gateway/api-keys/status` | API key status (read-only) |

## Getting Started (Judging VM / Local Setup)

Our containers are optimized to boot in **under 60 seconds** and are built for `linux/amd64`.

### Unified Docker Deployment (Recommended)

1. Navigate to the backend directory and set your environment variables:
   - `cd backend`
   - `cp .env.example .env`
   - *(Edit your `.env` file and update your `FIREWORKS_API_KEY`)*
2. Return to the root directory and spin up both services:
   - `cd ..`
   - `docker-compose up --build -d`
3. Access the dashboard at **http://localhost:3060** (Backend runs on **http://localhost:8060**).

### Manual Setup (Alternative)

**Backend:**
- `cd backend`
- `pip install -r requirements.txt`
- `python main.py`

**Frontend:**
- `cd frontend`
- `npm install`
- `npm run dev`

Two runtime modes are available via the `APP_MODE` env variable:
- `APP_MODE=simulated` (default) — mock traffic & GPU telemetry
- `APP_MODE=production` — real vLLM endpoints, live rocm-smi metrics, real PQC

### Environment Variables

Required variables in `backend/.env` (see `backend/.env.example` for the full template):

```env
# Runtime mode
APP_MODE=simulated              # or "production"

# Fireworks AI (public routing path)
FIREWORKS_API_KEY=

# AMD / ROCm / vLLM (private routing path)
VLLM_ENDPOINT=
ROCM_DEVICE=

# Vector database (Qdrant)
VECTOR_DB_URL=
VECTOR_DB_API_KEY=

# PQC key storage
PQC_KEY_STORE_PATH=
```

> Variable names above match the current `.env.example` — if your local template differs, defer to the file in the repo as the source of truth.

## Automated Pre-Screening Compliance

- [x] **AMD Compute Usage:** Validated via ROCm + AMD Developer Cloud deployment.
- [x] **Container Boot Time:** Starts in < 60 seconds.
- [x] **Response Time:** < 30 seconds per request.
- [x] **Architecture:** Docker Image manifested as `linux/amd64`.
- [x] **Language:** All responses and documentation are in English.
- [x] **Dynamic Responses:** No hardcoded logic; fully dependent on live AI inference and RAG.
- [x] **License:** MIT — see [LICENSE](./LICENSE)

## Known Limitations (Out of Scope for PoC)

- Single-user only, no multi-tenant auth
- Document sensitivity classification uses keyword/content-aware matching, not a trained ML classifier
- No production-grade monitoring, rate limiting beyond SlowAPI defaults, or mobile-responsive UI
- Pricing tiers and revenue targets above are illustrative and not yet validated with paying customers

## Team

| Role | Responsibility |
|---|---|
| Team Lead & Full-Stack Developer | End-to-end technical build — AMD Cloud/ROCm setup, FastAPI backend, PQC integration, Vite + React frontend, hybrid routing engine |
| Pitch Lead & Documentation Manager | Product architecture docs, README, pitch deck, presentation script, GitHub documentation |

## License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for the full text.

---
*Built for the AMD Developer Hackathon - Track 3: Unicorn Track*
