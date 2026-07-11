# GreatAegis — 70-Second Feature Walkthrough

---

**Visual:** Browser — GreatAegis sidebar. Cut between Routing Lab, Security Suite, and Workspace.

---

### 0:00–0:22 — Routing Lab

> **Routing Lab** is an interactive hybrid router simulator — all client-side, no backend needed.
>
> Toggle three quantum rules: enforce ML-KEM key wrapping, zero-trust encapsulation, and strict pod isolation. Pick a routing profile — Auto, Compliance, or Deep Inference.
>
> Type any prompt and hit simulate. The engine classifies it, matches sensitive keywords, computes a risk score, and returns a final verdict: route to **public Fireworks**, **private AMD pod**, or **secure encrypted fallback**.
>
> It's a sandbox to test routing policies before going live.

---

### 0:23–0:45 — Security Suite

> **Security Suite** is the post-quantum command center.
>
> The top banner shows real-time AMD Secure Pod status — online, simulated, or offline — plus available vLLM models. Below it, the same three quantum rule toggles persist across the app.
>
> The **Threat Capture Log Explorer** tables every document ingestion event. Each entry shows the file name, classification — "Highly Confidential" or "Public" — and file size.
>
> Expand any row to reveal the **ML-KEM encrypted ciphertext**, proving the document was quantum-encrypted before it ever reached the server.

---

### 0:46–1:10 — Document Chat (Workspace)

> The **Document Chat** workspace lets you upload files — PDF, DOCX, TXT, CSV, JSON, MD — up to 10 MB.
>
> Text is extracted client-side, encrypted with **AES-256-GCM + ML-KEM-768**, then ingested into Qdrant vector DB — plaintext never touches the server.
>
> Ask a question. The encrypted prompt is sent via SSE stream, the hybrid router classifies it, a semantic search runs over the encrypted vector store, and the LLM streams back a **cited answer** — all through a quantum-safe channel.
>
> **Zero-trust AI, fully encrypted end-to-end.**

---

**Total runtime:** ~70 seconds
