import { describe, expect, it } from "vitest";
import { CRAWL_SPD, DASH_SPD, MP_REGEN_PER_S, expToNext } from "../constants.js";
import { createInitialState } from "../state/gameState.js";
import { effectiveDetectRange } from "../skills/dashColors.js";
import { grantExp } from "../game/combat.js";
import {
  effectiveArmor, effectiveAttackCooldown, effectiveDashSpeed, effectiveMagicAttack,
  effectiveMoveSpeed, effectiveMpRegen, investStat, mitigateDamage, normalizeStatProgress,
} from "../stats/characterStats.js";

describe("character stats", () => {
  it("gives legacy characters one unspent stat point per level after level 1", () => {
    const char = { level: 7 };
    normalizeStatProgress(char);
    expect(char.statPoints).toBe(6);
    expect(char.stats).toEqual({ str: 0, agi: 0, int: 0 });
  });

  it("invests strength into HP, attack, armor, and damage reduction", () => {
    const char = createInitialState().chars.items[0];
    const before = { points: char.statPoints, hp: char.hp, maxHp: char.maxHp, atk: char.atk };
    expect(investStat(char, "str")).toBe(true);
    expect(char.statPoints).toBe(before.points - 1);
    expect(char.maxHp).toBe(before.maxHp + 8);
    expect(char.hp).toBe(before.hp + 8);
    expect(char.atk).toBe(before.atk + 1);
    expect(effectiveArmor(char)).toBe(1);
    expect(mitigateDamage(char, 10)).toBeCloseTo(10 * 100 / 101);
  });

  it("invests agility into attack, movement, dash, and detection speed", () => {
    const char = createInitialState().chars.items[0];
    const beforeDetect = effectiveDetectRange(char);
    investStat(char, "agi");
    expect(effectiveAttackCooldown(char)).toBeCloseTo(1 / 1.02);
    expect(effectiveMoveSpeed(char)).toBeCloseTo(CRAWL_SPD * 1.02);
    expect(effectiveDashSpeed(char)).toBeCloseTo(DASH_SPD * 1.02);
    expect(effectiveDetectRange(char)).toBe(beforeDetect + 3);
  });

  it("invests intelligence into MP, regeneration, and magic attack", () => {
    const char = createInitialState().chars.items[0];
    const before = { mp: char.mp, maxMp: char.maxMp };
    investStat(char, "int");
    expect(char.maxMp).toBe(before.maxMp + 6);
    expect(char.mp).toBe(before.mp + 6);
    expect(effectiveMpRegen(char)).toBe(MP_REGEN_PER_S + 0.25);
    expect(effectiveMagicAttack(char)).toBe(1);
  });

  it("awards a stat point on character level-up", () => {
    const char = createInitialState().chars.items[0];
    const before = char.statPoints;
    grantExp(char, expToNext(char.level), []);
    expect(char.statPoints).toBe(before + 1);
  });
});
