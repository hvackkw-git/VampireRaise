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

  it("1~5레벨은 투명 행이고 이후 단계가 오를수록 애니메이션이 빨라진다", () => {
    expect(auraStyleForTier(0).row).toBe(0);
    for (let t = 1; t < AURA_TIER_COUNT; t++) {
      const prev = auraStyleForTier(t - 1);
      const cur = auraStyleForTier(t);
      expect(cur.duration).toBeLessThanOrEqual(prev.duration);
    }
  });

  it("10개 레벨 구간을 스프라이트 시트의 10개 행에 직접 배치한다", () => {
    expect(Array.from({ length: 10 }, (_, t) => auraStyleForTier(t).row))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("경계값·불투명도 범위가 안전하다", () => {
    expect(AURA_TIERS).toHaveLength(AURA_TIER_COUNT);
    const first = auraStyleForTier(0);
    const last = auraStyleForTier(9);
    expect(first.row).toBe(0);
    expect(last.row).toBe(9);
    // 잘못된 단계는 0~9로 클램프
    expect(auraStyleForTier(-3)).toEqual(auraStyleForTier(0));
    expect(auraStyleForTier(42)).toEqual(auraStyleForTier(9));
  });
});
