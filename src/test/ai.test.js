// 감지·핑 추적 AI 테스트:
// 원 안에 들어오면 최근접 적에게 핑을 찍고 접근, 1초마다 갱신,
// 범위 이탈 시 배회 복귀, 노예는 감지 반경이 작다, 플랫폼 위에서는 그냥 걷다 떨어진다.
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickAggro, estimateRouteDist } from "../game/ai.js";
import { tickCharacter } from "../engine/physics.js";
import {
  DETECT_RANGE, PING_REFRESH_S, FLOOR_Y, CHAR_SIZE, DASH_BLOCK_DETOUR_PX,
} from "../constants.js";

let state;
beforeEach(() => {
  state = createInitialState();
  state.chars.items = []; // 빈 전장에서 직접 배치
});

const put = (side, x, over = {}) => {
  const c = createCharacter(state, side, { x, y: FLOOR_Y - CHAR_SIZE, maxHp: 100, atk: 5, ...over });
  c.state = "IDLE";
  c.timer = 99;   // 자율 행동 억제 — 감지 반응만 관찰
  c._pingCd = 0;  // 첫 틱에 즉시 핑 갱신
  return c;
};

describe("핑 추적", () => {
  it("감지 원 안의 최근접 적에게 핑을 찍고 그쪽으로 걷는다", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999; // 돌진 배제 — 걷기 추적 검증
    put("human", 100 + DETECT_RANGE.vampire + 40);      // 원 밖 (무시)
    const near = put("human", 100 + DETECT_RANGE.vampire - 20); // 원 안
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(near.id);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp.dir).toBe(1);
  });

  it("감지 원 밖이면 핑이 없다", () => {
    const vamp = put("vampire", 0);
    vamp._dashCd = 999;
    put("human", DETECT_RANGE.vampire + 80);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping).toBeNull();
    expect(vamp.state).toBe("IDLE");
  });

  it("핑은 1초 주기로 갱신된다: 대상이 범위를 벗어나도 다음 갱신까지 유지", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const human = put("human", 160);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(human.id);
    // 대상이 멀리 도망 — 갱신 전까지는 핑 유지
    human.x = 100 + DETECT_RANGE.vampire + 100;
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(human.id);
    // 1초 경과 후 갱신 → 범위 밖이므로 핑 해제 → 배회 복귀
    tickAggro(state, PING_REFRESH_S + 0.1, () => 0.9);
    expect(vamp._ping).toBeNull();
  });

  it("서로의 원에 들어오면 양쪽 다 핑을 찍는다", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const human = put("human", 160);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(human.id);
    expect(human._ping?.targetId).toBe(vamp.id);
    expect(vamp.dir).toBe(1);
    expect(human.dir).toBe(-1);
  });

  it("노예는 감지 반경이 작다: 같은 거리에서 뱀파이어는 보지만 노예는 못 본다", () => {
    expect(DETECT_RANGE.slave).toBeLessThan(DETECT_RANGE.vampire);
    const d = DETECT_RANGE.slave + 15;
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const slave = put("slave", 100);
    put("human", 100 + d);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping).not.toBeNull();
    expect(slave._ping).toBeNull();
  });

  it("교전 중(FIGHT)에는 핑 추적이 개입하지 않는다", () => {
    const vamp = put("vampire", 100);
    vamp.state = "FIGHT";
    put("human", 130);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("FIGHT");
    expect(vamp._ping).toBeNull();
  });
});

describe("뱀파이어 패시브: 혈귀 돌진", () => {
  it("감지 원 안의 적 + 우회 거리가 예산(×2) 이내면 돌진(DASH)한다", () => {
    const vamp = put("vampire", 100);
    put("human", 100 + DETECT_RANGE.vampire - 20); // 감지 원 안, 평지 (우회 = 직선)
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
  });

  it("감지 원 밖이면 돌진하지 않는다 (감지는 다른 유닛과 동일)", () => {
    const vamp = put("vampire", 0);
    put("human", DETECT_RANGE.vampire + 30); // 원 밖 — 예전 ×2 발동 거리였던 위치
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("IDLE");
    expect(vamp._ping).toBeNull();
  });

  it("감지됐어도 너무 돌아가야 하면(우회 예산 초과) 발동하지 않고 걷는다", () => {
    // 인간이 바로 위(수직 85px)에 있고, 사이를 블록이 가로막음:
    // 우회 추정 = 85×2 + 블록 가산 40 = 210 > 예산 180 → 돌진 X → 핑 걷기(STAY: 바로 위)
    const vampY = FLOOR_Y - CHAR_SIZE;
    const vamp = put("vampire", 100);
    put("human", 100, { y: vampY - 85 });
    const midY = vampY + CHAR_SIZE / 2 - 42; // 두 중심 사이
    state.platforms.items.push({ id: 1, x: 100, y: Math.round(midY / 20) * 20, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).not.toBe("DASH");
    expect(vamp._ping).not.toBeNull(); // 인식은 했고 (감지 원 안)
  });

  it("우회 거리 추정: 경로를 막는 블록마다 가산된다", () => {
    const a = { x: 100, y: 500, w: 32, h: 32 };
    const b = { x: 100, y: 400, w: 32, h: 32 };
    const clear = estimateRouteDist(a, b, []);
    const blocked = estimateRouteDist(a, b, [
      { id: 1, x: 100, y: 460, blockType: "platform_block" },
    ]);
    expect(blocked).toBe(clear + DASH_BLOCK_DETOUR_PX);
    // 논리 레이어 블록(레드스톤)은 벽이 아니므로 가산 없음
    const wire = estimateRouteDist(a, b, [
      { id: 1, x: 100, y: 460, blockType: "redstone_block" },
    ]);
    expect(wire).toBe(clear);
  });

  it("중력을 무시하고 위쪽 대상에게도 직선으로 날아간다", () => {
    const vamp = put("vampire", 100);
    put("human", 120, { y: FLOOR_Y - CHAR_SIZE - 70 }); // 직선 ~73 < 90, 우회 160 ≤ 180
    const ctx = { platforms: [], blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    const y0 = vamp.y;
    let flewUp = false;
    for (let t = 0; t < 1; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
      if (vamp.state === "DASH" && vamp.vy < 0 && vamp.y < y0 - 20) { flewUp = true; break; }
    }
    expect(flewUp).toBe(true);
  });

  it("대상에 도달하면 돌진이 끝나고(낙하) 쿨다운이 걸린다", () => {
    const vamp = put("vampire", 100);
    put("human", 100 + DETECT_RANGE.vampire - 20);
    const ctx = { platforms: [], blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    let ended = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
      if (vamp._dashTargetId == null && vamp._dashCd > 0) { ended = true; break; }
    }
    expect(ended).toBe(true);
  });

  it("노예는 돌진하지 않는다 (뱀파이어 전용 패시브)", () => {
    const slave = put("slave", 100);
    put("human", 100 + DETECT_RANGE.slave - 10); // 노예 감지 원 안
    tickAggro(state, 0.016, () => 0.9);
    expect(slave.state).toBe("CRAWL"); // 핑 걷기만 한다
  });
});

describe("플랫폼 위 최단거리 추적 (경로 탐색 없음)", () => {
  it("플랫폼 위에서 아래 적을 인식하면 수평으로 걷다가 가장자리에서 떨어진다", () => {
    // 감지는 유클리드 거리 — 원 안에 들도록 플랫폼(y=560)과 인간(x=100)을 가깝게 배치
    const plat = { id: 1, x: 140, y: 560, blockType: "platform_block" };
    const vamp = put("vampire", 140, { y: 560 - CHAR_SIZE });
    vamp._dashCd = 999;
    vamp._platformId = 1;
    const human = put("human", 100); // 왼쪽 아래 바닥 (dist ≈ 75 < 90)
    human.timer = 99;
    const ctx = { platforms: [plat], blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    for (let t = 0; t < 4; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
    }
    // 가장자리를 넘어 떨어져 바닥에 도달했어야 한다
    expect(vamp._platformId).toBeNull();
    expect(vamp.y).toBe(FLOOR_Y - CHAR_SIZE);
    expect(vamp.x).toBeLessThan(140); // 대상 방향(왼쪽)으로 이동함
  });

  it("대상이 바로 아래면 제자리에 멈춘다 (국소 최소거리)", () => {
    const plat = { id: 1, x: 100, y: 560, blockType: "platform_block" };
    const vamp = put("vampire", 94, { y: 560 - CHAR_SIZE }); // 중심 110 = 인간 중심과 동일
    vamp._dashCd = 999;
    vamp._platformId = 1;
    put("human", 94);
    const ctx = { platforms: [plat], blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    for (let t = 0; t < 1; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
    }
    expect(vamp._platformId).toBe(1);
    expect(vamp.state).toBe("STAY");
  });
});
