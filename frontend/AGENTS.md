# GreatAegis — Build & Dev Instructions

## Frontend (Vite + React SPA)

- **Dev server**:        `npm run dev`
- **Production build**:  `npm run build`
- **Typecheck**:         `npm run typecheck`  (alias: `npm run lint`)
- **Package manager**:   npm
- **Port**:              3060 (http://localhost:3060)

## Backend (FastAPI + Python 3.11+)

- **Run**:               `python main.py`  (or `uvicorn main:app --port 8060`)
- **Syntax check**:      `python -m py_compile main.py hybrid_router.py fireworks_client.py`
- **Port**:              8060

## Rules
- No `next/` imports — this is NOT a Next.js project.
- Use `apiFetch` from `utils/api` for all backend calls.
- Use inline styles (`style={{}}`) with CSS variables, not Tailwind classes for colors.
- When outputting markdown tables, always place each row on its own line (header, separator, and each data row). Never collapse table rows onto a single line.
