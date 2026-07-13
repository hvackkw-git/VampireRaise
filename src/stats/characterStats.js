import { CRAWL_SPD, DASH_SPD, ATTACK_COOLDOWN_S, MP_REGEN_PER_S } from "../constants.js";

export const STAT_KEYS = Object.freeze(["str", "agi", "int"]);

export const STAT_EFFECTS = Object.freeze({
  str: Object.freeze({ hp: 8, atk: 1, armor: 1 }),
  agi: Object.freeze({ speedRate: 0.02, detectRange: 3 }),
  int: Object.freeze({ mp: 6, mpRegen: 0.25, magicAtk: 1 }),
});

function pointValue(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizeStatProgress(char) {
  if (!char) return char;
  const source = char.stats && typeof char.stats === "object" ? char.stats : {};
  char.stats = {
    str: pointValue(source.str),
    agi: pointValue(source.agi),
    int: pointValue(source.int),
  };
  if (!Number.isFinite(char.statPoints)) char.statPoints = Math.max(0, (char.level ?? 1) - 1);
  char.statPoints = pointValue(char.statPoints);
  return char;
}

export function statPoints(char, key) {
  if (!char || !STAT_KEYS.includes(key)) return 0;
  return pointValue(char.stats?.[key]);
}

export function investStat(char, key) {
  if (!char || char.side !== "vampire" || !STAT_KEYS.includes(key)) return false;
  normalizeStatProgress(char);
  if (char.statPoints <= 0) return false;

  char.statPoints -= 1;
  char.stats[key] += 1;

  if (key === "str") {
    char.maxHp = Math.max(1, Number(char.maxHp) || 1) + STAT_EFFECTS.str.hp;
    char.hp = Math.min(char.maxHp, Math.max(0, Number(char.hp) || 0) + STAT_EFFECTS.str.hp);
    char.atk = Math.max(0, Number(char.atk) || 0) + STAT_EFFECTS.str.atk;
  } else if (key === "int") {
    char.maxMp = Math.max(0, Number(char.maxMp) || 0) + STAT_EFFECTS.int.mp;
    char.mp = Math.min(char.maxMp, Math.max(0, Number(char.mp) || 0) + STAT_EFFECTS.int.mp);
  }
  return true;
}

export function effectiveArmor(char) {
  return statPoints(char, "str") * STAT_EFFECTS.str.armor;
}

export function mitigateDamage(target, damage) {
  const amount = Math.max(0, Number(damage) || 0);
  const armor = effectiveArmor(target);
  return amount * (100 / (100 + armor));
}

export function effectiveAttackSpeed(char) {
  return 1 + statPoints(char, "agi") * STAT_EFFECTS.agi.speedRate;
}

export function effectiveAttackCooldown(char, base = ATTACK_COOLDOWN_S) {
  return Math.max(0.1, base / effectiveAttackSpeed(char));
}

export function effectiveMoveSpeed(char, base = CRAWL_SPD) {
  return base * effectiveAttackSpeed(char);
}

export function effectiveDashSpeed(char, base = DASH_SPD) {
  return base * effectiveAttackSpeed(char);
}

export function agilityDetectBonus(char) {
  return statPoints(char, "agi") * STAT_EFFECTS.agi.detectRange;
}

export function effectiveMpRegen(char, base = MP_REGEN_PER_S) {
  return base + statPoints(char, "int") * STAT_EFFECTS.int.mpRegen;
}

export function effectiveMagicAttack(char) {
  return statPoints(char, "int") * STAT_EFFECTS.int.magicAtk;
}
