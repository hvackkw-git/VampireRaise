// 감지·핑 추적 AI 테스트:
// 원 안에 들어오면 최근접 적에게 핑을 찍고 접근, 1초마다 갱신,
// 범위 이탈 시 배회 복귀, 노예는 감지 반경이 작다, 플랫폼 위에서는 그냥 걷다 떨어진다.
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickAggro, estimateRouteDist, findDashRoute } from "../game/ai.js";
import { tickCharacter } from "../engine/physics.js";
import {
  DETECT_RANGE, PING_REFRESH_S, FLOOR_Y, CHAR_SIZE,
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

  it("뱀파이어 핑은 인간에서 가장 가까운 플랫폼 블록 위를 가리킨다", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const human = put("human", 160);
    state.platforms.items.push(
      { id: 1, x: 20, y: 500, blockType: "platform_block" },
      { id: 2, x: 160, y: human.y + human.h, blockType: "platform_block" },
    );

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp._ping).toMatchObject({ targetId: human.id, platformId: 2, x: 170, y: FLOOR_Y - CHAR_SIZE / 2 });
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
    const human = put("human", 100 + DETECT_RANGE.vampire - 20); // 감지 원 안, 평지 (우회 = 직선)
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
  });

  it("직선 감지 원 밖이면 우회 거리가 예산(×2) 이내여도 돌진하지 않는다", () => {
    const vamp = put("vampire", 0);
    const human = put("human", DETECT_RANGE.vampire + 30); // 감지 원 밖
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).not.toBe("DASH");
    expect(vamp._dashTargetId).toBeNull();
  });

  it("노예는 뱀파이어 돌진 대상이 아니다", () => {
    const vamp = put("vampire", 100);
    const slave = put("slave", 140);
    state.platforms.items.push({ id: 1, x: slave.x, y: slave.y + slave.h, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).not.toBe("DASH");
    expect(vamp._dashTargetId).toBeNull();
  });

  it("대상이 플랫폼 위쪽 영역에 없으면 적 중심을 목표로 돌진한다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 140);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + 16, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    expect(vamp._dashGoal).toEqual({ x: human.x + human.w / 2, y: human.y + human.h / 2 });
  });

  it("우회 거리가 예산(×2)을 넘으면 돌진하지 않는다", () => {
    const vamp = put("vampire", 0);
    put("human", DETECT_RANGE.vampire * 2 + 40);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("IDLE");
    expect(vamp._ping).toBeNull();
  });

  it("인간 근처에 플랫폼 블록이 없어도 감지 원 안이면 BFS 경로로 돌진한다", () => {
    const vamp = put("vampire", 80);
    put("human", 140);

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    expect(vamp._ping).toBeNull();
  });

  it("BFS 우회 거리: 플랫폼 블록을 피해 돌아가는 실제 최단 경로를 계산한다", () => {
    const a = { x: 100, y: 500, w: 32, h: 32 };
    const b = { x: 100, y: 400, w: 32, h: 32 };
    const clear = estimateRouteDist(a, b, []);
    const blockedRoute = findDashRoute(a, b, [
      { id: 1, x: 100, y: 460, blockType: "platform_block" },
    ]);
    expect(blockedRoute.dist).toBeGreaterThan(clear);
    expect(blockedRoute.path.some((pt) => pt.x >= 100 && pt.x < 120 && pt.y >= 460 && pt.y < 480))
      .toBe(false);
    // 논리 레이어 블록(레드스톤)은 벽이 아니므로 경로 길이 변화 없음
    const wire = estimateRouteDist(a, b, [
      { id: 1, x: 100, y: 460, blockType: "redstone_block" },
    ]);
    expect(wire).toBe(clear);
  });

  it("중력을 무시하고 위쪽 감지 원 안 대상에게 최단 경로로 날아간다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 100, { y: FLOOR_Y - CHAR_SIZE - 70 }); // 감지 원 안, 우회 거리 ≤ 180
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + CHAR_SIZE, blockType: "platform_block" });
    const ctx = { platforms: state.platforms.items, blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    const y0 = vamp.y;
    let flewUp = false;
    for (let t = 0; t < 1; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
      if (vamp.state === "DASH" && vamp.vy < 0 && vamp.y < y0 - 20) { flewUp = true; break; }
    }
    expect(flewUp).toBe(true);
  });

  it("감지 원 안의 적이 2마리 이상이면 BFS 경로가 더 짧은 대상에게 돌진한다", () => {
    const vamp = put("vampire", 100);
    const nearBlocked = put("human", 100, { y: FLOOR_Y - CHAR_SIZE - 70 });
    const farClear = put("human", 165);
    state.platforms.items.push({ id: 1, x: nearBlocked.x, y: nearBlocked.y + CHAR_SIZE, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    expect(vamp._dashTargetId).toBe(farClear.id);
  });

  it("위쪽 플랫폼으로 돌진할 때 경로 Y를 착지 가능한 높이에 맞춘다", () => {
    const plat = { id: 1, x: 120, y: 560, blockType: "platform_block" };
    const vamp = put("vampire", 40, { y: 560 - CHAR_SIZE });
    put("human", 120, { y: 560 - CHAR_SIZE, _platformId: 1 });
    state.platforms.items.push(plat);

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    expect(vamp._dashRoute.some((pt) => pt.y === plat.y - CHAR_SIZE / 2)).toBe(true);
    expect(vamp._dashRoute.some((pt) => pt.y === plat.y + 10)).toBe(false);
  });

  it("대상에 도달하면 돌진이 끝나고(낙하) 쿨다운이 걸린다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    const ctx = { platforms: state.platforms.items, blockPowered: new Map(), now: 10000, rng: () => 0.9 };
    let ended = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
      if (vamp._dashTargetId == null && vamp._dashCd > 0) { ended = true; break; }
    }
    expect(ended).toBe(true);
  });

  it("위쪽 플랫폼 목표에 도달하면 떨어지지 않고 플랫폼 위에 안착한다", () => {
    const plat = { id: 1, x: 120, y: FLOOR_Y - CHAR_SIZE - 70 + CHAR_SIZE, blockType: "platform_block" };
    const vamp = put("vampire", 100);
    const human = put("human", 120, { y: plat.y - CHAR_SIZE, _platformId: plat.id });
    state.platforms.items.push(plat);
    const ctx = { platforms: state.platforms.items, blockPowered: new Map(), now: 10000, rng: () => 0.9 };

    let ended = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.9);
      tickCharacter(vamp, ctx, 1 / 60);
      if (vamp._dashTargetId == null && vamp._dashCd > 0) { ended = true; break; }
    }

    expect(ended).toBe(true);
    expect(vamp._platformId).toBe(plat.id);
    expect(vamp.y).toBe(plat.y - CHAR_SIZE);
    expect(Math.abs(vamp.x + vamp.w / 2 - (plat.x + 10))).toBeLessThan(0.001);
    expect(Math.abs(human.x - 120)).toBeLessThan(0.001);
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
