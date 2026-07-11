import { describe, it, expect } from "vitest";
import {
  DASH_COLORS, DASH_COLOR_HEX, defaultDashColors, DEFAULT_DASH_POINTS,
  dashGhostCount, dashColorCycle, dashGhostTrail,
  investDashColor, resetDashColors, normalizeDashPoints,
  BASE_DETECT_RANGE, effectiveDetectRange, revengeAttackMult, dashDistanceMult,
  detectRangeMult, investDetect, investDashCdMana, dashCdManaMult,
} from "../skills/dashColors.js";
import { createInitialState, saveState, loadState } from "../state/gameState.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}

/** 사이클을 n개까지 타일링 */
function tiled(cycle, n) {
  return Array.from({ length: n }, (_, i) => cycle[i % cycle.length]);
}

describe("Dash 잔상 색 로직", () => {
  it("기본은 복수(빨강) 1포인트", () => {
    expect(defaultDashColors()).toEqual({ red: 1 });
    // 모든 팔레트 색에 hex가 있다
    for (const c of DASH_COLORS) expect(DASH_COLOR_HEX[c]).toMatch(/^#/);
  });

  it("잔상 개수는 빨강+주황 포인트로만 늘어난다(하드코딩)", () => {
    const base = dashGhostCount({ red: 1 });
    expect(dashGhostCount({ red: 1, orange: 1 })).toBeGreaterThan(base);
    expect(dashGhostCount({ red: 3 })).toBeGreaterThan(base);
    // 노랑 등 다른 색은 개수에 영향 없음
    expect(dashGhostCount({ red: 1, yellow: 5 })).toBe(base);
    // 상한 캡
    expect(dashGhostCount({ red: 20, orange: 20 })).toBeLessThanOrEqual(18);
  });

  it("사이클: 최소 투자량을 1단위로 round(points/min) 반복 (0 제외)", () => {
    // 빨6 주2 → 최소 2 → 빨3 주1
    expect(dashColorCycle({ red: 6, orange: 2 })).toEqual(["red", "red", "red", "orange"]);
    // 빨10 주3 초2 → 최소 2 → 빨5 주2(반올림) 초1
    expect(dashColorCycle({ red: 10, orange: 3, green: 2 })).toEqual([
      "red", "red", "red", "red", "red", "orange", "orange", "green",
    ]);
    // 빨1 주1 노1 초1 → 빨주노초
    expect(dashColorCycle({ red: 1, orange: 1, yellow: 1, green: 1 })).toEqual([
      "red", "orange", "yellow", "green",
    ]);
    // 0 투자 색은 제외
    expect(dashColorCycle({ red: 4, orange: 0, blue: 2 })).toEqual(["red", "red", "blue"]);
    // 투자 없음 → 전부 빨강 안전장치
    expect(dashColorCycle({})).toEqual(["red"]);
  });

  it("빨강만 있으면 전부 빨강", () => {
    expect(new Set(dashGhostTrail({ red: 1 }, 10))).toEqual(new Set(["red"]));
  });

  it("트레일: 잔상은 스폰 순서대로 사이클을 그대로 반복한다(길이 무관)", () => {
    // 빨6 노3 → 최소 3을 1단위로 → 사이클 [빨,빨,노] → 빨빨노빨빨노…
    expect(dashColorCycle({ red: 6, yellow: 3 })).toEqual(["red", "red", "yellow"]);
    expect(dashGhostTrail({ red: 6, yellow: 3 }, 9)).toEqual(
      tiled(["red", "red", "yellow"], 9),
    );
    // 빨6 주2 → 사이클 [빨빨빨주], 스폰 순서대로 반복
    expect(dashGhostTrail({ red: 6, orange: 2 }, 10)).toEqual(
      tiled(["red", "red", "red", "orange"], 10),
    );
    // 짧은 돌진(적은 개수)이어도 앞에서부터 순서대로 나온다 — 색이 건너뛰지 않는다
    expect(dashGhostTrail({ red: 6, orange: 2 }, 5)).toEqual(
      ["red", "red", "red", "orange", "red"],
    );
  });

  it("빨주노초 반복: 스폰 순서대로 빨주노초빨주노초…", () => {
    expect(dashGhostTrail({ red: 1, orange: 1, yellow: 1, green: 1 }, 9)).toEqual(
      tiled(["red", "orange", "yellow", "green"], 9),
    );
  });

  it("뱀파이어 기본 dashColors는 복수 1포인트, 저장·복원된다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const vamp = state.chars.items.find((c) => c.side === "vampire");
    expect(vamp.dashColors).toEqual({ red: 1 });
    expect(vamp.dashPoints).toBe(DEFAULT_DASH_POINTS); // 기본 듬뿍
    vamp.dashColors = { red: 2, orange: 1, blue: 1 };
    vamp.dashPoints = 12;
    vamp.detectPoints = 3;
    saveState(state, storage);
    const restored = loadState(storage);
    const rv = restored.chars.items.find((c) => c.side === "vampire");
    expect(rv.dashColors).toEqual({ red: 2, orange: 1, blue: 1 });
    expect(rv.dashPoints).toBe(12);
    expect(rv.detectPoints).toBe(3);
  });

  it("색상 투자: 포인트만 있으면 레벨 제한 없이 찍힌다", () => {
    const char = { dashColors: {}, dashPoints: 3 };
    expect(investDashColor(char, "orange")).toBe(true);
    expect(investDashColor(char, "orange")).toBe(true);
    expect(investDashColor(char, "blue")).toBe(true);
    expect(char.dashColors).toEqual({ orange: 2, blue: 1 });
    expect(char.dashPoints).toBe(0);
    // 포인트 없으면 실패
    expect(investDashColor(char, "red")).toBe(false);
    expect(char.dashColors.red).toBeUndefined();
    // 잘못된 색은 실패
    expect(investDashColor({ dashColors: {}, dashPoints: 5 }, "pink")).toBe(false);
  });

  it("색상 초기화: 투자 포인트를 전부 환불하고 배분을 비운다", () => {
    const char = { dashColors: { red: 3, orange: 2 }, dashPoints: 5 };
    const refunded = resetDashColors(char);
    expect(refunded).toBe(5);
    expect(char.dashPoints).toBe(10);
    expect(char.dashColors).toEqual({});
  });

  it("normalizeDashPoints: 기본 풀은 듬뿍, 잘못된 값 정리", () => {
    const fresh = {};
    normalizeDashPoints(fresh);
    expect(fresh.dashPoints).toBe(DEFAULT_DASH_POINTS);
    expect(fresh.dashColors).toEqual({ red: 1 });
    const dirty = { dashColors: { red: 2, pink: 3, blue: 0 }, dashPoints: -4 };
    normalizeDashPoints(dirty);
    expect(dirty.dashColors).toEqual({ red: 2 });
    expect(dirty.dashPoints).toBe(0);
  });

  it("잔상 개수는 인식 범위에 비례해 늘어난다(향후 인식 범위 성장 반영)", () => {
    const points = { red: 1 };
    const base = dashGhostCount(points, BASE_DETECT_RANGE);
    expect(dashGhostCount(points, BASE_DETECT_RANGE * 2)).toBeGreaterThan(base);
    expect(dashGhostCount(points, BASE_DETECT_RANGE / 2)).toBeLessThan(base);
    // detectRange 미지정 시 기본값과 동일
    expect(dashGhostCount(points)).toBe(base);
    // effectiveDetectRange: c.detectRange 있으면 그것, 없으면 기본값
    expect(effectiveDetectRange({ detectRange: 150 })).toBe(150);
    expect(effectiveDetectRange({})).toBe(BASE_DETECT_RANGE);
  });

  it("인식범위 스킬: 포인트당 ×1.1로 실제 범위가 커지고 잔상도 늘어난다", () => {
    expect(detectRangeMult(0)).toBeCloseTo(1.0);
    expect(detectRangeMult(1)).toBeCloseTo(1.1);
    expect(detectRangeMult(2)).toBeCloseTo(1.2);
    // 뱀파이어는 detectPoints로 실효 범위가 실제로 증가
    const v0 = { side: "vampire", detectPoints: 0 };
    const v2 = { side: "vampire", detectPoints: 2 };
    expect(effectiveDetectRange(v0)).toBeCloseTo(BASE_DETECT_RANGE);
    expect(effectiveDetectRange(v2)).toBeCloseTo(BASE_DETECT_RANGE * 1.2);
    // 인식 범위가 커지면 잔상 개수도 증가
    expect(dashGhostCount({ red: 1 }, effectiveDetectRange(v2)))
      .toBeGreaterThan(dashGhostCount({ red: 1 }, effectiveDetectRange(v0)));
  });

  it("인식범위 투자·초기화: 같은 풀을 쓰고 초기화 시 함께 환불", () => {
    const char = { dashColors: {}, dashPoints: 3, detectPoints: 0 };
    expect(investDetect(char)).toBe(true);
    expect(investDetect(char)).toBe(true);
    expect(char.detectPoints).toBe(2);
    expect(char.dashPoints).toBe(1);
    investDashColor(char, "orange"); // dashPoints 0
    expect(investDetect(char)).toBe(false); // 풀 소진
    // 초기화: 색 1 + 인식 2 = 3 환불
    const refunded = resetDashColors(char);
    expect(refunded).toBe(3);
    expect(char.detectPoints).toBe(0);
    expect(char.dashColors).toEqual({});
    expect(char.dashPoints).toBe(3);
  });

  it("빨강=복수 배율: 1p는 ×1.0, 이후 포인트당 +0.1", () => {
    expect(revengeAttackMult({ red: 1 })).toBeCloseTo(1.0);
    expect(revengeAttackMult({ red: 2 })).toBeCloseTo(1.1);
    expect(revengeAttackMult({ red: 3 })).toBeCloseTo(1.2);
    expect(revengeAttackMult({})).toBeCloseTo(1.0); // 안전값
  });

  it("주황=거리 배율: 기본 2에서 포인트당 +0.1", () => {
    expect(dashDistanceMult({})).toBeCloseTo(2.0);
    expect(dashDistanceMult({ orange: 1 })).toBeCloseTo(2.1);
    expect(dashDistanceMult({ orange: 2 })).toBeCloseTo(2.2);
  });

  it("대쉬 숙련=쿨타임/마나 배율: 포인트당 -10%, 최대 90% 감소", () => {
    expect(dashCdManaMult(0)).toBeCloseTo(1.0);
    expect(dashCdManaMult(1)).toBeCloseTo(0.9);
    expect(dashCdManaMult(2)).toBeCloseTo(0.8);
    expect(dashCdManaMult(20)).toBeCloseTo(0.1); // 하한 캡
  });

  it("대쉬 숙련 투자·초기화: 같은 풀을 쓰고 초기화 시 함께 환불", () => {
    const char = { dashColors: {}, dashPoints: 2, dashCdManaPoints: 0 };
    expect(investDashCdMana(char)).toBe(true);
    expect(investDashCdMana(char)).toBe(true);
    expect(char.dashCdManaPoints).toBe(2);
    expect(char.dashPoints).toBe(0);
    expect(investDashCdMana(char)).toBe(false); // 풀 소진

    const refunded = resetDashColors(char);
    expect(refunded).toBe(2);
    expect(char.dashCdManaPoints).toBe(0);
    expect(char.dashPoints).toBe(2);
  });
});
