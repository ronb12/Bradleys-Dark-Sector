import {
  badgeLabel,
  RANGE_BADGE_THRESHOLDS,
  type RangeBadgeId,
  type RangeChallengeResult,
} from "../game/shootingRange";

const BADGE_STYLES: Record<
  Exclude<RangeBadgeId, "unqualified">,
  { ring: string; fill: string; accent: string; metal: string }
> = {
  marksman: {
    ring: "#6b7c5a",
    fill: "#1a2218",
    accent: "#a8b896",
    metal: "#8a9a78",
  },
  sharpshooter: {
    ring: "#9a7a3a",
    fill: "#1e1a12",
    accent: "#d4b45c",
    metal: "#c9a227",
  },
  expert: {
    ring: "#8a4a3a",
    fill: "#1c1210",
    accent: "#e8a070",
    metal: "#c45c28",
  },
};

function BadgeMedallion({
  badge,
  earned,
  size = 56,
}: {
  badge: Exclude<RangeBadgeId, "unqualified">;
  earned: boolean;
  size?: number;
}) {
  const c = BADGE_STYLES[badge];
  const opacity = earned ? 1 : 0.28;
  const label = RANGE_BADGE_THRESHOLDS[badge].label;
  const chevrons = badge === "expert" ? 3 : badge === "sharpshooter" ? 2 : 1;

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid={`range-badge-${badge}`}
      data-earned={earned ? "true" : "false"}
      title={`${label}${earned ? " — earned" : " — locked"}`}
      style={{ opacity }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`rmetal-${badge}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c.metal} stopOpacity="0.95" />
            <stop offset="55%" stopColor={c.accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={c.ring} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={c.fill} stroke={`url(#rmetal-${badge})`} strokeWidth="2.5" />
        <circle cx="32" cy="32" r="24" fill="none" stroke={c.ring} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
        {/* Crosshair / rifle mark */}
        <line x1="32" y1="14" x2="32" y2="22" stroke={c.accent} strokeWidth="1.5" />
        <line x1="32" y1="42" x2="32" y2="50" stroke={c.accent} strokeWidth="1.5" />
        <line x1="14" y1="32" x2="22" y2="32" stroke={c.accent} strokeWidth="1.5" />
        <line x1="42" y1="32" x2="50" y2="32" stroke={c.accent} strokeWidth="1.5" />
        <circle cx="32" cy="32" r="4" fill="none" stroke={c.accent} strokeWidth="1.4" />
        {/* Rank chevrons */}
        {Array.from({ length: chevrons }).map((_, i) => {
          const y = 52 - i * 4;
          return (
            <path
              key={i}
              d={`M22 ${y} L32 ${y - 5} L42 ${y}`}
              fill="none"
              stroke={c.metal}
              strokeWidth="1.6"
              strokeLinecap="square"
            />
          );
        })}
      </svg>
      <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-300">{label}</span>
    </div>
  );
}

export function RangeBadgeRow({
  unlocked,
  highest,
  compact = false,
}: {
  unlocked: Exclude<RangeBadgeId, "unqualified">[];
  highest: RangeBadgeId;
  compact?: boolean;
}) {
  const earned = new Set(unlocked);
  if (highest !== "unqualified") earned.add(highest);
  const size = compact ? 40 : 52;

  return (
    <div
      className={`flex items-end justify-center gap-3 ${compact ? "gap-2" : ""}`}
      data-testid="range-badge-row"
      data-highest={highest}
    >
      {(["marksman", "sharpshooter", "expert"] as const).map((id) => (
        <BadgeMedallion key={id} badge={id} earned={earned.has(id)} size={size} />
      ))}
    </div>
  );
}

export function RangeChallengeResultCard({
  result,
  onDismiss,
}: {
  result: RangeChallengeResult;
  onDismiss: () => void;
}) {
  const pass = result.passed;
  const badgeName = badgeLabel(result.badge);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      data-testid="range-result-panel"
      data-passed={pass ? "true" : "false"}
      data-badge={result.badge}
    >
      <div className="w-full max-w-md border border-amber-200/35 bg-[#0a0e0a]/95 shadow-[0_24px_80px_rgba(0,0,0,.75)]">
        <div className="flex items-center justify-between border-b border-slate-500/30 px-4 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400">
            After-Action Report · 30s Qual
          </div>
          <div
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${pass ? "text-emerald-300" : "text-rose-300"}`}
            data-testid="range-result-verdict"
          >
            {pass ? "PASS" : "FAIL"}
          </div>
        </div>

        <div className="px-5 py-5 text-center">
          <div
            className={`text-3xl font-black uppercase tracking-[0.08em] ${pass ? "text-emerald-100" : "text-rose-100"}`}
            data-testid="range-result-badge"
          >
            {badgeName}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Qualification badge
          </div>

          <div className="mt-5 flex justify-center">
            <RangeBadgeRow unlocked={result.unlockedBadges} highest={result.highestBadge} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border border-slate-500/25 bg-black/40 px-3 py-3 text-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Score</div>
              <div className="mt-1 text-xl font-black text-cyan-100" data-testid="range-result-score">
                {result.score}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Accuracy</div>
              <div className="mt-1 text-xl font-black text-amber-100" data-testid="range-result-accuracy">
                {result.accuracy.toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Best</div>
              <div className="mt-1 text-xl font-black text-slate-100" data-testid="range-result-best">
                {result.bestScore}
              </div>
            </div>
          </div>

          <div className="mt-3 text-[10px] text-slate-500">
            Hits {result.hits} · Misses {result.misses} · Shots {result.shots}
          </div>

          {!pass ? (
            <div className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Marksman requires ≥{RANGE_BADGE_THRESHOLDS.marksman.minScore} score and ≥
              {RANGE_BADGE_THRESHOLDS.marksman.minAccuracy}% accuracy.
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-500/30 px-4 py-3">
          <button
            type="button"
            data-testid="range-result-dismiss"
            onClick={onDismiss}
            className="w-full border border-emerald-300/50 bg-emerald-950/60 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100 transition hover:bg-emerald-900/80"
          >
            Continue Practice
          </button>
        </div>
      </div>
    </div>
  );
}
