# GreatAegis — Video Script (2 Speakers, 5:00 exactly)

| Time | Speaker | Content |
|---|---|---|
| 0:00–1:00 | **Sneha** | Title → Intro → Problems → Solutions |
| 1:00–3:00 | **Zulkifli** | Live Demo → System Architecture → Hybrid Routing → Why Different |
| 3:00–4:00 | **Sneha** | Market Scope → Competitive Advantage → Revenue Streams -> Roadmap & Close |

Swap names if I've got the assignment backwards. Read each block aloud once and adjust — these word counts target the stated time at a normal pace, but everyone talks slightly differently.

---

## 0:00–1:00 — SNEHA: Hook, Intro, Problem, Solution
**[SLIDE 1: Title]**
> "Somewhere right now, a hospital asks an AI to summarize a patient's file. That query is quietly copied by someone who can't read it yet — but in five years, a quantum computer will. That's 'Harvest Now, Decrypt Later.' We're PostQuantum Lab. We built **GreatAegis** so that story never ends that way."

**[SLIDE 2: Introduction]**
> "Healthcare, finance, government, and defense want AI but can't risk sending confidential data to providers whose encryption won't survive quantum computers. GreatAegis solves both at once."

**[SLIDE 3: Problems]**
> "GDPR and HIPAA block regulated data from AI outright. Adversaries archive encrypted traffic today to crack later. Cloud infrastructure can't prove isolation. **GreatAegis closes all three gaps.**"

**[SLIDE 4: Solutions]**
> "Every prompt is wrapped in post-quantum ML-KEM before it leaves the browser. Sensitive queries run inside an isolated AMD ROCm instance; everything else routes elsewhere — security without paying private-inference prices for every query. Over to Zulkifli."

---

## 1:00–3:00 — ZULKIFLI: Live Demo, Architecture, Routing, Differentiation
**[Screen recording — demo, ~70s]**
> "Let's see it running."
- Routing Lab: casual query → public path; sensitive query → private AMD pod, auto-classified.
- Security Suite: generate an ML-KEM keypair, encrypt + sign, decrypt + verify — private key never leaves the browser.
- Document chat: upload a doc, ask a question, get a cited answer from the encrypted vector store.

*(Only show what actually works — cut any line that doesn't match your build.)*

**[SLIDE 5: System Architecture, ~15s]**
> "Under the hood: browser-side PQC wrapping, a FastAPI gateway with an intelligent router, and an isolated AMD ROCm pod running the private model and vector store. Nothing sensitive touches a public API."

**[SLIDE 6: Core Differentiator, ~15s]**
> "The router classifies every prompt before it leaves the gateway — no manual tagging. Sensitive stays on-instance for ROCm-accelerated inference; general routes to Fireworks AI. Two paths, one gateway, under five seconds private."

**[SLIDE 7: Why Are We Different, ~20s]**
> "Private AI isn't new — this combination is. Typical private AI uses classical encryption, locked to Nvidia. GreatAegis uses post-quantum ML-KEM, runs natively on AMD ROCm, with cost optimization built into routing, not bolted on. Back to Sneha."

---

## 3:00–5:00 — SNEHA: Market, Competitive Advantage, Revenue
**[SLIDE 8: Market Scope & Urgency, ~20s]**
> "This is a regulation-locked market ready to move — healthcare, banking, government, defense, all needing strict data privacy. Growing AI adoption plus emerging quantum risk makes this urgent now, not later."

**[SLIDE 9: Competitive Advantage, ~20s]**
> "Standard gateways are vulnerable to clear-text sniffing with no quantum protection. Traditional firewalls add heavy latency and hardware cost. GreatAegis is quantum-secure and low-latency by design, built on open AMD ROCm."

**[SLIDE 10: Revenue Streams, ~20s]**
> "Our model: tiered B2B SaaS, private cloud provisioning for dedicated deployments, token-routing arbitrage that improves margins as the router gets smarter, and auditing add-ons for regulated customers. Over to Zulkifli."

**[SLIDE 11: Meet Our Team, ~20s]**

> — *[Zulkifli's own intro: name, role, background]* —
> "I'm Sneha Shah — pitch lead and documentation manager."

**[SLIDE 12: Roadmap & Close, ~40s]**
> "What's next: multi-tenant auth, moving beyond a single-user PoC to full enterprise identity management. A trained sensitivity classifier, replacing keyword heuristics with a real ML model. Production monitoring — observability, rate limiting, audit logging. And an enterprise pilot program with our first design-partner customer in a regulated sector.
>
> GreatAegis is an unbreachable shield for enterprise AI. Thank you — we'd love your questions."

**[Hold on closing slide: github.com/postquantumlab/greataegis]**

---
