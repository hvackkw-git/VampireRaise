import { isEnemySide } from "../constants.js";
import { effectiveMagicAttack } from "../stats/characterStats.js";

export const BACKFLIP_SKILL_KEY = "backflip-spikes";
export const BACKFLIP_ICON = "assets/block/spike_block.png";
export const BACKFLIP_DURATION_S = 0.55;
export const BACKFLIP_COOLDOWN_S = 8;
export const BACKFLIP_RADIUS = 32;
export const BACKFLIP_SPIKE_COUNT = 12;
export const BACKFLIP_UPGRADE_KEYS = Object.freeze([
  "red", "orange", "yellow", "green", "blue", "purple", "white", "mastery",
]);

export const BACKFLIP_COLOR_HEX = Object.freeze({
  red: "#ef3f50",
  orange: "#f28a3a",
  yellow: "#f2d84a",
  green: "#52c96c",
  blue: "#4f91e8",
  purple: "#a465d8",
  white: "#e8edf2",
  mastery: "#d8203f",
});

const ACTIVATION_STATES = new Set(["CRAWL", "FIGHT", "JUMP", "FALL"]);

export function normalizeBackflipSkill(char) {
  if (!char || char.side !== "vampire") return char;
  char.backflipSkillPoints = 1;
  if (!Array.isArray(char.skills)) char.skills = ["dash"];
  if (!char.skills.includes(BACKFLIP_SKILL_KEY)) char.skills.push(BACKFLIP_SKILL_KEY);
  const source = char.backflipUpgrades && typeof char.backflipUpgrades === "object"
    ? char.backflipUpgrades : {};
  char.backflipUpgrades = {};
  for (const key of BACKFLIP_UPGRADE_KEYS) {
    char.backflipUpgrades[key] = Math.max(0, Math.floor(Number(source[key]) || 0));
  }
  return char;
}

export function hasBackflipSkill(char) {
  normalizeBackflipSkill(char);
  return char?.side === "vampire";
}

export function backflipUpgradePoints(char, key) {
  if (!BACKFLIP_UPGRADE_KEYS.includes(key)) return 0;
  normalizeBackflipSkill(char);
  return char?.backflipUpgrades?.[key] ?? 0;
}

export function investBackflipUpgrade(char, key) {
  if (!char || char.side !== "vampire" || !BACKFLIP_UPGRADE_KEYS.includes(key)) return false;
  normalizeBackflipSkill(char);
  if (!(char.skillPoints > 0)) return false;
  char.skillPoints -= 1;
  char.backflipUpgrades[key] += 1;
  return true;
}

export function backflipCooldown(char) {
  return Math.max(2, BACKFLIP_COOLDOWN_S * (0.9 ** backflipUpgradePoints(char, "green")));
}

export function backflipSpikeCount(char) {
  return Math.min(32, BACKFLIP_SPIKE_COUNT + backflipUpgradePoints(char, "yellow") * 2);
}

export function canActivateBackflip(char) {
  return !!char
    && !char.dead
    && hasBackflipSkill(char)
    && !(char._backflipCd > 0)
    && ACTIVATION_STATES.has(char.state);
}

export function activateBackflip(char) {
  if (!canActivateBackflip(char)) return false;
  char._backflipReturnState = char.state === "FIGHT"
    ? "FIGHT"
    : char.state === "JUMP" || char.state === "FALL"
      ? "FALL"
      : "CRAWL";
  char.state = "BACKFLIP";
  char.vx = 0;
  char.vy = 0;
  char._backflipT = 0;
  char._backflipSpikeIndex = 0;
  char._backflipSpikeCount = backflipSpikeCount(char);
  char._backflipDamageFired = false;
  char._backflipCd = backflipCooldown(char);
  char._swinging = false;
  char._swingT = 0;
  const shieldPoints = backflipUpgradePoints(char, "purple");
  if (shieldPoints > 0) {
    const amount = Math.max(1, Math.round((Number(char.maxHp) || 1) * 0.1 * shieldPoints));
    char._shieldHp = Math.max(Number(char._shieldHp) || 0, amount);
    char._shieldMax = Math.max(Number(char._shieldMax) || 0, char._shieldHp);
    char._shieldT = Math.max(Number(char._shieldT) || 0, 3);
  }
  return true;
}

export function backflipDamage(char) {
  const base = (Number(char?.atk) || 0) * 1.5 + effectiveMagicAttack(char) * 2;
  return Math.max(1, Math.round(base * (1 + backflipUpgradePoints(char, "orange") * 0.2)));
}

function center(char) {
  return { x: char.x + char.w / 2, y: char.y + char.h / 2 };
}

function queueAreaDamage(state, char, events, nowMs) {
  const origin = center(char);
  const baseDamage = backflipDamage(char);
  const lifestealRate = backflipUpgradePoints(char, "red") * 0.08;
  const stunPoints = backflipUpgradePoints(char, "blue");
  const stunUntil = stunPoints > 0 ? nowMs + stunPoints * 250 : 0;
  const echoRate = backflipUpgradePoints(char, "white") * 0.25;
  const executePoints = backflipUpgradePoints(char, "mastery");
  let hits = 0;
  state._activeSkillHits ??= [];
  for (const target of state.chars.items) {
    if (target === char || target.dead || !isEnemySide(char.side, target.side)) continue;
    const point = center(target);
    const edgeAllowance = Math.min(target.w, target.h) / 2;
    if (Math.hypot(point.x - origin.x, point.y - origin.y) > BACKFLIP_RADIUS + edgeAllowance) continue;
    const critical = (Number(target.hp) || 0) / Math.max(1, Number(target.maxHp) || 1) <= 0.3;
    const damage = Math.round(baseDamage * (critical ? 1 + executePoints * 0.2 : 1));
    state._activeSkillHits.push({
      attacker: char,
      target,
      dmg: damage,
      lifestealRate,
      stunStart: nowMs,
      stunUntil,
      backflip: true,
    });
    if (echoRate > 0) {
      state._activeSkillHits.push({
        attacker: char,
        target,
        dmg: Math.max(1, Math.round(damage * echoRate)),
        backflip: true,
        echo: true,
      });
    }
    hits += 1;
  }
  events.push({ type: "backflipBurst", char, radius: BACKFLIP_RADIUS, hits });
}

function spawnSpikeEvents(char, fromIndex, toIndex, spikeCount, events) {
  const origin = center(char);
  const spinDirection = char.dir > 0 ? 1 : -1;
  for (let index = fromIndex; index < toIndex; index++) {
    const angle = -Math.PI / 2
      + spinDirection * (index / spikeCount) * Math.PI * 2;
    events.push({
      type: "backflipSpike",
      char,
      x: origin.x + Math.cos(angle) * BACKFLIP_RADIUS,
      y: origin.y + Math.sin(angle) * BACKFLIP_RADIUS,
      angleDeg: angle * 180 / Math.PI + 90,
      index,
    });
  }
}

/** 쿨다운, 0.55초 플립 진행, 시계방향 가시 이벤트와 범위 피해를 한 번에 갱신한다. */
export function tickBackflipSkills(state, simDt, nowMs = 0) {
  const events = [];
  for (const char of state.chars.items) {
    if (char.side !== "vampire") continue;
    char._backflipCd = Math.max(0, (Number(char._backflipCd) || 0) - simDt);
    if (char.dead || char.state !== "BACKFLIP") continue;

    char._backflipT = Math.min(BACKFLIP_DURATION_S, (Number(char._backflipT) || 0) + simDt);
    const progress = char._backflipT / BACKFLIP_DURATION_S;
    const spawned = Math.max(0, Math.floor(Number(char._backflipSpikeIndex) || 0));
    const spikeCount = Math.max(BACKFLIP_SPIKE_COUNT, Number(char._backflipSpikeCount) || BACKFLIP_SPIKE_COUNT);
    const targetCount = Math.min(spikeCount, Math.ceil(progress * spikeCount));
    spawnSpikeEvents(char, spawned, targetCount, spikeCount, events);
    char._backflipSpikeIndex = targetCount;

    if (!char._backflipDamageFired && progress >= 0.45) {
      char._backflipDamageFired = true;
      queueAreaDamage(state, char, events, nowMs);
    }

    if (progress < 1) continue;
    char.state = char._backflipReturnState ?? "CRAWL";
    char._backflipReturnState = null;
    char._backflipT = 0;
    char._backflipSpikeIndex = 0;
    char._backflipSpikeCount = 0;
    char._backflipDamageFired = false;
    char.timer = Math.max(0.15, Number(char.timer) || 0);
  }
  return events;
}
