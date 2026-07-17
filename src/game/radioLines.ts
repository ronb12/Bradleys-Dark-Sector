/** Varied tactical radio / TTS line pools with no-immediate-repeat selection. */

export type RadioPoolId =
  | "missionAmbient"
  | "missionStart"
  | "waveInbound"
  | "objectiveComplete"
  | "missionBrief"
  | "rangeOnline"
  | "rangeChallengeStart"
  | "rangePass"
  | "rangeFail"
  | "pvpStart"
  | "pvpMatchOver"
  | "enemyCallout"
  | "contact"
  | "killConfirm"
  | "reloadRemind";

const lastPicked = new Map<RadioPoolId, string>();

/** Pick a line from a pool, avoiding the immediately previous pick when possible. */
export function pickFromPool(poolId: RadioPoolId, lines: readonly string[]): string {
  if (lines.length === 0) return "";
  if (lines.length === 1) {
    lastPicked.set(poolId, lines[0]);
    return lines[0];
  }
  const last = lastPicked.get(poolId);
  const candidates = last ? lines.filter((line) => line !== last) : lines;
  const pool = candidates.length > 0 ? candidates : lines;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  lastPicked.set(poolId, pick);
  return pick;
}

/** Test helper: clear rotation memory between assertions. */
export function resetRadioPickMemory(): void {
  lastPicked.clear();
}

export const MISSION_AMBIENT_LINES = [
  "Bravo Actual, movement east of the yard. Keep your sector covered.",
  "Command to Bradley, hold the compound. Reinforcements are still delayed.",
  "Recon reports hostiles moving between the outer buildings.",
  "Bradley, conserve ammunition and watch the flanking lanes.",
  "Net traffic: unknown contacts near the helipad. Stay sharp.",
  "Overwatch has eyes on the north fence. Sweep your corners.",
  "Command — QRF is stacked. You are still the only unit on site.",
  "Bradley, report any breach on the west warehouses immediately.",
  "Sitrep: hostiles probing the yard. Do not give ground.",
  "Actual to Bradley — keep your lanes hot and your head down.",
  "Comms check: compound still contested. Hold until extract window.",
  "Scout bird reports heat signatures near the fuel tanks. Priority threat.",
] as const;

export const MISSION_START_LINES = [
  "Bravo Actual to Bradley. Breach the north gate, secure the yard, and hold for extraction.",
  "Command to Bradley — you are green light. Enter the compound and establish fire superiority.",
  "Bradley, this is Actual. Push through the gate, clear the yard, standby for follow-on orders.",
  "Net call: Bradley is boots down. Secure the AO and prepare for wave contact.",
  "Actual — mission is live. Breach, clear, and hold the compound until extract.",
] as const;

export const WAVE_INBOUND_TEMPLATES = [
  "Command to Bradley, wave {wave} inbound. Hold your position.",
  "Actual — wave {wave} is stacking on your perimeter. Dig in.",
  "Bradley, wave {wave} contacts inbound. Keep your sector locked.",
  "Overwatch: wave {wave} moving on the compound. Engage at will.",
  "Net warning — wave {wave} assault. Hold the line.",
  "Command, wave {wave} confirmed. Do not break contact.",
] as const;

export const OBJECTIVE_COMPLETE_TEMPLATES = [
  "Objective complete. {title} secured.",
  "Solid work, Bradley — {title} is complete. Reset for follow-on.",
  "Command copies: {title} secured. Stand by for next tasking.",
  "Net update — {title} done. Keep the compound locked down.",
  "Actual confirms {title}. Good hit. Hold your gains.",
] as const;

export const MISSION_BRIEF_TEMPLATES = [
  "{title}. {briefing}",
  "New tasking — {title}. {briefing}",
  "Command assigns {title}. {briefing}",
  "Bradley, priority mission: {title}. {briefing}",
  "Actual — {title} is live. {briefing}",
] as const;

export const RANGE_ONLINE_LINES = [
  "Range control online. Lanes hot. Infinite magazines authorized. Press T for timed challenge.",
  "Range control — bay is live. Magazines unlimited. Hit T when you want the thirty-second qual.",
  "Range control online. Weapons free on the lanes. Press T to start timed challenge.",
  "Control to shooter — range is hot, free fire authorized. T starts the clocked qual.",
  "Range bay ready. Top off as needed. Press T for Marksman challenge.",
] as const;

export const RANGE_CHALLENGE_START_LINES = [
  "Range control — thirty second challenge live. Make every round count.",
  "Challenge clock is running. Thirty seconds. Clean hits only.",
  "Timed qual is live — thirty seconds. Drive steel, Bradley.",
  "Range control: challenge active. Thirty on the clock. No wasted rounds.",
  "Marksman window open — thirty seconds. Engage targets of opportunity.",
] as const;

export const RANGE_PASS_TEMPLATES = [
  "Qualification complete — {badge}.",
  "Range control confirms — you earned {badge}. Solid shooting.",
  "Qual passed. Badge awarded: {badge}.",
  "Clean run — {badge} unlocked. Rack clear.",
  "Marksman standard met. You are {badge}.",
] as const;

export const RANGE_FAIL_LINES = [
  "Qualification failed — below Marksman standard.",
  "Range control — qual incomplete. Accuracy below threshold. Reset and try again.",
  "Challenge failed. Tighten your groups and re-run when ready.",
  "Below standard. Magazines still free — dial it in and hit T again.",
  "Qual not awarded. Hits were short of Marksman. Stand by for another attempt.",
] as const;

export const PVP_START_LINES = [
  "Net call complete. PVP corridor is live. Engage hostile operators.",
  "Corridor hot — rival operators in the AO. Weapons free.",
  "PVP net is up. Identify friendlies, drop hostiles. Go.",
  "Match live. Hostile operators confirmed. Clear the compound.",
  "Command: PVP corridor active. Hunt and eliminate rival teams.",
] as const;

export const PVP_MATCH_OVER_TEMPLATES = [
  "Match over — Team {winner} wins ({score}).",
  "Net close — Team {winner} takes the corridor ({score}).",
  "Fight complete. Team {winner} wins, final {score}.",
  "Match ended. Victory to Team {winner} — {score}.",
  "Corridor secure for Team {winner}. Score {score}.",
] as const;

export const ENEMY_CALLOUT_LINES = [
  "Contact front!",
  "Flanking left!",
  "Man down, covering!",
  "Push now!",
  "Grenade, get clear!",
  "Reloading!",
  "Hold that corner!",
  "Hostile right!",
  "Suppressing!",
  "Moving up!",
  "Watch the alley!",
  "They're breaking left!",
  "Covering fire!",
  "Contact close!",
  "Get to cover!",
] as const;

export const CONTACT_LINES = [
  "Contact!",
  "Taking fire!",
  "Under fire — engage!",
  "Hostile contact, Bradley!",
  "Incoming — return fire!",
] as const;

export const KILL_CONFIRM_LINES = [
  "Hostile down.",
  "Target eliminated.",
  "One down — keep pushing.",
  "Confirmed kill.",
  "Threat neutralized.",
  "Good hit. Next contact.",
] as const;

export const RELOAD_REMIND_LINES = [
  "Magazine empty — reload.",
  "Weapon dry. Reload now.",
  "Out of rounds — change mags.",
  "Bradley, reload before the next push.",
  "Empty gun. Get steel back in the fight.",
] as const;

export const RADIO_POOL_SIZES = {
  missionAmbient: MISSION_AMBIENT_LINES.length,
  missionStart: MISSION_START_LINES.length,
  waveInbound: WAVE_INBOUND_TEMPLATES.length,
  objectiveComplete: OBJECTIVE_COMPLETE_TEMPLATES.length,
  missionBrief: MISSION_BRIEF_TEMPLATES.length,
  rangeOnline: RANGE_ONLINE_LINES.length,
  rangeChallengeStart: RANGE_CHALLENGE_START_LINES.length,
  rangePass: RANGE_PASS_TEMPLATES.length,
  rangeFail: RANGE_FAIL_LINES.length,
  pvpStart: PVP_START_LINES.length,
  pvpMatchOver: PVP_MATCH_OVER_TEMPLATES.length,
  enemyCallout: ENEMY_CALLOUT_LINES.length,
  contact: CONTACT_LINES.length,
  killConfirm: KILL_CONFIRM_LINES.length,
  reloadRemind: RELOAD_REMIND_LINES.length,
} as const;

export function missionAmbientLine(): string {
  return pickFromPool("missionAmbient", MISSION_AMBIENT_LINES);
}

export function missionStartLine(): string {
  return pickFromPool("missionStart", MISSION_START_LINES);
}

export function waveInboundLine(wave: number): string {
  const tpl = pickFromPool("waveInbound", WAVE_INBOUND_TEMPLATES);
  return tpl.replaceAll("{wave}", String(wave));
}

export function objectiveCompleteLine(title: string): string {
  const tpl = pickFromPool("objectiveComplete", OBJECTIVE_COMPLETE_TEMPLATES);
  return tpl.replaceAll("{title}", title);
}

export function missionBriefLine(title: string, briefing: string): string {
  const tpl = pickFromPool("missionBrief", MISSION_BRIEF_TEMPLATES);
  return tpl.replaceAll("{title}", title).replaceAll("{briefing}", briefing);
}

export function rangeOnlineLine(): string {
  return pickFromPool("rangeOnline", RANGE_ONLINE_LINES);
}

export function rangeChallengeStartLine(): string {
  return pickFromPool("rangeChallengeStart", RANGE_CHALLENGE_START_LINES);
}

export function rangePassLine(badge: string): string {
  const tpl = pickFromPool("rangePass", RANGE_PASS_TEMPLATES);
  return tpl.replaceAll("{badge}", badge);
}

export function rangeFailLine(): string {
  return pickFromPool("rangeFail", RANGE_FAIL_LINES);
}

export function pvpStartLine(): string {
  return pickFromPool("pvpStart", PVP_START_LINES);
}

export function pvpMatchOverLine(winnerTeam: number, scoreA: number, scoreB: number): string {
  const tpl = pickFromPool("pvpMatchOver", PVP_MATCH_OVER_TEMPLATES);
  return tpl
    .replaceAll("{winner}", String(winnerTeam + 1))
    .replaceAll("{score}", `${scoreA}-${scoreB}`);
}

export function enemyCalloutLine(): string {
  return pickFromPool("enemyCallout", ENEMY_CALLOUT_LINES);
}

export function contactLine(): string {
  return pickFromPool("contact", CONTACT_LINES);
}

export function killConfirmLine(): string {
  return pickFromPool("killConfirm", KILL_CONFIRM_LINES);
}

export function reloadRemindLine(): string {
  return pickFromPool("reloadRemind", RELOAD_REMIND_LINES);
}

/** Assert every pool has variety; returns failing pool ids (empty if all good). */
export function assertRadioPoolsVaried(minSize = 2): string[] {
  return (Object.entries(RADIO_POOL_SIZES) as [RadioPoolId, number][])
    .filter(([, size]) => size < minSize)
    .map(([id]) => id);
}

/** Sample several picks; true if at least two distinct lines appear. */
export function poolRotatesWithoutImmediateRepeat(
  poolId: RadioPoolId,
  lines: readonly string[],
  draws = 12
): boolean {
  if (lines.length < 2) return false;
  resetRadioPickMemory();
  const seen = new Set<string>();
  let prev = "";
  for (let i = 0; i < draws; i += 1) {
    const line = pickFromPool(poolId, lines);
    if (prev && line === prev) return false;
    prev = line;
    seen.add(line);
  }
  return seen.size >= 2;
}

const lastCueAt = new Map<string, number>();

/** Gate optional cues (contact / kill / reload) so variety does not become spam. */
export function allowRadioCue(cueId: string, cooldownMs: number, nowMs = performance.now()): boolean {
  const last = lastCueAt.get(cueId) ?? Number.NEGATIVE_INFINITY;
  if (nowMs - last < cooldownMs) return false;
  lastCueAt.set(cueId, nowMs);
  return true;
}

export function resetRadioCueCooldowns(): void {
  lastCueAt.clear();
}