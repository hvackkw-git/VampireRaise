import { describe, it, expect } from "vitest";
import {
  DASH_COLORS, DASH_COLOR_HEX, defaultDashColors, DEFAULT_DASH_POINTS,
  dashGhostCount, allocateGhostSlots, dashGhostColorSequence, ghostColorAtProgress,
  investDashColor, resetDashColors, normalizeDashPoints,
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

// 결정적 테스트용 시드 RNG(선형 합동). 시드를 먼저 섞어 순차 시드끼리도 잘 흩어지게 한다.
function seededRng(seed = 1) {
  let s = ((seed * 2654435761) >>> 0) ^ 0x9e3779b9;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  next(); next(); // 워밍업
  return next;
}

function tally(seq) {
  const t = {};
  for (const c of seq) t[c] = (t[c] || 0) + 1;
  return t;
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

  it("분배 슬롯 합은 항상 정확히 N", () => {
    const rng = seededRng(42);
    const points = { red: 3, orange: 2, blue: 1 };
    const N = dashGhostCount(points);
    for (let i = 0; i < 50; i++) {
      const slots = allocateGhostSlots(points, N, rng);
      const sum = Object.values(slots).reduce((a, b) => a + b, 0);
      expect(sum).toBe(N);
    }
  });

  it("빨강만 있으면 전부 빨강", () => {
    const seq = dashGhostColorSequence({ red: 1 }, seededRng(7));
    expect(new Set(seq)).toEqual(new Set(["red"]));
    expect(seq.length).toBe(dashGhostCount({ red: 1 }));
  });

  it("빨강+주황이면 새우 근처(끝)는 빨강, 꼬리(앞)는 주황", () => {
    const seq = dashGhostColorSequence({ red: 3, orange: 3 }, seededRng(3));
    expect(seq[seq.length - 1]).toBe("red"); // 새우 근처
    expect(seq[0]).toBe("orange");           // 꼬리
  });

  it("골고루 찍으면 무지개(모든 색이 최소 1번, 팔레트 순서)", () => {
    const points = { red: 3, orange: 3, yellow: 3, green: 3, blue: 3, purple: 3, white: 3 };
    const seq = dashGhostColorSequence(points, seededRng(11));
    const t = tally(seq);
    for (const c of DASH_COLORS) expect(t[c]).toBeGreaterThan(0);
    // 시퀀스는 팔레트 역순(끝이 빨강)으로 단조 정렬 — 색 경계가 한 번씩만 바뀐다
    const order = DASH_COLORS.slice().reverse();
    let idx = 0;
    for (const c of seq) {
      while (order[idx] !== c) idx++;
      expect(idx).toBeLessThan(order.length);
    }
  });

  it("치우친 포인트는 그 색이 가장 많다", () => {
    const seq = dashGhostColorSequence({ red: 10, blue: 1 }, seededRng(99));
    const t = tally(seq);
    expect(t.red).toBeGreaterThan(t.blue ?? 0);
  });

  it("기대치 1 미만의 작은 색은 시드에 따라 안 나올 수 있다(운)", () => {
    // 빨강이 지배적 → 파랑 기대 슬롯 < 1 → 일부 시드에서는 파랑 0
    const points = { red: 12, blue: 1 }; // N=18, 파랑 기대 ≈ 18/13 ≈ 1.38 → 조정 위해 더 치우치게
    const skewed = { red: 30, blue: 1 };
    let missing = 0, present = 0;
    for (let s = 1; s <= 30; s++) {
      const seq = dashGhostColorSequence(skewed, seededRng(s));
      if (seq.includes("blue")) present++; else missing++;
    }
    expect(missing).toBeGreaterThan(0); // 운 나쁘면 안 나옴
    expect(present).toBeGreaterThan(0); // 운 좋으면 나옴
    // points는 참조만(캡 확인)
    expect(dashGhostCount(points)).toBeLessThanOrEqual(18);
  });

  it("뱀파이어 기본 dashColors는 복수 1포인트, 저장·복원된다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const vamp = state.chars.items.find((c) => c.side === "vampire");
    expect(vamp.dashColors).toEqual({ red: 1 });
    expect(vamp.dashPoints).toBe(DEFAULT_DASH_POINTS); // 기본 듬뿍
    vamp.dashColors = { red: 2, orange: 1, blue: 1 };
    vamp.dashPoints = 12;
    saveState(state, storage);
    const restored = loadState(storage);
    const rv = restored.chars.items.find((c) => c.side === "vampire");
    expect(rv.dashColors).toEqual({ red: 2, orange: 1, blue: 1 });
    expect(rv.dashPoints).toBe(12);
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

  it("ghostColorAtProgress: 0=꼬리 색, 1근처=새우 근처 색", () => {
    const seq = ["orange", "orange", "red", "red"];
    expect(ghostColorAtProgress(seq, 0)).toBe("orange");
    expect(ghostColorAtProgress(seq, 0.99)).toBe("red");
    expect(ghostColorAtProgress([], 0.5)).toBe("red"); // 빈 시퀀스 안전값
  });
});
