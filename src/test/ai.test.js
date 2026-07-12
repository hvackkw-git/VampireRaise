// 감지·핑 추적 AI 테스트:
// 원 안에 들어오면 최근접 적에게 핑을 찍고 접근, 1초마다 갱신,
// 범위 이탈 시 배회 복귀, 노예는 감지 반경이 작다, 플랫폼 위에서는 그냥 걷다 떨어진다.
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickAggro, estimateRouteDist, findDashRoute } from "../game/ai.js";
import { tickCharacter } from "../engine/physics.js";
import {
  DETECT_RANGE, PING_REFRESH_S, FLOOR_Y, CHAR_SIZE,
  HUMAN_PROJECTILE_RANGE, HUMAN_RANGED_BRACE_SPEED_MULT, CRAWL_SPD,
  DASH_COOLDOWN_S,
} from "../constants.js";

let state;
beforeEach(() => {
  state = createInitialState();
  state.chars.items = []; // 빈 전장에서 직접 배치
  state.platforms.items = []; // 기본 플랫폼 없이 직접 배치
});

const put = (side, x, over = {}) => {
  const c = createCharacter(state, side, { x, y: FLOOR_Y - CHAR_SIZE, maxHp: 100, atk: 5, ...over });
  c.state = "CRAWL";
  c.timer = 99;   // 자율 행동 억제 — 감지 반응만 관찰
  c._pingCd = 0;  // 첫 틱에 즉시 핑 갱신
  return c;
};

describe("핑 추적", () => {
  it("뱀파이어는 플랫폼 윗면을 찾은 적에게만 핑을 찍고 그쪽으로 걷는다", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999; // 돌진 배제 — 걷기 추적 검증
    put("human", 100 + DETECT_RANGE.vampire + 40);      // 원 밖 (무시)
    const near = put("human", 100 + DETECT_RANGE.vampire - 20); // 원 안
    state.platforms.items.push({ id: 1, x: near.x, y: near.y + near.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(near.id);
    expect(vamp._ping?.platformId).toBe(1);
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
    expect(vamp.state).toBe("CRAWL");
  });

  it("핑은 1초 주기로 갱신된다: 대상이 범위를 벗어나도 다음 갱신까지 유지", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const human = put("human", 160);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
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

  it("인간은 적을 쫓지 않고 베이스(왼쪽 아래 존)를 향해 행군한다", () => {
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const human = put("human", 160);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp._ping?.targetId).toBe(human.id);   // 뱀파이어는 여전히 인간을 감지·추적
    expect(vamp._ping?.platformId).toBe(1);
    expect(human._ping).toBeNull();                // 인간은 핑 없이 베이스로 행군
    expect(human.dir).toBe(-1);                    // 베이스는 왼쪽
    expect(vamp.dir).toBe(1);
  });

  it("노예는 감지 반경이 작다: 같은 거리에서 뱀파이어는 보지만 노예는 못 본다", () => {
    expect(DETECT_RANGE.slave).toBeLessThan(DETECT_RANGE.vampire);
    const d = DETECT_RANGE.slave + 15;
    const vamp = put("vampire", 100);
    vamp._dashCd = 999;
    const slave = put("slave", 100);
    const human = put("human", 100 + d);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
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

  it("다른 높이의 핑 목표를 쫓다 세 번 튕기면 아래로 드롭스루한다", () => {
    const platform = { id: 1, x: 80, y: 500, blockType: "platform_block" };
    state.platforms.items.push(platform);
    const vamp = put("vampire", 90, { y: platform.y - CHAR_SIZE });
    const human = put("human", 170);
    vamp._platformId = platform.id;
    vamp._dashCd = 999;
    vamp._pingCd = 999;
    vamp._ping = { targetId: human.id, x: human.x + human.w / 2, y: human.y + human.h / 2 };

    for (let i = 0; i < 3; i++) {
      vamp.dir = -1; // 물리 충돌이 목표 반대 방향으로 튕겨놓은 상태
      tickAggro(state, 0.1, () => 0.9);
    }

    expect(vamp.state).toBe("FALL");
    expect(vamp._dropThroughId).toBe(platform.id);
  });

  it("다른 높이의 핑 목표가 위에 있으면 세 번 튕긴 뒤 점프한다", () => {
    const vamp = put("vampire", 90);
    const human = put("human", 170, { y: FLOOR_Y - CHAR_SIZE - 80 });
    vamp._dashCd = 999;
    vamp._pingCd = 999;
    vamp._ping = { targetId: human.id, x: human.x + human.w / 2, y: human.y + human.h / 2 };

    for (let i = 0; i < 3; i++) {
      vamp.dir = -1;
      tickAggro(state, 0.1, () => 0.9);
    }

    expect(vamp.state).toBe("JUMP");
    expect(vamp.vy).toBeLessThan(0);
  });
});

describe("뱀파이어 패시브: 혈귀 돌진", () => {
  it("감지 원 안의 적 + 우회 거리가 예산(×2) 이내면 돌진(DASH)한다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 100 + DETECT_RANGE.vampire - 20); // 감지 원 안, 평지 (우회 = 직선)
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashCd).toBe(0);
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

  it("대상이 플랫폼 위쪽 영역에 없으면 공중 목표로 돌진하지 않는다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 140);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + 16, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("CRAWL");
    expect(vamp._dashTargetId).toBeNull();
    expect(vamp._ping).toBeNull();
  });

  it("우회 거리가 예산(×2)을 넘으면 돌진하지 않는다", () => {
    const vamp = put("vampire", 0);
    put("human", DETECT_RANGE.vampire * 2 + 40);
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp._ping).toBeNull();
  });

  it("돌진 경로가 너무 길면 다음 인식 전까지 경로 첫 지점으로 걸어간다", () => {
    const vamp = put("vampire", 100);
    vamp.dashRouteMult = 0.5; // 감지 원 안이지만 우회 경로는 돌진 예산을 넘도록 축소
    const human = put("human", 100, { y: FLOOR_Y - CHAR_SIZE - 70 });
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("CRAWL");
    expect(vamp._dashTargetId).toBeNull();
    expect(vamp._ping).toMatchObject({ targetId: human.id, platformId: 1 });
    expect(vamp._ping.x).not.toBeCloseTo(human.x + human.w / 2);
  });

  it("인간 근처에 플랫폼 블록이 없으면 뱀파이어 핑과 돌진을 시작하지 않는다", () => {
    const vamp = put("vampire", 80);
    put("human", 140);

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("CRAWL");
    expect(vamp._ping).toBeNull();
    expect(vamp._dashTargetId).toBeNull();
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

  it("감지 원 안의 적이 2마리 이상이어도 플랫폼 윗면 목표가 있는 대상에게만 돌진한다", () => {
    const vamp = put("vampire", 100);
    const nearBlocked = put("human", 100, { y: FLOOR_Y - CHAR_SIZE - 70 });
    put("human", 165); // 플랫폼 윗면 목표가 없으므로 제외
    state.platforms.items.push({ id: 1, x: nearBlocked.x, y: nearBlocked.y + CHAR_SIZE, blockType: "platform_block" });

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    expect(vamp._dashTargetId).toBe(nearBlocked.id);
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
    expect(vamp._dashCd).toBeCloseTo(DASH_COOLDOWN_S);
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
    // 안착 직후 같은 프레임부터 다시 걷기 시작하므로 최대 한 프레임 이동은 허용한다.
    expect(Math.abs(vamp.x + vamp.w / 2 - (plat.x + 10))).toBeLessThanOrEqual(1.21);
    expect(Math.abs(human.x - 120)).toBeLessThan(0.001);
  });

  it("돌진 중 대상이 죽어도 뚝 떨어지지 않고 고정된 목표까지 마저 날아간다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    human.dead = true; // 자기 경로/폭발 피해 등으로 대상이 먼저 죽는 상황
    tickAggro(state, 0.016, () => 0.9);
    // 목표 지점(고정)으로 계속 비행 — 제자리 낙하도, 플랫폼 스냅 착지(순간이동)도 아니다
    expect(vamp.state).toBe("DASH");
    expect(vamp._platformId).toBeNull();
    expect(Math.hypot(vamp.vx, vamp.vy)).toBeGreaterThan(0); // 목표로 향하는 속도 유지
  });

  it("돌진이 타임아웃되면 목표로 순간이동하지 않는다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    const xBefore = vamp.x;
    vamp._dashTimeLeft = 0; // 안전 타임아웃 도달
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("FALL");
    expect(vamp.x).toBe(xBefore);
    expect(vamp._dashCd).toBeCloseTo(DASH_COOLDOWN_S);
  });

  it("전원 ON(투명) 게이트는 돌진 경로의 벽으로 치지 않는다", () => {
    const a = { x: 100, y: 500, w: 32, h: 32 };
    const b = { x: 100, y: 400, w: 32, h: 32 };
    const clear = estimateRouteDist(a, b, []);
    const gate = [{ id: 1, x: 100, y: 460, blockType: "gate_block" }];
    const off = estimateRouteDist(a, b, gate);                      // 신호 없음 → 벽
    const on = estimateRouteDist(a, b, gate, new Map([[1, true]])); // ON → 통과
    expect(off).toBeGreaterThan(clear);
    expect(on).toBe(clear);
  });

  it("전원 ON(투명) 게이트 윗면은 돌진 착지 목표가 아니다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 140);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "gate_block" });
    tickAggro(state, 0.016, () => 0.9, new Map([[1, true]]));
    expect(vamp.state).toBe("CRAWL");
    expect(vamp._dashTargetId).toBeNull();
    expect(vamp._ping).toBeNull();
  });

  it("전원 OFF 게이트는 물리처럼 지형이다: 윗면이 돌진 착지 목표가 된다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 140);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "gate_block" });
    tickAggro(state, 0.016, () => 0.9, new Map([[1, false]]));
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashGoal?.platformId).toBe(1);
  });

  it("up-가시·스프링·블랙홀 윗면은 돌진 착지 목표가 아니다", () => {
    for (const blockType of ["spike_block", "spring_block", "black_hole_block"]) {
      state.chars.items = [];
      const vamp = put("vampire", 100);
      const human = put("human", 140);
      state.platforms.items = [{ id: 1, x: human.x, y: human.y + human.h, blockType, rotation: 0 }];
      tickAggro(state, 0.016, () => 0.9);
      expect(vamp.state, blockType).toBe("CRAWL");
      expect(vamp._dashTargetId, blockType).toBeNull();
      expect(vamp._ping, blockType).toBeNull();
    }
  });

  it("옆·아래 방향 가시 윗면은 평평하므로 착지 목표가 될 수 있다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 140);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "spike_block", rotation: 90 });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
  });

  it("노예는 돌진하지 않는다 (뱀파이어 전용 패시브)", () => {
    const slave = put("slave", 100);
    put("human", 100 + DETECT_RANGE.slave - 10); // 노예 감지 원 안
    tickAggro(state, 0.016, () => 0.9);
    expect(slave.state).toBe("CRAWL"); // 핑 걷기만 한다
  });
});

describe("점프 중 돌진: 공중 좌표보정 후 최단 경로 돌진", () => {
  // 공중(JUMP) 상태의 뱀파이어를 만든다 — 그리드에서 벗어난 임의 좌표로 배치
  const putJumper = (x, y) => {
    const c = put("vampire", x, { y });
    c.state = "JUMP";
    c.vx = 30; c.vy = -40; // 상승 중
    c._jumpApexY = null;
    return c;
  };

  it("점프하다 감지범위 안 적이 있으면 돌진(DASH)한다", () => {
    const vamp = putJumper(103, FLOOR_Y - CHAR_SIZE - 37); // 공중, 그리드에서 벗어난 좌표
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashTargetId).toBe(human.id);
    expect(vamp._jumpApexY).toBeNull(); // 잔여 점프 상태 정리
  });

  it("경로는 [공중 현재 위치 → 좌표보정 시작 위치 → …] 순으로 시작한다", () => {
    const vamp = putJumper(103, FLOOR_Y - CHAR_SIZE - 37);
    const midairCenter = { x: vamp.x + vamp.w / 2, y: vamp.y + vamp.h / 2 };
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);

    const path = vamp._dashRoute;
    // path[0] = 공중 현재 위치(중심)
    expect(path[0].x).toBeCloseTo(midairCenter.x, 6);
    expect(path[0].y).toBeCloseTo(midairCenter.y, 6);
    // path[1] = 좌표보정 시작 위치 = 20px 그리드 셀 중심(그리드에 정렬됨)
    expect((path[1].x - 10) % 20).toBeCloseTo(0, 6);
    expect((path[1].y - 10) % 20).toBeCloseTo(0, 6);
    // 보정 위치는 공중 위치를 그리드에 맞춘 것이라 가까이 있다
    expect(Math.hypot(path[1].x - midairCenter.x, path[1].y - midairCenter.y)).toBeLessThan(20);
  });

  it("감지범위 밖이면 점프 중에도 돌진하지 않는다", () => {
    const vamp = putJumper(0, FLOOR_Y - CHAR_SIZE - 37);
    put("human", DETECT_RANGE.vampire + 60); // 감지 원 밖
    state.platforms.items.push({ id: 1, x: 400, y: FLOOR_Y, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("JUMP"); // 계속 점프
    expect(vamp._dashTargetId ?? null).toBeNull();
  });

  it("쿨다운 중이면 점프 중 돌진하지 않는다", () => {
    const vamp = putJumper(103, FLOOR_Y - CHAR_SIZE - 37);
    vamp._dashCd = 999;
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("JUMP");
    expect(vamp._dashTargetId ?? null).toBeNull();
  });

  it("좌표보정 시작 위치는 플랫폼 블록 속에 찍히지 않는다 (빈 셀로 밀어냄)", () => {
    // 공중 중심이 벽 블록 셀(5,22)=중심(110,450) 안에 겹친 상태로 배치
    const wall = { id: 1, x: 100, y: 440, blockType: "platform_block" };
    const targetPlat = { id: 2, x: 100, y: 540, blockType: "platform_block" };
    state.platforms.items.push(wall, targetPlat);
    const vamp = putJumper(94, 434); // 중심 (110, 450) → 벽 셀 내부
    const human = put("human", 94, { y: targetPlat.y - CHAR_SIZE, _platformId: 2 }); // 중심 (110,524), dist 74<90

    tickAggro(state, 0.016, () => 0.9);

    expect(vamp.state).toBe("DASH");
    const path = vamp._dashRoute;
    // path[0]은 실제 공중 위치(벽 안일 수 있음), path[1]은 좌표보정 시작 위치
    const start = path[1];
    const insideWall = start.x >= wall.x && start.x < wall.x + 20
      && start.y >= wall.y && start.y < wall.y + 20;
    expect(insideWall).toBe(false);
    // 다른 어떤 solid 플랫폼 블록 속에도 있지 않다
    for (const p of state.platforms.items) {
      const inside = start.x >= p.x && start.x < p.x + 20 && start.y >= p.y && start.y < p.y + 20;
      expect(inside, `start in block ${p.id}`).toBe(false);
    }
  });
});

describe("하강 중 돌진: 점프+돌진과 동일 로직", () => {
  // 공중(FALL) 상태의 뱀파이어 — 드롭스루/이탈 낙하 등으로 떨어지는 중
  const putFaller = (x, y) => {
    const c = put("vampire", x, { y });
    c.state = "FALL";
    c.vx = 0; c.vy = 40; // 낙하 중
    c._jumpApexY = null;
    return c;
  };

  it("하강하다 감지범위 안 적이 있으면 돌진(DASH)한다", () => {
    const vamp = putFaller(103, FLOOR_Y - CHAR_SIZE - 37);
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashTargetId).toBe(human.id);
  });

  it("쿨다운 중이면 하강 중 돌진하지 않는다", () => {
    const vamp = putFaller(103, FLOOR_Y - CHAR_SIZE - 37);
    vamp._dashCd = 999;
    const human = put("human", 100 + DETECT_RANGE.vampire - 20);
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("FALL");
    expect(vamp._dashTargetId ?? null).toBeNull();
  });
});

describe("플랫폼 위 연속 이동", () => {
  it("아래 적에게 플랫폼 목표가 없어도 멈추지 않고 가장자리로 걸어 내려간다", () => {
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
    expect(vamp._platformId).toBeNull();
    expect(["CRAWL", "FALL", "JUMP"]).toContain(vamp.state);
    expect(["IDLE", "STAY"]).not.toContain(vamp.state);
  });

  it("위 플랫폼의 뱀파이어는 바로 아래 지면의 적에게 땅으로 돌진한다", () => {
    const plat = { id: 1, x: 100, y: 560, blockType: "platform_block" };
    state.platforms.items = [plat];
    const vamp = put("vampire", 94, { y: 560 - CHAR_SIZE }); // 플랫폼 위, 중심 110
    vamp._platformId = 1;
    put("human", 94); // 바로 아래 지면 (중심 110)
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashGoal?.platformId).toBeNull(); // 플랫폼이 아닌 지면 목표
    expect(vamp._dashGoal?.y).toBe(FLOOR_Y - CHAR_SIZE / 2);
  });

  it("평지에서는 옆의 지면 적에게 수평 돌진하지 않는다 (지면 돌진은 위→아래 전용)", () => {
    const vamp = put("vampire", 100); // 지면
    put("human", 100 + DETECT_RANGE.vampire - 20); // 같은 지면, 감지 원 안
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).not.toBe("DASH");
    expect(vamp._dashTargetId ?? null).toBeNull();
  });
});

describe("인간 원거리 자세 감속", () => {
  it("원거리 사거리 안에 적이 들어오면 _rangedBraced가 서고, 이속이 1/4로 준다", () => {
    const human = put("human", 100);
    put("vampire", 100 + HUMAN_PROJECTILE_RANGE - 20); // 사거리 안
    tickAggro(state, 1 / 60, () => 0.9);
    expect(human._rangedBraced).toBe(true);

    const ctx = { platforms: [], blockPowered: new Map(), now: 10000, rng: () => 0.5 };
    human.dir = 1;
    tickCharacter(human, ctx, 1 / 60);
    expect(Math.abs(human.vx)).toBeCloseTo(CRAWL_SPD * HUMAN_RANGED_BRACE_SPEED_MULT, 3);
  });

  it("사거리 밖이면 감속하지 않는다 (정상 이속)", () => {
    const human = put("human", 100);
    put("vampire", 100 + HUMAN_PROJECTILE_RANGE + 40); // 사거리 밖
    tickAggro(state, 1 / 60, () => 0.9);
    expect(human._rangedBraced).toBe(false);

    const ctx = { platforms: [], blockPowered: new Map(), now: 10000, rng: () => 0.5 };
    human.dir = 1;
    tickCharacter(human, ctx, 1 / 60);
    expect(Math.abs(human.vx)).toBeCloseTo(CRAWL_SPD, 3);
  });
});
