import type { AppMode } from "../store";

function HeroIllustration() {
  return (
    <svg
      className="hero-illo"
      viewBox="0 0 480 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f232c" />
          <stop offset="100%" stopColor="#0f1115" />
        </linearGradient>
        <linearGradient id="routeA" x1="0" x2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="routeB" x1="0" x2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="480" height="320" fill="url(#bgGrad)" rx="14" />
      <g stroke="#2a2f3a" fill="none" strokeWidth="1">
        <path d="M0 80 Q 120 60, 240 90 T 480 80" />
        <path d="M0 130 Q 120 110, 240 140 T 480 130" />
        <path d="M0 180 Q 120 160, 240 190 T 480 180" />
        <path d="M0 230 Q 120 210, 240 240 T 480 230" />
      </g>
      <path
        d="M40 250 Q 100 180, 160 190 T 280 140 Q 340 110, 380 70 L 440 60"
        stroke="url(#routeA)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        d="M40 260 Q 110 220, 170 210 T 290 160 Q 350 130, 400 100 L 440 90"
        stroke="url(#routeB)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <circle cx="280" cy="140" r="10" fill="#f97316" stroke="#fff" strokeWidth="2.5" />
      <circle cx="240" cy="185" r="10" fill="#3b82f6" stroke="#fff" strokeWidth="2.5" />
      <line x1="280" y1="140" x2="240" y2="185" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.5" />
      <g transform="translate(300, 200)">
        <rect width="130" height="44" rx="8" fill="#171a21" stroke="#2a2f3a" />
        <text x="12" y="18" fill="#8e94a0" fontSize="9" fontFamily="system-ui" fontWeight="500">Δ DISTANCE · Δ TIME</text>
        <text x="12" y="35" fill="#e6e8eb" fontSize="13" fontFamily="system-ui" fontWeight="600">+0.42 km · +1:23</text>
      </g>
    </svg>
  );
}

function PlanIllustration() {
  return (
    <svg
      className="hero-illo"
      viewBox="0 0 480 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bgGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f232c" />
          <stop offset="100%" stopColor="#0f1115" />
        </linearGradient>
        <filter id="glow2">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="480" height="320" fill="url(#bgGrad2)" rx="14" />
      <g stroke="#2a2f3a" fill="none" strokeWidth="1">
        <path d="M0 80 Q 120 60, 240 90 T 480 80" />
        <path d="M0 150 Q 120 130, 240 160 T 480 150" />
        <path d="M0 220 Q 120 200, 240 230 T 480 220" />
        <path d="M0 290 Q 120 270, 240 300 T 480 290" />
      </g>
      <path d="M40 260 Q 80 230, 120 200" stroke="#ef4444" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#glow2)" />
      <path d="M120 200 Q 160 170, 200 180" stroke="#9ca3af" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M200 180 Q 240 190, 280 160" stroke="#9ca3af" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M280 160 Q 340 120, 420 80" stroke="#22c55e" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#glow2)" />
      <g opacity="0.7">
        <line x1="80" y1="120" x2="80" y2="150" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="80,110 74,125 86,125" fill="#facc15" />
        <line x1="200" y1="100" x2="200" y2="130" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="200,90 194,105 206,105" fill="#facc15" />
        <line x1="340" y1="100" x2="340" y2="130" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="340,90 334,105 346,105" fill="#facc15" />
      </g>
      <circle cx="40" cy="260" r="7" fill="#22c55e" stroke="#fff" strokeWidth="2" />
      <circle cx="420" cy="80" r="7" fill="#ef4444" stroke="#fff" strokeWidth="2" />
      <g transform="translate(30, 40)">
        <rect width="150" height="50" rx="8" fill="#171a21" stroke="#2a2f3a" />
        <text x="12" y="18" fill="#8e94a0" fontSize="9" fontFamily="system-ui" fontWeight="500">WIND ANALYSIS</text>
        <text x="12" y="36" fill="#e6e8eb" fontSize="12" fontFamily="system-ui" fontWeight="600">42 km headwind</text>
      </g>
    </svg>
  );
}

export function LandingPage({ onSelectMode }: { onSelectMode: (m: AppMode) => void }) {
  return (
    <div className="landing landing--picker">
      <div className="landing-header">
        <h1 className="landing-title">Slipstream</h1>
        <p className="landing-subtitle">Cycling tools for athletes who want to go faster</p>
      </div>

      <div className="landing-cards">
        <button className="landing-card" onClick={() => onSelectMode("plan")}>
          <div className="landing-card-illo">
            <PlanIllustration />
          </div>
          <div className="landing-card-body">
            <div className="landing-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>
                <path d="M5 17C5 10 10 7 19 7"/>
              </svg>
            </div>
            <h2 className="landing-card-title">Plan a route</h2>
            <p className="landing-card-desc">
              Upload a GPX or FIT route, set your departure time, and see every segment coloured by headwind and tailwind. Get a realistic ETA with wind and elevation factored in.
            </p>
            <span className="landing-card-cta">
              Open route planner
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </button>

        <button className="landing-card" onClick={() => onSelectMode("compare")}>
          <div className="landing-card-illo">
            <HeroIllustration />
          </div>
          <div className="landing-card-body">
            <div className="landing-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h2 className="landing-card-title">Analyze & compare</h2>
            <p className="landing-card-desc">
              Drop one file to analyze a ride — speed, power, heart rate, elevation, and splits. Drop two files to replay them side-by-side and see exactly where time was won or lost.
            </p>
            <span className="landing-card-cta">
              Open analyzer
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </button>
      </div>

      <footer className="landing-footer">
        <span>No account needed. Files stay in your browser — nothing is uploaded.</span>
      </footer>
    </div>
  );
}
