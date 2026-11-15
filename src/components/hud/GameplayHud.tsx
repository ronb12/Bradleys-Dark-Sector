import { badgeLabel, type RangeBadgeId } from "../../game/shootingRange";
import { RangeBadgeRow } from "../RangeQualificationBadges";
import { WEAPONS, type WeaponId } from "../../game/weapons";

type GameMode = "solo" | "pvp" | "range";

export type GameplayHudData = {
  health: number;
  maxHealth: number;
  ammo: number | string;
  activeWeapon: WeaponId;
  m4Ammo: number;
  smgAmmo: number;
  pistolAmmo: number;
  grenades: number;
  score: number;
  enemies: number;
  wave: number;
  objective: string;
  intel: string;
  streak: number;
  bestStreak: number;
  sessionKills: number;
  medkits: number;
  missionTime: string;
  gameMode: GameMode;
  kills: number;
  deaths: number;
  pvpPlayers: number;
  pvpStatus: string;
  missionTitle: string;
  missionProgress: number;
  rank: string;
  difficulty: string;
  crouching: boolean;
  aiming: boolean;
  rangeHits: number;
  rangeMisses: number;
  rangeShots: number;
  rangeAccuracy: number;
  rangeDistance: number;
  rangeChallengeActive: boolean;
  rangeChallengeScore: number;
  rangeBestScore: number;
  rangeHighestBadge: RangeBadgeId;
  rangeUnlockedBadges: Exclude<RangeBadgeId, "unqualified">[];
};

type GameplayHudProps = {
  hud: GameplayHudData;
  pvpRoom: string;
  touchDevice: boolean;
  reduceMotion: boolean;
};

const panel =
  "overflow-hidden border border-[#87917b]/25 bg-[linear-gradient(135deg,rgba(13,18,15,.94),rgba(5,8,7,.82))] shadow-[0_12px_34px_rgba(0,0,0,.5),inset_0_1px_rgba(210,220,190,.04)] backdrop-blur-sm before:absolute before:left-0 before:top-0 before:h-px before:w-12 before:bg-[#b7c49a]/45 after:absolute after:bottom-0 after:right-0 after:h-px after:w-8 after:bg-[#c1a45b]/35";
const label = "text-[10px] font-bold uppercase tracking-[0.16em] text-[#b1c4be]";

function ModeSummary({ hud, pvpRoom, compact = false }: Pick<GameplayHudProps, "hud" | "pvpRoom"> & { compact?: boolean }) {
  if (hud.gameMode === "pvp") {
    const linked = hud.pvpStatus === "open" || hud.pvpStatus === "connected";
    return (
      <>
        <div className="flex items-center gap-2">
          <strong className={`${compact ? "text-xs" : "text-sm"} font-black tracking-[0.08em] text-amber-100`}>PVP</strong>
          <span className="border-l border-slate-500/40 pl-2 font-mono text-xs text-slate-100">
            {hud.kills}K / {hud.deaths}D
          </span>
        </div>
        <div className={`mt-1 truncate text-[9px] uppercase tracking-[0.14em] text-slate-400 ${compact ? "max-w-[28vw]" : ""}`}>
          {hud.pvpPlayers} linked · {pvpRoom} · <span className={linked ? "text-emerald-200" : "text-amber-200"}>{linked ? "network ready" : hud.pvpStatus}</span>
        </div>
      </>
    );
  }

  if (hud.gameMode === "range") {
    return (
      <>
        <div className="flex items-baseline gap-2">
          <strong className={`${compact ? "text-xs" : "text-sm"} font-black tracking-[0.08em] text-emerald-100`} data-testid="range-hud-title">RANGE</strong>
          <span className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {hud.rangeChallengeActive ? "Qualification live" : badgeLabel(hud.rangeHighestBadge)}
          </span>
        </div>
        <div className="mt-1 flex gap-3 font-mono text-[10px] text-slate-200" data-testid="range-hits">
          <span><b className="text-cyan-100">{hud.rangeHits}</b> hits</span>
          <span>{hud.rangeMisses} miss</span>
          <span><b className="text-amber-100">{hud.rangeAccuracy.toFixed(0)}%</b> acc</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-baseline gap-2">
        <strong className={`${compact ? "text-xs" : "text-sm"} font-black tracking-[0.08em] text-[#d7dfc5]`}>WAVE {String(hud.wave).padStart(2, "0")}</strong>
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-100/75">{hud.enemies} hostiles</span>
      </div>
      {!compact ? (
        <>
          <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-slate-400">
            {hud.missionTitle} · {hud.rank} · {hud.difficulty}
          </div>
          <div className="mt-1.5 flex items-baseline gap-3 font-mono text-[10px]">
            <span className="text-[#e5ead9]"><b className="text-sm text-white">{hud.score.toLocaleString()}</b> pts</span>
            <span className={hud.streak >= 5 ? "text-orange-300" : hud.streak >= 3 ? "text-amber-200" : "text-slate-300"}>
              ×{hud.streak} streak
            </span>
            <span className="text-rose-200/85">{hud.sessionKills} kills</span>
          </div>
        </>
      ) : null}
    </>
  );
}

function WeaponStatus({ hud, reduceMotion }: Pick<GameplayHudProps, "hud" | "reduceMotion">) {
  const reloading = hud.ammo === "RELOAD";
  const empty = hud.ammo === 0;
  return (
    <div className={`${panel} relative min-w-[194px] max-w-[248px] border-r-2 border-r-[#33ced5]/80 px-3 py-2.5 text-right`}>
      <div className="flex items-center justify-end gap-2">
        {hud.aiming ? <span className="border border-amber-200/35 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-amber-100">ADS</span> : null}
        <span className={label}>{WEAPONS[hud.activeWeapon].name}</span>
      </div>
      <div className="mt-0.5 flex items-end justify-end gap-2">
        <span className={`font-mono text-3xl font-black leading-none drop-shadow-[0_1px_1px_#000] ${reloading ? `text-amber-200 ${reduceMotion ? "" : "animate-pulse"}` : empty ? "text-rose-300" : "text-[#e5ead9]"}`}>
          {hud.ammo}
        </span>
        {!reloading ? <span className="pb-0.5 text-[9px] uppercase tracking-wider text-slate-500">in mag</span> : null}
      </div>
      <div className="mt-2 flex justify-end gap-3 font-mono text-[9px]">
        <span className={hud.activeWeapon === "m4" ? "text-[#c7f4f6]" : "text-slate-400"}>1 · {WEAPONS.m4.shortName} {hud.m4Ammo}/30</span>
        <span className={hud.activeWeapon === "smg" ? "text-[#c7f4f6]" : "text-slate-400"}>2 · {WEAPONS.smg.shortName} {hud.smgAmmo}/36</span>
        <span className={hud.activeWeapon === "pistol" ? "text-[#c7f4f6]" : "text-slate-400"}>3 · {WEAPONS.pistol.shortName} {hud.pistolAmmo}/15</span>
      </div>
      <div className="mt-1 text-[8px] uppercase tracking-[0.15em] text-slate-500">
        {reloading ? "Reloading — weapon unavailable" : `1 / 2 / 3 / Q · swap · G frag ×${hud.grenades}`}
      </div>
    </div>
  );
}

function VitalStatus({ hud, reduceMotion }: Pick<GameplayHudProps, "hud" | "reduceMotion">) {
  const hpPct = Math.round((hud.health / Math.max(1, hud.maxHealth)) * 100);
  const critical = hpPct <= 25;
  const damaged = hpPct <= 55;
  const color = critical ? "bg-rose-400" : damaged ? "bg-amber-300" : "bg-emerald-300";
  return (
    <div
      className={`${panel} relative w-[200px] max-w-full border-l-2 ${critical ? `border-l-rose-400 ${reduceMotion ? "" : "animate-pulse"}` : damaged ? "border-l-amber-300" : "border-l-emerald-300"} px-3 py-2.5`}
      aria-label={`Armor integrity ${hpPct} percent${critical ? ", critical" : damaged ? ", damaged" : ", stable"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={label}>{hud.gameMode === "range" ? "Range safety" : "Armor integrity"}</span>
        <span className={`text-[9px] font-black uppercase tracking-wider ${critical ? "text-rose-200" : damaged ? "text-amber-100" : "text-emerald-100"}`}>
          {critical ? "Critical" : damaged ? "Damaged" : hud.gameMode === "range" ? "Safe" : "Stable"}
        </span>
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-mono text-2xl font-black leading-none text-white">{hpPct}</span>
        <span className="pb-0.5 text-[9px] text-slate-500">%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${hpPct}%` }} />
      </div>
      {hud.gameMode === "solo" ? (
        <div className="mt-2 flex gap-3 font-mono text-[9px] uppercase tracking-wider text-slate-400">
          <span className="text-rose-200/90">Med ×{hud.medkits}</span>
          <span className="text-amber-100/85">Frag ×{hud.grenades}</span>
        </div>
      ) : null}
    </div>
  );
}

function PerformancePanel({ hud, reduceMotion }: Pick<GameplayHudProps, "hud" | "reduceMotion">) {
  const liveStreak = hud.streak;
  const hot = liveStreak >= 3;
  const onFire = liveStreak >= 5;
  const unstoppable = liveStreak >= 8;
  const streakLabel = unstoppable
    ? "UNSTOPPABLE"
    : onFire
      ? "ON FIRE"
      : hot
        ? "HOT STREAK"
        : liveStreak > 0
          ? "STREAK"
          : "READY";
  const streakTone = unstoppable
    ? "text-rose-300"
    : onFire
      ? "text-orange-300"
      : hot
        ? "text-amber-200"
        : "text-[#d7dfc5]";

  if (hud.gameMode === "range") {
    return (
      <div className={`${panel} relative min-w-[200px] max-w-[280px] border-r-2 border-r-emerald-300/55 px-3 py-2.5 text-right`}>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 text-left">
            <div className={label}>Course score</div>
            <div className="mt-0.5 font-mono text-3xl font-black leading-none text-emerald-100" data-testid="range-score">
              {hud.score}
            </div>
            <div className="mt-1.5 flex gap-2.5 font-mono text-[9px] text-slate-300">
              <span>{hud.rangeShots} shots</span>
              <span>{hud.rangeAccuracy.toFixed(0)}% acc</span>
            </div>
            <div className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-500">Best {hud.rangeBestScore}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className={label}>{hud.rangeChallengeActive ? "Challenge" : "Op timer"}</div>
            <div className="mt-1 font-mono text-xl font-black leading-none text-[#d7dfc5]">{hud.missionTime}</div>
          </div>
        </div>
      </div>
    );
  }

  if (hud.gameMode === "pvp") {
    return (
      <div className={`${panel} relative min-w-[200px] max-w-[280px] border-r-2 border-r-amber-200/55 px-3 py-2.5 text-right`}>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 text-left">
            <div className={label}>Combat board</div>
            <div className="mt-0.5 flex items-baseline gap-2 font-mono">
              <span className="text-3xl font-black leading-none text-amber-100">{hud.kills}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">kills</span>
              <span className="text-xl font-black text-slate-400">{hud.deaths}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">deaths</span>
            </div>
            <div className="mt-1.5 text-[8px] uppercase tracking-wider text-slate-500">
              {hud.pvpPlayers} linked · streak {liveStreak}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={label}>Op timer</div>
            <div className="mt-1 font-mono text-xl font-black leading-none text-[#d7dfc5]">{hud.missionTime}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${panel} relative min-w-[220px] max-w-[300px] border-r-2 ${onFire ? "border-r-orange-400/70" : hot ? "border-r-amber-300/65" : "border-r-[#b7c49a]/55"} px-3 py-2.5 text-right`}
      data-hud-zone="scoreboard"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className={label}>Scoreboard</span>
            <span
              className={`text-[8px] font-black uppercase tracking-[0.16em] ${streakTone} ${onFire && !reduceMotion ? "animate-pulse" : ""}`}
            >
              {streakLabel}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[2rem] font-black leading-none tracking-tight text-[#f2f5ea] drop-shadow-[0_1px_2px_#000]">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[9px]">
            <div>
              <div className="text-[7px] uppercase tracking-wider text-slate-500">Streak</div>
              <div className={`text-sm font-black ${streakTone}`}>{liveStreak}</div>
            </div>
            <div>
              <div className="text-[7px] uppercase tracking-wider text-slate-500">Best</div>
              <div className="text-sm font-black text-slate-200">{hud.bestStreak}</div>
            </div>
            <div>
              <div className="text-[7px] uppercase tracking-wider text-slate-500">Kills</div>
              <div className="text-sm font-black text-rose-200/90">{hud.sessionKills}</div>
            </div>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden bg-slate-800/90" aria-hidden>
            <div
              className={`h-full ${unstoppable ? "bg-rose-400" : onFire ? "bg-orange-400" : hot ? "bg-amber-300" : "bg-[#b7c49a]/70"}`}
              style={{ width: `${Math.min(100, liveStreak * 12.5)}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={label}>Op timer</div>
          <div className="mt-1 font-mono text-xl font-black leading-none text-[#d7dfc5]">{hud.missionTime}</div>
          <div className="mt-2 text-[8px] uppercase tracking-wider text-slate-500">
            Wave {String(hud.wave).padStart(2, "0")} · {hud.enemies} live
          </div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate-500">
            Med ×{hud.medkits} · Frag ×{hud.grenades}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileHud({ hud, pvpRoom, reduceMotion }: Omit<GameplayHudProps, "touchDevice">) {
  const hpPct = Math.round((hud.health / Math.max(1, hud.maxHealth)) * 100);
  const critical = hpPct <= 25;
  const reloading = hud.ammo === "RELOAD";
  const showMissionStrip = hud.gameMode !== "range" || hud.rangeChallengeActive;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 grid grid-rows-[auto_auto_1fr] gap-1.5 overflow-x-hidden px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))]"
      data-testid="gameplay-hud"
      data-hud-layout="mobile"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div
          className={`${panel} relative min-w-0 max-w-[46vw] border-l-2 border-l-[#b7c49a]/65 px-2 py-1.5 landscape:max-w-[36vw]`}
          data-hud-zone="mode"
        >
          <ModeSummary hud={hud} pvpRoom={pvpRoom} compact />
        </div>
        <div
          className={`${panel} relative flex shrink-0 items-center gap-2.5 border-r-2 ${critical ? "border-r-rose-400" : "border-r-emerald-300"} px-2 py-1.5 text-right`}
          data-hud-zone="vitals"
        >
          <div>
            <div className={label}>Armor</div>
            <div className={`font-mono text-sm font-black ${critical ? `text-rose-200 ${reduceMotion ? "" : "animate-pulse"}` : "text-emerald-100"}`}>{hud.health}%</div>
          </div>
          <div className="border-l border-slate-500/30 pl-2.5">
            <div className={label}>{WEAPONS[hud.activeWeapon].shortName}</div>
            <div className={`font-mono text-sm font-black ${reloading ? "text-amber-200" : "text-[#e5ead9]"}`}>{hud.ammo}</div>
          </div>
          <div className="border-l border-slate-500/30 pl-2.5">
            <div className={label}>Frag</div>
            <div className="font-mono text-sm font-black text-amber-100">×{hud.grenades}</div>
          </div>
        </div>
      </div>

      {showMissionStrip ? (
        <div
          className={`${panel} relative mx-auto w-full max-w-[min(72vw,28rem)] border-t-2 border-t-amber-200/45 px-2.5 py-1 text-center landscape:max-w-[min(48vw,22rem)]`}
          data-hud-zone="mission"
        >
          <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-100">{hud.objective}</div>
          <div className="mt-0.5 flex items-center justify-center gap-2.5 font-mono text-[8px] text-slate-400 landscape:gap-2">
            <span>{hud.missionTime}</span>
            {hud.gameMode === "range" ? (
              <span>{hud.rangeAccuracy.toFixed(0)}% ACC</span>
            ) : hud.gameMode === "pvp" ? (
              <span>{hud.kills}K / {hud.deaths}D</span>
            ) : (
              <>
                <span className="text-[#e5ead9]">{hud.score.toLocaleString()} PTS</span>
                <span className={hud.streak >= 5 ? "text-orange-300" : hud.streak >= 3 ? "text-amber-200" : ""}>
                  ×{hud.streak}
                </span>
                <span className="text-rose-200/80">{hud.sessionKills}K</span>
              </>
            )}
            {hud.crouching ? <span className="text-[#cbd6b4]">CROUCH</span> : null}
          </div>
        </div>
      ) : null}

      {/* Center stays empty so the crosshair is never covered by HUD clusters. */}
      <div aria-hidden className="min-h-0" />
    </div>
  );
}

export function GameplayHud({ hud, pvpRoom, touchDevice, reduceMotion }: GameplayHudProps) {
  if (touchDevice) {
    return <MobileHud hud={hud} pvpRoom={pvpRoom} reduceMotion={reduceMotion} />;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 grid grid-rows-[auto_1fr_auto] gap-3 overflow-x-hidden p-4"
      data-testid="gameplay-hud"
      data-hud-layout="desktop"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-3">
        <div
          className={`${panel} relative min-w-0 max-w-[17.5rem] justify-self-start border-l-2 border-l-[#b7c49a]/65 px-3 py-2.5`}
          data-hud-zone="mode"
        >
          <div className="mb-1 flex items-center gap-2 text-[7px] font-bold uppercase tracking-[0.28em] text-[#aab69b]/65">
            <span className="h-1 w-1 shrink-0 bg-[#b7c49a]" /> Dark Sector · Tactical Link
          </div>
          <ModeSummary hud={hud} pvpRoom={pvpRoom} />
          {hud.gameMode === "range" ? (
            <div className="mt-2 border-t border-slate-400/15 pt-1.5">
              <RangeBadgeRow unlocked={hud.rangeUnlockedBadges} highest={hud.rangeHighestBadge} compact />
            </div>
          ) : null}
        </div>

        <div
          className={`${panel} relative min-w-0 max-w-[26rem] justify-self-center border-t-2 border-t-amber-200/45 px-3 py-2 text-center`}
          data-hud-zone="mission"
        >
          <div className={label}>{hud.gameMode === "range" ? "Range control" : "Mission directive"}</div>
          <div className="mt-1 line-clamp-1 text-[12px] font-bold text-slate-100">{hud.objective}</div>
          <div className="mt-0.5 line-clamp-1 text-[9px] text-slate-400">{hud.intel}</div>
          {hud.missionProgress > 0 && hud.missionProgress < 1 && hud.gameMode !== "range" ? (
            <div className="mx-auto mt-2 h-0.5 w-36 overflow-hidden bg-slate-800" aria-label={`Objective ${Math.round(hud.missionProgress * 100)} percent complete`}>
              <div className="h-full bg-amber-300" style={{ width: `${Math.round(hud.missionProgress * 100)}%` }} />
            </div>
          ) : null}
        </div>

        <div className="justify-self-end" data-hud-zone="weapon">
          <WeaponStatus hud={hud} reduceMotion={reduceMotion} />
        </div>
      </div>

      {/* Keep the middle row empty — crosshair / ADS live here. */}
      <div aria-hidden className="min-h-0" />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        <div className="justify-self-start" data-hud-zone="vitals">
          <VitalStatus hud={hud} reduceMotion={reduceMotion} />
        </div>
        <div className="justify-self-end" data-hud-zone="performance">
          <PerformancePanel hud={hud} reduceMotion={reduceMotion} />
        </div>
      </div>
    </div>
  );
}
