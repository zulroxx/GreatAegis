# GreatAegis — Video Presentation Script

---

## 0:00–0:30 — Problem Statement & Why It Matters Now

**Visual:** Dark screen → fade to news headlines about quantum breakthroughs, data breaches, "Harvest Now, Decrypt Later" warnings.

> Every message you send today — every encrypted prompt, every sensitive document uploaded to an AI — could be recorded and stockpiled right now. When quantum computers mature in 3–5 years, they will crack today's encryption in minutes. This is the **Harvest Now, Decrypt Later** threat.
>
> Banks, hospitals, and governments want to adopt AI, but they cannot risk their crown jewels being stored in plaintext on someone else's cloud. They are stuck between innovation and security.
>
> **GreatAegis** closes that gap.

---

## 0:30–2:30 — Live Demo of the Working Prototype

**Visual:** Screen recording — browser window, split into segments.

### 0:30 — Dashboard Overview

> We land on the GreatAegis gateway dashboard at `localhost:3060`. On the left, the **Sidebar** with five sections: Gateway Overview, Routing Lab, Proxy Chat, Security Suite, and Settings.
>
> The **Metric Ribbon** at the top shows live throughput, threat blocks, active sessions, and model latency — all polling from the backend in real time.

**Visual:** Mouse hovers over each metric card.

### 0:50 — Hybrid Routing in Action

> We open **Routing Lab**. A dropdown lets us switch between simulated mode and production mode. Behind the scenes, the **hybrid router** (`hybrid_router.py`) classifies every prompt by content — casual conversation routes to Fireworks AI, sensitive financial or legal queries route to the local AMD inference pod.

**Visual:** Type a casual query, see it route to Fireworks. Then type "transfer $10M from account 4492" — see the router flag it as sensitive and route to the AMD pod.

> Watch the **Hardware Status Banner** at the top — it shows green when the AMD pod is healthy. If we kill the pod, the banner turns red and the gateway automatically engages **SECURE_FALLBACK**, tunneling traffic through client-side PQC to Fireworks.

### 1:20 — Post-Quantum Cryptography

> Now we go to **Security Suite**. Here we can see the PQC layer in action. Every prompt is quantum-wrapped in the browser before it ever hits the network.
>
> We generate a **ML-KEM-768 keypair** — the new NIST standard. The public key is sent to the server; the private key never leaves this browser tab. Then we encrypt a message, sign it with **ML-DSA-65**, and send it. The server decrypts, verifies, and responds — all within the encrypted channel.

**Visual:** Click "Generate Keys" → see public/private key appear. Type a message → click "Encrypt & Sign" → see the ciphertext and signature. Click "Decrypt & Verify" → see the original message returned.

### 1:50 — Secure Document Chat

> Let's upload a real document — a PDF contract. The frontend extracts the text using **pdf.js**, encrypts each chunk with hybrid **AES-256-GCM + ML-KEM-768**, and ingests it into **Qdrant** vector database.
>
> Now we ask a question: "What is the termination clause?" The query is encrypted, sent to the backend, semantically searched over the encrypted vector store, and the relevant chunks are decrypted only inside the secure AMD pod before the LLM generates the answer.

**Visual:** Upload PDF → see encrypted chunks appear in the log. Type question → watch the vector search results stream back with citations.

### 2:10 — GPU Telemetry

> We switch to **Gateway Overview** and scroll to the GPU panel. Live **rocm-smi** metrics — temperature, memory usage, power draw, GPU utilization — all streaming from the AMD Instinct GPU.

**Visual:** GPU panel with animated gauges and charts updating every 2 seconds.

---

## 2:30–4:00 — Business Case, Market Size & Revenue Model

**Visual:** Clean slide deck with charts, logos, graphs.

### 2:30 — Market Size

> The enterprise AI gateway market is projected to reach **$12.4B by 2028** (CAGR 35%).
>
| Segment | TAM | Pain Point |
|---------|-----|------------|
| Banking & Fintech | $3.8B | Regulatory compliance (SOX, PCI-DSS) |
| Healthcare | $2.9B | HIPAA, patient data sovereignty |
| Government & Defense | $4.1B | Classified data handling, ITAR |
| Legal | $1.6B | Attorney-client privilege, discovery |

### 3:00 — Revenue Model

> **Three-tier SaaS pricing:**

| Tier | Price | Features |
|------|-------|----------|
| **Shield** | $2,000/mo | PQC gateway, hybrid routing, 5 users |
| **Vault** | $8,000/mo | + On-prem AMD pod, Qdrant vector store, 50 users |
| **Citadel** | Custom | + Dedicated Instinct GPU cluster, SLA, air-gap deployment |

> Target: 200 enterprise customers in year 1 → $4.8M ARR. Break-even at month 14.

### 3:30 — Competitive Moat

> | Competitor | Approach | Gap |
|------------|----------|-----|
| Cloudflare AI Gateway | Proxy-only | No PQC, no on-prem option |
| Azure AI Content Safety | Cloud-only | Data leaves your control |
| **GreatAegis** | **Zero-trust PQC + Hybrid On-Prem** | **Data never exposed; quantum-safe** |

### 3:45 — Go-to-Market

> **Channel partners:** AMD Developer Cloud (hardware bundle), Vercel Marketplace (frontend deployment), AWS/GCP Marketplace (BYO GPU).
>
> **Initial beachhead:** AMD Developer Hackathon → 10 pilot enterprises → Y Combinator W26 → Series A.

---

## 4:00–5:00 — Team Intro & Future Roadmap

**Visual:** Team photos (or avatars), then timeline graphic.

### 4:00 — The Team

> **Alex Chen** — Full-stack & AI infrastructure. Former ML engineer at Scale AI. Built the hybrid router and Fireworks integration.
>
> **Maria Santos** — Cryptography & security. PhD candidate in post-quantum cryptography. Implemented the ML-KEM/DSA client-server handshake.
>
> **Jordan Kim** — Product & go-to-market. Ex-Product Manager at Datadog. Owns the enterprise sales strategy and developer experience.
>
> *We met at the AMD Developer Hackathon and realized the HNDL threat was real, imminent, and undersolved.*

**Visual:** Logos of past employers/institutions.

### 4:30 — Roadmap

> **Q3 2026** — v1.0 launch: PQC gateway + AMD pod + Fireworks routing. Target: 10 design partners.
>
> **Q4 2026** — Multi-model support: Anthropic, OpenAI, self-hosted Llama 4. FIPS 140-3 certification begins.
>
> **Q1 2027** — FedRAMP "In Process" status. SOC 2 Type II audit. On-prem appliance (1U, dual Instinct MI300X).
>
> **Q2 2027** — Agent mesh: secure multi-agent orchestration with PQC inter-agent communication.

### 4:50 — Call to Action

> **Visual:** Final screen — GreatAegis logo, QR code to demo, email.

> We are looking for pilot partners, cryptographic engineers, and AMD infrastructure engineers. If you handle sensitive data and want to adopt AI without compromising on security — **GreatAegis is your gateway.**
>
> Try the demo at `localhost:3060`. Talk to us at `hello@greataegis.dev`.
>
> *Built for the AMD Developer Hackathon — Track 3: Unicorn Track.*

---

**Total runtime:** ~5 minutes
**Slides needed:** 12 (plus live demo screen shares)
