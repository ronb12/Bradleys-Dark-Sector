import { badgeLabel, type RangeBadgeId } from "../../game/shootingRange";
import { RangeBadgeRow } from "../RangeQualificationBadges";
import { WEAPONS, type WeaponId } from "../../game/weapons";

type GameMode = "solo" | "pvp" | "range";

export type GameplayHudData = {
  health: number;
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
const label = "text-[8px] font-bold uppercase tracking-[0.22em] text-[#8f9988]";

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
        <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-slate-400">
          {hud.missionTitle} · {hud.rank} · {hud.difficulty}
        </div>
      ) : null}
    </>
  );
}

function WeaponStatus({ hud, reduceMotion }: Pick<GameplayHudProps, "hud" | "reduceMotion">) {
  const reloading = hud.ammo === "RELOAD";
  const empty = hud.ammo === 0;
  return (
    <div className={`${panel} relative min-w-[170px] max-w-[220px] border-r-2 border-r-[#b7c49a]/70 px-3 py-2.5 text-right`}>
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
        <span className={hud.activeWeapon === "m4" ? "text-[#cbd6b4]" : "text-slate-500"}>1 · M4 {hud.m4Ammo}/30</span>
        <span className={hud.activeWeapon === "smg" ? "text-[#cbd6b4]" : "text-slate-500"}>2 · VX9 {hud.smgAmmo}/36</span>
        <span className={hud.activeWeapon === "pistol" ? "text-[#cbd6b4]" : "text-slate-500"}>3 · PST {hud.pistolAmmo}/15</span>
      </div>
      <div className="mt-1 text-[8px] uppercase tracking-[0.15em] text-slate-500">
        {reloading ? "Reloading — weapon unavailable" : `1 / 2 / 3 / Q · swap · G frag ×${hud.grenades}`}
      </div>
    </div>
  );
}

function VitalStatus({ hud, reduceMotion }: Pick<GameplayHudProps, "hud" | "reduceMotion">) {
  const critical = hud.health <= 25;
  const damaged = hud.health <= 55;
  const color = critical ? "bg-rose-400" : damaged ? "bg-amber-300" : "bg-emerald-300";
  return (
    <div
      className={`${panel} relative w-[200px] max-w-full border-l-2 ${critical ? `border-l-rose-400 ${reduceMotion ? "" : "animate-pulse"}` : damaged ? "border-l-amber-300" : "border-l-emerald-300"} px-3 py-2.5`}
      aria-label={`Armor integrity ${hud.health} percent${critical ? ", critical" : damaged ? ", damaged" : ", stable"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={label}>{hud.gameMode === "range" ? "Range safety" : "Armor integrity"}</span>
        <span className={`text-[9px] font-black uppercase tracking-wider ${critical ? "text-rose-200" : damaged ? "text-amber-100" : "text-emerald-100"}`}>
          {critical ? "Critical" : damaged ? "Damaged" : hud.gameMode === "range" ? "Safe" : "Stable"}
        </span>
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-mono text-2xl font-black leading-none text-white">{hud.health}</span>
        <span className="pb-0.5 text-[9px] text-slate-500">%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${hud.health}%` }} />
      </div>
    </div>
  );
}

function PerformancePanel({ hud }: Pick<GameplayHudProps, "hud">) {
  return (
    <div className={`${panel} relative min-w-[160px] max-w-[240px] border-r-2 border-r-[#b7c49a]/55 px-3 py-2.5 text-right`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 text-left">
          <div className={label}>{hud.gameMode === "range" ? "Course" : hud.gameMode === "pvp" ? "Combat" : "Performance"}</div>
          <div className="mt-1 truncate font-mono text-[10px] text-slate-200" data-testid="range-score">
            {hud.gameMode === "range"
              ? `${hud.score} score · ${hud.rangeShots} shots`
              : hud.gameMode === "pvp"
                ? `${hud.kills} kills · ${hud.deaths} deaths`
                : `${hud.score} score · ${hud.streak} streak`}
          </div>
          <div className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-500">
            {hud.gameMode === "range" ? `Best ${hud.rangeBestScore}` : `${hud.medkits} medkits`}
          </div>
        </div>
        <div className="shrink-0">
          <div className={label}>{hud.rangeChallengeActive ? "Challenge" : "Op timer"}</div>
          <div className="mt-1 font-mono text-xl font-black leading-none text-[#d7dfc5]">{hud.missionTime}</div>
        </div>
      </div>
    </div>
  );
}

function MobileHud({ hud, pvpRoom, reduceMotion }: Omit<GameplayHudProps, "touchDevice">) {
  const critical = hud.health <= 25;
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
            ) : (
              <span>{hud.score} PTS</span>
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
          <PerformancePanel hud={hud} />
        </div>
      </div>
    </div>
  );
}
