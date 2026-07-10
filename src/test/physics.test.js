// 캐릭터 물리 테스트: 착지·이탈 낙하·측면 반전·스프링·워프·스턴
import { describe, it, expect } from "vitest";
import { tickCharacter, startJump } from "../engine/physics.js";
import { FLOOR_Y, CHAR_SIZE, CHAR_SPRITES } from "../constants.js";
import { CHAR_HITBOX_W } from "../platform/platformBlockRenderer.js";

function makeChar(over = {}) {
  return {
    id: 1, side: "vampire",
    x: 100, y: FLOOR_Y - CHAR_SIZE, w: CHAR_SIZE, h: CHAR_SIZE,
    vx: 0, vy: 0, dir: 1, state: "CRAWL", timer: 99,
    _platformId: null, _stunUntil: 0, _stunImmuneUntil: 0,
    _spikeIgnoreUntil: 0, _warpCooldownUntil: 0,
    _blockBounces: 0, _blockBounceDecay: 0,
    dead: false,
    ...over,
  };
}

function makeCtx(platforms = [], powered = new Map()) {
  return { platforms, blockPowered: powered, now: 10000, rng: () => 0.5 };
}

function run(c, ctx, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) tickCharacter(c, ctx, dt);
}

describe("낙하와 착지", () => {
  it("공중에서 FALL로 바닥에 착지한다", () => {
    const c = makeChar({ y: 200, state: "FALL", vy: 0 });
    run(c, makeCtx(), 3);
    expect(c.y).toBe(FLOOR_Y - CHAR_SIZE);
    expect(["CRAWL", "JUMP", "FALL"]).toContain(c.state);
  });

  it("낙하 중 플랫폼 윗면에 착지한다", () => {
    const plat = { id: 7, x: 100, y: 400, blockType: "platform_block" };
    const c = makeChar({ x: 100, y: 300, state: "FALL", vy: 0 });
    const ctx = makeCtx([plat]);
    for (let t = 0; t < 2 && c._platformId !== 7; t += 1 / 60) tickCharacter(c, ctx, 1 / 60);
    expect(c._platformId).toBe(7);
    expect(c.y).toBe(400 - CHAR_SIZE);
  });

  it("플랫폼이 사라지면 자유낙하 후 바닥 착지", () => {
    const plat = { id: 7, x: 100, y: 400, blockType: "platform_block" };
    const ctx = makeCtx([plat]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, state: "CRAWL", _platformId: 7 });
    run(c, ctx, 0.1);
    expect(c._platformId).toBe(7);
    ctx.platforms.length = 0; // 블록 회수
    run(c, ctx, 3);
    expect(c._platformId).toBeNull();
    expect(c.y).toBe(FLOOR_Y - CHAR_SIZE);
  });

  it("레드스톤 배선은 지형이 아니다 (통과 낙하)", () => {
    const plat = { id: 7, x: 100, y: 400, blockType: "redstone_block" };
    const c = makeChar({ x: 100, y: 300, state: "FALL", vy: 0 });
    run(c, makeCtx([plat]), 3);
    expect(c._platformId).toBeNull();
    expect(c.y).toBe(FLOOR_Y - CHAR_SIZE);
  });


  it("1칸(20px) 빈 세로 구멍으로 낙하 통과한다", () => {
    const left = { id: 10, x: 80, y: 400, blockType: "platform_block" };
    const right = { id: 11, x: 120, y: 400, blockType: "platform_block" };
    const c = makeChar({ x: 95, y: 300, state: "FALL", vy: 0 });
    run(c, makeCtx([left, right]), 2);
    expect(c._platformId).toBeNull();
    expect(c.y).toBeGreaterThan(400);
  });

  it("1칸(20px) 빈 세로 구멍으로 점프 통과한다", () => {
    const left = { id: 10, x: 80, y: 400, blockType: "platform_block" };
    const right = { id: 11, x: 120, y: 400, blockType: "platform_block" };
    const c = makeChar({ x: 95, y: 410, state: "JUMP", vy: -180, vx: 0 });
    run(c, makeCtx([left, right]), 0.35);
    expect(c._platformId).toBeNull();
    expect(c.y + c.h).toBeLessThan(400);
  });

  it("ON 게이트는 통과, OFF 게이트는 착지", () => {
    const gate = { id: 9, x: 100, y: 400, blockType: "gate_block" };
    const onMap = new Map([[9, true]]);
    let c = makeChar({ x: 100, y: 300, state: "FALL", vy: 0 });
    run(c, makeCtx([gate], onMap), 3);
    expect(c._platformId).toBeNull();
    c = makeChar({ x: 100, y: 300, state: "FALL", vy: 0 });
    const offCtx = makeCtx([gate]);
    let landedOnGate = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickCharacter(c, offCtx, 1 / 60);
      if (c._platformId === 9) { landedOnGate = true; break; }
    }
    expect(landedOnGate).toBe(true);
  });
});

describe("걷기(CRAWL) 충돌", () => {
  it("진행 방향 블록에 막히면 반전한다", () => {
    const plat = { id: 3, x: 200, y: FLOOR_Y - 20, blockType: "platform_block" };
    const c = makeChar({ x: 150, state: "CRAWL", dir: 1, timer: 10 });
    run(c, makeCtx([plat]), 1);
    expect(c.dir).toBe(-1);
  });

  it("규격 보장: 모든 진영의 충돌 몸통은 1칸 통로보다 작다", () => {
    expect(CHAR_HITBOX_W).toBeLessThan(20);
    for (const cfg of Object.values(CHAR_SPRITES)) {
      expect(cfg.size - cfg.topPad).toBeLessThanOrEqual(20);
    }
  });

  it("1칸(20px) 세로 통로를 걸어서 통과한다 — 몸통(하단 14px)만 충돌", () => {
    // 바닥 위 20px 높이 통로: 천장 블록이 FLOOR_Y-40에 있음 (블록 아래변 = FLOOR_Y-20)
    const ceiling = { id: 3, x: 200, y: FLOOR_Y - 40, blockType: "platform_block" };
    const c = makeChar({ x: 120, state: "CRAWL", dir: 1, timer: 30 });
    const ctx = makeCtx([ceiling]);
    let passed = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      if (c.x > 240) { passed = true; break; }
    }
    expect(passed).toBe(true);
    expect(c.dir).toBe(1); // 반전 없이 통과
  });

  it("머리 높이(바닥 위 0~20px)를 막는 블록에는 여전히 막힌다", () => {
    const wall = { id: 3, x: 200, y: FLOOR_Y - 20, blockType: "platform_block" };
    const c = makeChar({ x: 150, state: "CRAWL", dir: 1, timer: 10 });
    run(c, makeCtx([wall]), 1);
    expect(c.dir).toBe(-1);
  });
});

describe("기믹 블록", () => {
  it("스프링 착지 시 다시 튀어오른다", () => {
    const spring = { id: 5, x: 100, y: 400, blockType: "spring_block" };
    const c = makeChar({ x: 100, y: 340, state: "FALL", vy: 0 });
    const ctx = makeCtx([spring]);
    let bounced = false;
    for (let t = 0; t < 2; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      if (c.state === "JUMP" && c.vy < 0) { bounced = true; break; }
    }
    expect(bounced).toBe(true);
  });

  it("블랙홀 착지 시 화이트홀 위로 워프", () => {
    const black = { id: 11, x: 100, y: 400, blockType: "black_hole_block", pairId: 12 };
    const white = { id: 12, x: 220, y: 300, blockType: "white_hole_block", pairId: 11 };
    const c = makeChar({ x: 100, y: 340, state: "FALL", vy: 0 });
    run(c, makeCtx([black, white]), 1);
    // 워프 후 화이트홀 x 부근에서 낙하 중이거나 바닥 도달
    expect(Math.abs(c.x + c.w / 2 - (white.x + 10))).toBeLessThan(12);
  });

  it("머리 위 1칸 스턴 블록은 몸통에 닿지 않아 발동하지 않는다", () => {
    const stun = { id: 13, x: 200, y: FLOOR_Y - 40, blockType: "stun_block" };
    const c = makeChar({ x: 150, state: "CRAWL", dir: 1, timer: 30 });
    const ctx = makeCtx([stun]);
    let passed = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      if (c.state === "STUN") break;
      if (c.x > 240) { passed = true; break; }
    }
    expect(passed).toBe(true);
    expect(c.state).not.toBe("STUN");
  });

  it("스턴 블록에 스치면 STUN 상태로 낙하", () => {
    const stun = { id: 13, x: 100, y: 500, blockType: "stun_block" };
    const c = makeChar({ x: 100, y: 460, state: "FALL", vy: 100 });
    const ctx = makeCtx([stun]);
    let stunned = false;
    for (let t = 0; t < 2; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      if (c.state === "STUN") { stunned = true; break; }
    }
    expect(stunned).toBe(true);
  });
});

describe("FIGHT 상태", () => {
  it("타이머가 만료돼도 제자리에서 유지된다 (전투 틱이 해제 담당)", () => {
    const c = makeChar({ state: "FIGHT", timer: -1 });
    const x0 = c.x;
    run(c, makeCtx(), 1);
    expect(c.state).toBe("FIGHT");
    expect(c.x).toBe(x0);
  });

  it("발밑 플랫폼이 사라지면 낙하로 전환된다", () => {
    const plat = { id: 7, x: 100, y: 400, blockType: "platform_block" };
    const ctx = makeCtx([plat]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, state: "FIGHT", _platformId: 7, timer: -1 });
    run(c, ctx, 0.1);
    expect(c.state).toBe("FIGHT");
    ctx.platforms.length = 0;
    run(c, ctx, 0.1);
    expect(["FALL", "CRAWL"]).toContain(c.state);
  });
});

describe("startJump", () => {
  it("위쪽으로 발사한다", () => {
    const c = makeChar();
    startJump(c, () => 0.5);
    expect(c.state).toBe("JUMP");
    expect(c.vy).toBeLessThan(0);
  });

  it("바닥에서 최하단 배치 가능 플랫폼 높이까지 상승한다", () => {
    const c = makeChar({ x: 120, state: "CRAWL" });
    startJump(c, () => 0);
    let highestFeet = c.y + c.h;
    const ctx = makeCtx();
    for (let t = 0; t < 1.4; t += 1 / 120) {
      tickCharacter(c, ctx, 1 / 120);
      highestFeet = Math.min(highestFeet, c.y + c.h);
    }
    expect(highestFeet).toBeLessThanOrEqual(540);
  });

  it("비전투 지상 이동에서는 IDLE이나 STAY로 멈추지 않는다", () => {
    const c = makeChar({ timer: 0 });
    const ctx = makeCtx();
    for (let t = 0; t < 8; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      expect(["IDLE", "STAY"]).not.toContain(c.state);
    }
  });
});
