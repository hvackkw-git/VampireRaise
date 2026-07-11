import { describe, it, expect } from "vitest";
import {
  pathDamageMult, multiHitChance, explosionDamageMult, shieldHpMult, stunSeconds,
} from "../skills/dashColors.js";
import {
  resetDashEffects, applyDashPathDamage, applyDashArrivalEffects,
  absorbWithShield, EXPLOSION_RADIUS,
} from "../game/dashEffects.js";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickCombat } from "../game/combat.js";

function vamp(x, y, over = {}) {
  return { id: 1, side: "vampire", x, y, w: 32, h: 32, atk: 10, maxHp: 100, dead: false, dashColors: {}, ...over };
}
function human(id, x, y, over = {}) {
  return { id, side: "human", x, y, w: 32, h: 32, atk: 4, maxHp: 100, hp: 100, dead: false, level: 1, ...over };
}

describe("Dash 효과 계산", () => {
  it("색별 배율/확률", () => {
    expect(pathDamageMult({ yellow: 2 })).toBeCloseTo(0.2);
    expect(multiHitChance({ green: 1 })).toBeCloseTo(0.1);
    expect(multiHitChance({ green: 15 })).toBe(1); // 최대 100%
    expect(explosionDamageMult({ blue: 2 })).toBeCloseTo(0.2);
    expect(shieldHpMult({ purple: 2 })).toBeCloseTo(0.2);
    expect(stunSeconds({ white: 2 })).toBeCloseTo(2);
    expect(pathDamageMult({})).toBe(0);
  });
});

describe("노랑 경로 데미지", () => {
  it("스친 적을 1회만 큐에 넣는다(노랑 있을 때)", () => {
    const c = vamp(100, 100, { dashColors: { yellow: 2 }, atk: 10 });
    resetDashEffects(c);
    const near = human(2, 110, 100); // 중심 거리 10
    const far = human(3, 300, 100);
    const chars = [c, near, far];
    const state = {};
    const evs = [];
    applyDashPathDamage(c, chars, state, evs);
    applyDashPathDamage(c, chars, state, evs); // 두 번째 틱: 중복 없음
    expect(state._dashHits).toHaveLength(1);
    expect(state._dashHits[0].target).toBe(near);
    expect(state._dashHits[0].dmg).toBe(2); // 10 × 0.2
    expect(evs.filter((e) => e.type === "dashZap")).toHaveLength(1);
  });

  it("노랑 0이면 아무 일도 없다", () => {
    const c = vamp(100, 100, { dashColors: {} });
    resetDashEffects(c);
    const state = {};
    applyDashPathDamage(c, [c, human(2, 105, 100)], state, []);
    expect(state._dashHits ?? []).toHaveLength(0);
  });
});

describe("도착 효과(폭발/실드/스턴)", () => {
  it("파랑 폭발: 반경 내 적을 큐에 넣는다", () => {
    const c = vamp(100, 100, { dashColors: { blue: 2 }, atk: 10 });
    const inR = human(2, 100 + EXPLOSION_RADIUS - 8, 100);
    const outR = human(3, 100 + EXPLOSION_RADIUS + 60, 100);
    const state = {};
    const evs = [];
    applyDashArrivalEffects(c, [c, inR, outR], inR, state, 0, evs);
    expect(state._dashHits.map((h) => h.target)).toContain(inR);
    expect(state._dashHits.map((h) => h.target)).not.toContain(outR);
    expect(evs.some((e) => e.type === "dashExplosion")).toBe(true);
  });

  it("보라 실드: 흡수 실드와 지속시간을 부여", () => {
    const c = vamp(100, 100, { dashColors: { purple: 2 }, maxHp: 100 });
    const evs = [];
    applyDashArrivalEffects(c, [c], null, {}, 0, evs);
    expect(c._shieldHp).toBe(20); // 100 × 0.2
    expect(c._shieldT).toBeGreaterThan(0);
    expect(evs.some((e) => e.type === "dashShield")).toBe(true);
  });

  it("하양 스턴: 대상 인간을 스턴 상태로", () => {
    const c = vamp(100, 100, { dashColors: { white: 2 } });
    const t = human(2, 120, 100);
    const evs = [];
    applyDashArrivalEffects(c, [c, t], t, {}, 1000, evs);
    expect(t.state).toBe("STUN");
    expect(t._stunUntil).toBe(1000 + 2000);
    expect(evs.some((e) => e.type === "dashStun")).toBe(true);
  });

  it("스턴은 대상이 인간일 때만", () => {
    const c = vamp(100, 100, { dashColors: { white: 2 } });
    const t = { id: 2, side: "slave", x: 120, y: 100, w: 32, h: 32, dead: false };
    applyDashArrivalEffects(c, [c, t], t, {}, 1000, []);
    expect(t.state).toBeUndefined();
  });
});

describe("보라 실드 흡수", () => {
  it("흡수 후 남은 피해만 통과, 실드 소진 시 해제", () => {
    const c = { _shieldHp: 15, _shieldT: 5 };
    expect(absorbWithShield(c, 10)).toEqual({ dealt: 0, absorbed: 10 });
    expect(c._shieldHp).toBe(5);
    const r = absorbWithShield(c, 12);
    expect(r).toEqual({ dealt: 7, absorbed: 5 });
    expect(c._shieldHp).toBe(0);
    expect(c._shieldT).toBe(0);
  });

  it("실드 없으면 그대로 통과", () => {
    expect(absorbWithShield({}, 8)).toEqual({ dealt: 8, absorbed: 0 });
  });
});

describe("combat 통합", () => {
  it("state._dashHits가 tickCombat에서 적용·소모된다", () => {
    const state = createInitialState();
    const v = state.chars.items[0];
    const h = createCharacter(state, "human", { x: 260, y: v.y, maxHp: 100, atk: 1 });
    h.hp = 100;
    state._dashHits = [{ attacker: v, target: h, dmg: 30 }];
    tickCombat(state, 0.016);
    expect(h.hp).toBe(70);
    expect(state._dashHits).toHaveLength(0);
  });

  it("초록 연타: 확률 100%(green≥10)면 근접 공격이 두 번 들어간다", () => {
    const state = createInitialState();
    const v = state.chars.items[0];
    state.chars.items = [v];
    v.x = 100; v.y = 200; v.state = "CRAWL"; v.atk = 10; v._atkCd = 0;
    v.dashColors = { green: 10 }; // 연타 확률 100%
    const h = createCharacter(state, "human", { x: 118, y: v.y, maxHp: 500, atk: 1 });
    h.hp = 500; h._atkCd = 5;
    const events = tickCombat(state, 0.016);
    expect(h.hp).toBe(480); // 10 × 2회
    expect(events.some((e) => e.type === "multiHit")).toBe(true);
  });

  it("실드를 두른 뱀파이어는 근접 피해를 흡수한다", () => {
    const state = createInitialState();
    const v = state.chars.items[0];
    state.chars.items = [v];
    v.x = 100; v.y = 200; v.state = "CRAWL"; v.hp = 100; v.maxHp = 100; v._atkCd = 5;
    v._shieldHp = 50; v._shieldMax = 50; v._shieldT = 5;
    const h = createCharacter(state, "human", { x: 118, y: v.y, maxHp: 100, atk: 20 });
    h._atkCd = 0;
    tickCombat(state, 0.016);
    expect(v.hp).toBe(100);   // 20 피해 전부 흡수
    expect(v._shieldHp).toBe(30);
  });
});
