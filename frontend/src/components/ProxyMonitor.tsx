import { useEffect, useRef } from "react";
import { Activity, CircuitBoard } from "lucide-react";

interface ProxyMonitorProps {
  route: "idle" | "public" | "private";
  riskScore: number;
  classification: string;
  demoMode?: "casual" | "sovereign" | "fallback";
}

/* ── SVG path definitions ───────────────────────────────────── */
const PATHS = {
  inputToRouter: "M 210,42 L 210,110",
  routerToPublic: "M 140,154 Q 80,190 65,205",
  routerToPrivate: "M 280,154 Q 340,190 355,205",
  publicToResponse: "M 65,243 Q 110,275 170,310",
  privateToResponse: "M 355,243 Q 310,275 250,310",
} as const;

/* ── Node dimensions ─────────────────────────────────────────── */
const NODES = {
  input: { x: 135, y: 8, w: 150, h: 34, cx: 210, cy: 25 },
  router: { x: 120, y: 110, w: 180, h: 44, cx: 210, cy: 132 },
  public: { x: 0, y: 205, w: 130, h: 38, cx: 65, cy: 224 },
  private: { x: 290, y: 205, w: 130, h: 38, cx: 355, cy: 224 },
  response: { x: 135, y: 310, w: 150, h: 34, cx: 210, cy: 327 },
} as const;

export default function ProxyMonitor({
  route,
  riskScore,
  classification,
  demoMode,
}: ProxyMonitorProps) {
  /* ── Refs for animated paths ─────────────────────────────── */
  const pathRefs = {
    inputRouter: useRef<SVGPathElement>(null),
    routerEndpoint: useRef<SVGPathElement>(null),
    endpointResponse: useRef<SVGPathElement>(null),
  };

  /* ── Animate cascading flow on route change ──────────────── */
  useEffect(() => {
    if (route === "idle") return;

    const segments = [
      pathRefs.inputRouter.current,
      pathRefs.routerEndpoint.current,
      pathRefs.endpointResponse.current,
    ].filter(Boolean) as SVGPathElement[];

    segments.forEach((path, i) => {
      const len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      path.style.transition = "none";
      // Force restage then animate with stagger
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          path.style.transition = `stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 250}ms`;
          path.style.strokeDashoffset = "0";
        });
      });
    });
  }, [route]);

  const isPublic = route === "public";
  const isPrivate = route === "private";
  const isActive = route !== "idle";

  /* ── Route colors ────────────────────────────────────────── */
  const routeColor = isPublic ? "#00E676" : "#00CC66";
  const routeGlow = isPublic
    ? "drop-shadow(0 0 6px #00E67688)"
    : "drop-shadow(0 0 6px #00CC6688)";

  return (
    <div
      className="rounded-lg p-4 h-full relative overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "0px solid var(--color-border-default)",
      }}
    >
      {/* Subtle grid background */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        opacity={0.04}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--color-accent)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* ── Header ─────────────────────────────────────────── */}
      <h3 className="text-xs font-semibold mb-3 flex items-center gap-2 relative z-10" style={{ color: "var(--color-text-primary)" }}>
        <CircuitBoard size={16} style={{ color: "var(--color-accent)" }} />
        Proxy Monitor
      </h3>

      {/* ── SVG Flow Diagram ───────────────────────────────── */}
      <svg viewBox="0 0 420 360" className="w-full relative z-10" style={{ maxHeight: 320 }}>
        <defs>
          {/* Glow filters */}
          <filter id="glowPublic">
            <feDropShadow dx={0} dy={0} stdDeviation={3} floodColor="#00E676" floodOpacity={0.5} />
          </filter>
          <filter id="glowPrivate">
            <feDropShadow dx={0} dy={0} stdDeviation={3} floodColor="#00CC66" floodOpacity={0.5} />
          </filter>
          <filter id="pulseGlow">
            <feDropShadow dx={0} dy={0} stdDeviation={4} floodColor="var(--color-accent)" floodOpacity={0.4} />
          </filter>
          {/* Soft blur for ambient glow */}
          <filter id="ambientBlur">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* ── TRACKS (always visible, dim) ─────────────────── */}
        <g stroke="var(--color-border-light)" strokeWidth={1.5} fill="none" opacity={0.6}>
          <path d={PATHS.inputToRouter} />
          <path d={PATHS.routerToPublic} />
          <path d={PATHS.routerToPrivate} />
          <path d={PATHS.publicToResponse} />
          <path d={PATHS.privateToResponse} />
        </g>

        {/* ── AMBIENT PATH GLOW (subtle shimmer on active route) ── */}
        {isActive && (
          <g stroke={routeColor} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.08} filter="url(#ambientBlur)">
            <path d={PATHS.inputToRouter}>
              <animate attributeName="opacity" values="0.06;0.18;0.06" dur="2.5s" repeatCount="indefinite" />
            </path>
            <path d={isPublic ? PATHS.routerToPublic : PATHS.routerToPrivate}>
              <animate attributeName="opacity" values="0.06;0.18;0.06" dur="2.5s" begin="0.8s" repeatCount="indefinite" />
            </path>
            <path d={isPublic ? PATHS.publicToResponse : PATHS.privateToResponse}>
              <animate attributeName="opacity" values="0.06;0.18;0.06" dur="2.5s" begin="1.6s" repeatCount="indefinite" />
            </path>
          </g>
        )}

        {/* ── ACTIVE ROUTE GLOW PATHS ──────────────────────── */}
        <path
          ref={pathRefs.inputRouter}
          d={PATHS.inputToRouter}
          stroke={routeColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          opacity={isActive ? 1 : 0}
          style={{ filter: isActive ? routeGlow : "none" }}
        />
        <path
          ref={pathRefs.routerEndpoint}
          d={isPublic ? PATHS.routerToPublic : PATHS.routerToPrivate}
          stroke={routeColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          opacity={isActive ? 1 : 0}
          style={{ filter: isActive ? routeGlow : "none" }}
        />
        <path
          ref={pathRefs.endpointResponse}
          d={isPublic ? PATHS.publicToResponse : PATHS.privateToResponse}
          stroke={routeColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          opacity={isActive ? 1 : 0}
          style={{ filter: isActive ? routeGlow : "none" }}
        />

        {/* ── ANIMATED DATA PACKETS + TRAIL PARTICLES ──────── */}
        {isActive && (
          <g>
            {/* Trail particle 1 (behind dot 1) */}
            <circle r={1.5} fill={routeColor} opacity={0}>
              <animate attributeName="opacity" values="0.6;0" dur="0.6s" repeatCount="indefinite" />
              <animateMotion dur="1.5s" repeatCount="indefinite" path={PATHS.inputToRouter} />
            </circle>
            {/* Dot 1: Input→Router */}
            <circle r={3.5} fill={routeColor} filter={routeGlow}>
              <animateMotion dur="1.5s" repeatCount="indefinite" path={PATHS.inputToRouter} />
            </circle>

            {/* Trail particle 2 */}
            <circle r={1.5} fill={routeColor} opacity={0}>
              <animate attributeName="opacity" values="0.6;0" dur="0.6s" begin="0.35s" repeatCount="indefinite" />
              <animateMotion dur="1.5s" begin="0.35s" repeatCount="indefinite" path={isPublic ? PATHS.routerToPublic : PATHS.routerToPrivate} />
            </circle>
            {/* Dot 2: Router→Endpoint */}
            <circle r={3.5} fill={routeColor} filter={routeGlow}>
              <animateMotion dur="1.5s" begin="0.35s" repeatCount="indefinite" path={isPublic ? PATHS.routerToPublic : PATHS.routerToPrivate} />
            </circle>

            {/* Trail particle 3 */}
            <circle r={1.5} fill={routeColor} opacity={0}>
              <animate attributeName="opacity" values="0.6;0" dur="0.6s" begin="0.7s" repeatCount="indefinite" />
              <animateMotion dur="1.5s" begin="0.7s" repeatCount="indefinite" path={isPublic ? PATHS.publicToResponse : PATHS.privateToResponse} />
            </circle>
            {/* Dot 3: Endpoint→Response */}
            <circle r={3.5} fill={routeColor} filter={routeGlow}>
              <animateMotion dur="1.5s" begin="0.7s" repeatCount="indefinite" path={isPublic ? PATHS.publicToResponse : PATHS.privateToResponse} />
            </circle>
          </g>
        )}

        {/* ── ENERGY BEACON on Router ──────────────────────── */}
        <circle cx={NODES.router.cx} cy={NODES.router.cy} r={28} fill="none" stroke="var(--color-accent)" strokeWidth={1} opacity={0.3}>
          <animate attributeName="r" values="28;38;28" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* ── GLOW BURST on Active Endpoint Node ───────────── */}
        {(isPublic || isPrivate) && (
          <circle
            cx={isPublic ? NODES.public.cx : NODES.private.cx}
            cy={isPublic ? NODES.public.cy : NODES.private.cy}
            r={22}
            fill="none"
            stroke={routeColor}
            strokeWidth={1.5}
            opacity={0.2}
          >
            <animate attributeName="r" values="22;32;22" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0;0.2" dur="2.5s" repeatCount="indefinite" />
          </circle>
        )}

        {/* ── RESPONSE NODE PULSE BEACON ────────────────────── */}
        {isActive && (
          <circle cx={NODES.response.cx} cy={NODES.response.cy} r={22} fill="none" stroke={routeColor} strokeWidth={1} opacity={0.2}>
            <animate attributeName="r" values="22;30;22" dur="2s" begin="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" begin="1s" repeatCount="indefinite" />
          </circle>
        )}

        {/* ── NODES ────────────────────────────────────────── */}

        {/* Browser Input */}
        <rect
          x={NODES.input.x} y={NODES.input.y}
          width={NODES.input.w} height={NODES.input.h}
          rx={17} ry={17}
          fill="var(--color-bg-card)"
          stroke={isActive ? routeColor : "var(--color-border-default)"}
          strokeWidth={1.5}
          style={{ filter: isActive ? routeGlow : "none", transition: "stroke 300ms, filter 300ms" }}
        />
        <text x={NODES.input.cx} y={NODES.input.cy + 1} fill="var(--color-text-secondary)" fontSize={11} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central" fontWeight={500}>
          Browser Input
        </text>

        {/* Hybrid Router */}
        <rect
          x={NODES.router.x} y={NODES.router.y}
          width={NODES.router.w} height={NODES.router.h}
          rx={22} ry={22}
          fill="var(--color-bg-card)"
          stroke={isActive ? "var(--color-accent)" : "var(--color-border-default)"}
          strokeWidth={1.5}
          style={{
            filter: isActive ? "drop-shadow(0 0 8px var(--color-accent-glow))" : "none",
            transition: "stroke 300ms, filter 300ms",
          }}
        />
        <text x={NODES.router.cx} y={NODES.router.cy - 1} fill="var(--color-text-primary)" fontSize={12} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central" fontWeight={600}>
          GreatAegis
        </text>
        <text x={NODES.router.cx} y={NODES.router.cy + 12} fill="var(--color-text-muted)" fontSize={9} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central">
          Hybrid Router
        </text>

        {/* Public Endpoint */}
        <rect
          x={NODES.public.x} y={NODES.public.y}
          width={NODES.public.w} height={NODES.public.h}
          rx={19} ry={19}
          fill={isPublic ? "rgba(0, 230, 118, 0.06)" : "var(--color-bg-card)"}
          stroke={isPublic ? "#00E676" : "var(--color-border-default)"}
          strokeWidth={1.5}
          style={{ filter: isPublic ? "drop-shadow(0 0 8px #00E67666)" : "none", transition: "fill 300ms, stroke 300ms, filter 300ms" }}
        />
        <text x={NODES.public.cx} y={NODES.public.cy - 1} fill={isPublic ? "#00E676" : "var(--color-text-secondary)"} fontSize={11} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central" fontWeight={500}>
          Fireworks AI API
        </text>
        <text x={NODES.public.cx} y={NODES.public.cy + 12} fill={isPublic ? "#00E676CC" : "var(--color-text-muted)"} fontSize={9} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central">
          Public Endpoint
        </text>

        {/* Private Engine */}
        <rect
          x={NODES.private.x} y={NODES.private.y}
          width={NODES.private.w} height={NODES.private.h}
          rx={19} ry={19}
          fill={isPrivate ? "rgba(0, 204, 102, 0.06)" : "var(--color-bg-card)"}
          stroke={isPrivate ? "#00CC66" : "var(--color-border-default)"}
          strokeWidth={1.5}
          style={{ filter: isPrivate ? "drop-shadow(0 0 8px #00CC6666)" : "none", transition: "fill 300ms, stroke 300ms, filter 300ms" }}
        />
        <text x={NODES.private.cx} y={NODES.private.cy - 1} fill={isPrivate ? "#00CC66" : "var(--color-text-secondary)"} fontSize={11} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central" fontWeight={500}>
          GLM 5.2
        </text>
        <text x={NODES.private.cx} y={NODES.private.cy + 12} fill={isPrivate ? "#00CC66CC" : "var(--color-text-muted)"} fontSize={9} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central">
          AMD Instinct™ Pod
        </text>

        {/* Gateway Response */}
        <rect
          x={NODES.response.x} y={NODES.response.y}
          width={NODES.response.w} height={NODES.response.h}
          rx={17} ry={17}
          fill="var(--color-bg-card)"
          stroke={isActive ? routeColor : "var(--color-border-default)"}
          strokeWidth={1.5}
          style={{ filter: isActive ? routeGlow : "none", transition: "stroke 300ms, filter 300ms" }}
        />
        <text x={NODES.response.cx} y={NODES.response.cy + 1} fill="var(--color-text-secondary)" fontSize={11} fontFamily="Inter, sans-serif" textAnchor="middle" dominantBaseline="central" fontWeight={500}>
          Gateway Response
        </text>
      </svg>

      {/* ── Status footer ──────────────────────────────────────── */}
      {isActive && (
        <div
          className="flex items-center justify-between mt-2 pt-2 relative z-10 animate-slide-up"
          style={{ borderTop: "1px solid var(--color-border-light)" }}
        >
          <div className="flex items-center gap-1.5">
            <Activity size={10} style={{ color: routeColor }} />
            <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              Route:{" "}
              <span style={{ color: routeColor, fontWeight: 600 }}>
                {demoMode === "casual"
                  ? "Public"
                  : demoMode === "sovereign"
                    ? "Private"
                    : demoMode === "fallback"
                      ? "Fallback Tunnel"
                      : isPublic
                        ? "Public"
                        : "Private"}
              </span>
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Risk: {riskScore} — {classification}
          </span>
          {(isPrivate || demoMode === "sovereign" || demoMode === "fallback") && (
            <span className="text-[10px]" style={{ color: demoMode === "fallback" ? "var(--color-warning)" : "var(--color-accent)" }}>
              {demoMode === "fallback" ? "End-to-End Encrypted" : "ML-KEM Encrypted"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
