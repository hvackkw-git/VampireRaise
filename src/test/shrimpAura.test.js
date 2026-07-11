import { describe, it, expect } from "vitest";
import {
  auraTierForLevel, auraStyleForTier, AURA_TIERS,
  AURA_TIER_COUNT, AURA_TIER_SPAN, AURA_MIN_LEVEL, AURA_MAX_LEVEL,
} from "../skills/shrimpAura.js";

describe("새우 오러 단계 로직", () => {
  it("레벨 1~50을 5레벨마다 잘라 10단계로 나눈다", () => {
    expect(AURA_TIER_COUNT).toBe(10);
    expect(AURA_TIER_SPAN).toBe(5);
    // 구간 경계: 1~5→0, 6~10→1, …, 46~50→9
    expect(auraTierForLevel(1)).toBe(0);
    expect(auraTierForLevel(5)).toBe(0);
    expect(auraTierForLevel(6)).toBe(1);
    expect(auraTierForLevel(10)).toBe(1);
    expect(auraTierForLevel(45)).toBe(8);
    expect(auraTierForLevel(46)).toBe(9);
    expect(auraTierForLevel(50)).toBe(9);
    // 모든 레벨이 0~9 안에 든다
    for (let L = AURA_MIN_LEVEL; L <= AURA_MAX_LEVEL; L++) {
      const t = auraTierForLevel(L);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(AURA_TIER_COUNT);
    }
  });

  it("범위 밖·이상값은 1~50으로 클램프한다", () => {
    expect(auraTierForLevel(0)).toBe(0);
    expect(auraTierForLevel(-99)).toBe(0);
    expect(auraTierForLevel(999)).toBe(9);
    expect(auraTierForLevel(undefined)).toBe(0);
    expect(auraTierForLevel(NaN)).toBe(0);
    expect(auraTierForLevel(7.9)).toBe(1); // 소수는 내림
  });

  it("단계가 오를수록 오러가 커지고 진해진다(점점 화려)", () => {
    for (let t = 1; t < AURA_TIER_COUNT; t++) {
      const prev = auraStyleForTier(t - 1);
      const cur = auraStyleForTier(t);
      expect(cur.size).toBeGreaterThan(prev.size);       // 지름 ↑
      expect(cur.opacity).toBeGreaterThan(prev.opacity); // 불투명도 ↑(진해짐)
      expect(cur.spin).toBeLessThan(prev.spin);          // 회전 더 빠르게
      expect(cur.ringOpacity).toBeGreaterThanOrEqual(prev.ringOpacity);
      expect(cur.sparkOpacity).toBeGreaterThanOrEqual(prev.sparkOpacity);
    }
  });

  it("소용돌이 링은 2단계, 스파크 링은 4단계부터 등장한다", () => {
    expect(auraStyleForTier(0).ringOpacity).toBe(0);
    expect(auraStyleForTier(1).ringOpacity).toBe(0);
    expect(auraStyleForTier(2).ringOpacity).toBeGreaterThan(0);
    expect(auraStyleForTier(3).sparkOpacity).toBe(0);
    expect(auraStyleForTier(4).sparkOpacity).toBeGreaterThan(0);
  });

  it("색은 빨강 계열이다(R 성분이 가장 강함)", () => {
    for (let t = 0; t < AURA_TIER_COUNT; t++) {
      const { core, edge } = auraStyleForTier(t);
      const [cr, cg, cb] = core.match(/\d+/g).map(Number);
      const [er, eg, eb] = edge.match(/\d+/g).map(Number);
      expect(cr).toBeGreaterThanOrEqual(cg);
      expect(cr).toBeGreaterThanOrEqual(cb);
      expect(er).toBeGreaterThanOrEqual(eg);
      expect(er).toBeGreaterThanOrEqual(eb);
    }
  });

  it("경계값·불투명도 범위가 안전하다", () => {
    expect(AURA_TIERS).toHaveLength(AURA_TIER_COUNT);
    const first = auraStyleForTier(0);
    const last = auraStyleForTier(9);
    expect(first.opacity).toBeGreaterThan(0);
    expect(last.opacity).toBeLessThanOrEqual(1);
    // 잘못된 단계는 0~9로 클램프
    expect(auraStyleForTier(-3)).toEqual(auraStyleForTier(0));
    expect(auraStyleForTier(42)).toEqual(auraStyleForTier(9));
  });
});
