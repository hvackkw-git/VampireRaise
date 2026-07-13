// 캐릭터 물리 테스트: 착지·이탈 낙하·측면 반전·스프링·워프·스턴
import { describe, it, expect } from "vitest";
import { tickCharacter, startJump, startDrop, startDiveDrop, tickSeparation } from "../engine/physics.js";
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

  it("스턴 낙하 중 바닥이 아니라 바로 아래 플랫폼에 착지해 머문다", () => {
    const nearest = { id: 21, x: 100, y: 380, blockType: "platform_block" };
    const farther = { id: 22, x: 100, y: 480, blockType: "platform_block" };
    const c = makeChar({
      x: 100, y: 268, state: "STUN", vy: 400,
      _platformId: null, _stunUntil: 20000,
    });
    // 먼 발판을 먼저 넣어도 Y가 가까운 발판을 선택해야 한다.
    tickCharacter(c, makeCtx([farther, nearest]), 0.5);
    expect(c._platformId).toBe(nearest.id);
    expect(c.y).toBe(nearest.y - CHAR_SIZE);
    expect(c.state).toBe("STUN");
    expect(c.vy).toBe(0);
  });
});

describe("Holy Shrimp 이동 제한", () => {
  it("전방 블록에 막히면 방향을 바꾸고 첫 충돌 5초 뒤 밟고 있는 플랫폼에서 드롭한다", () => {
    const current = { id: 31, x: 140, y: 400, blockType: "platform_block" };
    const blocker = { id: 32, x: 160, y: 380, blockType: "platform_block" };
    const lower = { id: 33, x: 140, y: 480, blockType: "platform_block" };
    const c = makeChar({
      // 20px 격자에서 몸통이 오른쪽 블록에 이미 0.5px 겹친 실게임 배치.
      side: "human", x: 137.5, y: 400 - CHAR_SIZE,
      state: "CRAWL", dir: 1, timer: 99, _platformId: current.id,
    });
    const ctx = makeCtx([current, blocker, lower]);

    tickCharacter(c, ctx, 1 / 60);
    expect(c.state).toBe("CRAWL");
    expect(c.dir).toBe(-1);
    expect(c._platformId).toBe(current.id);
    expect(c._obstacleDropAt).toBe(15000);
    expect(c.state).not.toBe("JUMP");

    // 좁은 틈에서 다시 같은 블록에 부딪혀도 최초 예약 시각은 밀리지 않는다.
    c.x = 137.5;
    c.dir = 1;
    ctx.now = 12000;
    tickCharacter(c, ctx, 1 / 60);
    expect(c._obstacleDropAt).toBe(15000);
    expect(c.state).toBe("CRAWL");

    ctx.now = 14999;
    tickCharacter(c, ctx, 0);
    expect(c.state).toBe("CRAWL");
    expect(c._platformId).toBe(current.id);

    ctx.now = 15000;
    tickCharacter(c, ctx, 0);
    expect(c.state).toBe("FALL");
    expect(c._platformId).toBeNull();
    expect(c._diveDropMinLandY).toBeGreaterThan(0); // 다이브 드롭: 현재 줄 통과, 아래층부터 착지

    for (let t = 0; t < 2 && c._platformId == null; t += 1 / 60) {
      ctx.now += 1000 / 60;
      tickCharacter(c, ctx, 1 / 60);
      expect(c.state).not.toBe("JUMP");
    }
    expect(c._platformId).toBe(lower.id);
  });

  it("Holy Shrimp에 JUMP 상태가 직접 들어와도 즉시 아래로 낙하한다", () => {
    const current = { id: 35, x: 100, y: 400, blockType: "platform_block" };
    const c = makeChar({
      side: "human", x: 100, y: 400 - CHAR_SIZE,
      state: "JUMP", vy: -220, _platformId: current.id,
    });

    tickCharacter(c, makeCtx([current]), 1 / 60);

    expect(c.state).toBe("FALL");
    expect(c.vy).toBeGreaterThanOrEqual(0);
    expect(c._dropThroughId).toBe(current.id);
    expect(c._platformId).toBeNull();
  });

  it("충돌 후 다른 플랫폼으로 이동해도 최초 충돌 5초 뒤 현재 플랫폼에서 드롭한다", () => {
    const first = { id: 36, x: 140, y: 400, blockType: "platform_block" };
    const blocker = { id: 37, x: 160, y: 380, blockType: "platform_block" };
    const current = { id: 38, x: 140, y: 480, blockType: "platform_block" };
    const c = makeChar({
      side: "human", x: 137.5, y: first.y - CHAR_SIZE,
      state: "CRAWL", dir: 1, timer: 99, _platformId: first.id,
    });
    const ctx = makeCtx([first, blocker, current]);

    tickCharacter(c, ctx, 1 / 60);
    expect(c._obstacleDropAt).toBe(15000);

    c.x = 140;
    c.y = current.y - CHAR_SIZE;
    c._platformId = current.id;
    ctx.now = 15000;
    tickCharacter(c, ctx, 0);

    expect(c.state).toBe("FALL");
    expect(c._diveDropMinLandY).toBeGreaterThan(0); // 다이브 드롭으로 현재 발판을 뚫고 낙하
    expect(c._platformId).toBeNull();
    expect(c._obstacleDropAt).toBeNull();
  });

  it("다이브 드롭은 통짜(연속) 발판을 뚫고 아래층에 착지한다", () => {
    // 같은 줄에 붙은 두 블록(연속) + 그 아래층 블록
    const a = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const b = { id: 2, x: 120, y: 400, blockType: "platform_block" };
    const lower = { id: 3, x: 120, y: 470, blockType: "platform_block" };
    const c = makeChar({ side: "vampire", x: 120, y: 400 - CHAR_SIZE, state: "CRAWL", _platformId: 2 });
    const ctx = makeCtx([a, b, lower]);

    startDiveDrop(c);
    expect(c.state).toBe("FALL");
    for (let t = 0; t < 2 && c._platformId == null; t += 1 / 60) {
      ctx.now += 1000 / 60;
      tickCharacter(c, ctx, 1 / 60);
    }
    // 일반 드롭이면 옆 블록(1)에 다시 얹히지만, 다이브 드롭은 그 줄을 통과해 아래층(3)에 안착.
    expect(c._platformId).toBe(lower.id);
    expect(c._diveDropMinLandY).toBeNull(); // 착지 시 해제
  });

  it("인간은 직접 점프와 스프링 도약을 하지 않는다", () => {
    const c = makeChar({ side: "human" });
    expect(startJump(c, () => 0.5)).toBe(false);
    expect(c.state).not.toBe("JUMP");

    const spring = { id: 34, x: 100, y: 400, blockType: "spring_block" };
    const falling = makeChar({ side: "human", x: 100, y: 340, state: "FALL", vy: 0 });
    const ctx = makeCtx([spring]);
    for (let t = 0; t < 1; t += 1 / 60) {
      tickCharacter(falling, ctx, 1 / 60);
      expect(falling.state).not.toBe("JUMP");
    }
    expect(falling.y + falling.h).toBeGreaterThan(spring.y);
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

describe("플랫폼 위 도약", () => {
  it("좁은 발판 위 뱀파이어는 가장자리에서 위 발판으로 도약한다 (바닥처럼)", () => {
    // CRAWL 타이머를 길게 잡아 타이머 만료 도약 경로를 차단 → 가장자리 판단만으로
    // 점프해야 통과한다. 발판(y=400)에서 뛰므로 발이 바닥보다 훨씬 높은 채로 JUMP.
    const lower = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const upper = { id: 2, x: 108, y: 360, blockType: "platform_block" };
    const ctx = makeCtx([lower, upper]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, dir: 1, state: "CRAWL", _platformId: 1, timer: 99 });
    let jumpedFromPlatform = false;
    for (let t = 0; t < 1; t += 1 / 60) {
      tickCharacter(c, ctx, 1 / 60);
      if (c.state === "JUMP" && c.y + c.h < FLOOR_Y - 50) { jumpedFromPlatform = true; break; }
    }
    expect(jumpedFromPlatform).toBe(true);
  });

  it("가장자리에 닿기 전(발판 위)에는 도약이 발동하지 않는다", () => {
    // 발판 위(다음 프레임에도 발판을 밟는 위치): 아직 가장자리가 아니므로 걷기를 유지한다.
    const plat = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const ctx = makeCtx([plat]);
    const c = makeChar({ x: 101, y: 400 - CHAR_SIZE, dir: 1, state: "CRAWL", _platformId: 1, timer: 99 });
    tickCharacter(c, ctx, 1 / 60);
    expect(c.state).toBe("CRAWL");
  });
});

describe("드롭스루 (아래 발판으로 내려가기)", () => {
  it("밟던 발판을 통과해 바로 아래 발판에 안착한다", () => {
    const upper = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const lower = { id: 2, x: 100, y: 480, blockType: "platform_block" };
    const ctx = makeCtx([upper, lower]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, state: "CRAWL", _platformId: 1 });
    startDrop(c);
    expect(c.state).toBe("FALL");
    expect(c._platformId).toBeNull();
    for (let t = 0; t < 2 && c._platformId == null; t += 1 / 60) tickCharacter(c, ctx, 1 / 60);
    expect(c._platformId).toBe(2); // 위(1)를 통과해 아래(2)에 착지
    expect(c.y).toBe(480 - CHAR_SIZE);
    expect(c._dropThroughId).toBeNull(); // 착지 후 드롭스루 종료
  });

  it("아래 발판이 없으면 바닥까지 내려간다", () => {
    const upper = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const ctx = makeCtx([upper]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, state: "CRAWL", _platformId: 1 });
    startDrop(c);
    run(c, ctx, 3);
    expect(c._platformId).toBeNull();
    expect(c.y).toBe(FLOOR_Y - CHAR_SIZE);
    expect(c._dropThroughId).toBeNull();
  });

  it("드롭 직후 같은 발판에 다시 착지하지 않는다", () => {
    const upper = { id: 1, x: 100, y: 400, blockType: "platform_block" };
    const ctx = makeCtx([upper]);
    const c = makeChar({ x: 100, y: 400 - CHAR_SIZE, state: "CRAWL", _platformId: 1 });
    startDrop(c);
    run(c, ctx, 0.3);
    expect(c._platformId).not.toBe(1); // 떠난 발판으로 되돌아 착지 금지
    expect(c.y + CHAR_SIZE).toBeGreaterThan(400); // 발판 아래로 내려갔다
  });
});

describe("startJump", () => {
  it("위쪽으로 발사한다", () => {
    const c = makeChar();
    startJump(c, () => 0.5);
    expect(c.state).toBe("JUMP");
    expect(c.vy).toBeLessThan(0);
  });

  it("점프력을 낮춘 뒤: 최소 도약 높이가 이전(84px)의 약 절반이 된다", () => {
    const c = makeChar({ x: 120, state: "CRAWL" });
    startJump(c, () => 0); // 최소 도약력
    let highestFeet = c.y + c.h;
    const ctx = makeCtx();
    for (let t = 0; t < 1.4; t += 1 / 120) {
      tickCharacter(c, ctx, 1 / 120);
      highestFeet = Math.min(highestFeet, c.y + c.h);
    }
    const rise = (FLOOR_Y) - highestFeet; // 바닥에서 오른 높이
    // 이전엔 최하단 플랫폼(84px)까지 닿았으나, 점프력 절반으로 ~절반 높이만 상승한다.
    expect(rise).toBeGreaterThan(38);
    expect(rise).toBeLessThan(58);
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

describe("군중 분리(tickSeparation)", () => {
  it("완전히 포개진 같은 편 걷는 새우를 좌우로 밀어낸다", () => {
    const a = makeChar({ id: 1, x: 200 });
    const b = makeChar({ id: 2, x: 200 });
    tickSeparation([a, b], 1 / 60);
    expect(a.x).not.toBe(b.x);         // 더 이상 완전히 포개지지 않음
    expect(a.x).toBeLessThan(b.x);     // id 순으로 대칭이 깨져 a가 왼쪽
  });

  it("여러 프레임 뒤 중심 간격이 목표치(약 0.15×2w) 이상으로 벌어진다", () => {
    const a = makeChar({ id: 1, x: 200 });
    const b = makeChar({ id: 2, x: 205 });
    for (let i = 0; i < 60; i++) tickSeparation([a, b], 1 / 60);
    const gap = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
    expect(gap).toBeGreaterThanOrEqual((a.w + b.w) * 0.15 - 0.5);
  });

  it("서로 마주보는(dir 반대) 쌍은 밀지 않는다", () => {
    const a = makeChar({ id: 1, x: 200, dir: 1 });
    const b = makeChar({ id: 2, x: 200, dir: -1 });
    tickSeparation([a, b], 1 / 60);
    expect(a.x).toBe(200);
    expect(b.x).toBe(200);
  });

  it("서로 다른 편은 밀지 않는다", () => {
    const a = makeChar({ id: 1, side: "vampire", x: 200 });
    const b = makeChar({ id: 2, side: "human", x: 200 });
    tickSeparation([a, b], 1 / 60);
    expect(a.x).toBe(200);
    expect(b.x).toBe(200);
  });

  it("걷지 않는(예: DASH) 새우는 분리에서 제외된다", () => {
    const a = makeChar({ id: 1, x: 200, state: "DASH" });
    const b = makeChar({ id: 2, x: 200, state: "DASH" });
    tickSeparation([a, b], 1 / 60);
    expect(a.x).toBe(200);
    expect(b.x).toBe(200);
  });

  it("세로로 다른 줄(위아래로 떨어진)에 있으면 밀지 않는다", () => {
    const a = makeChar({ id: 1, x: 200, y: 100 });
    const b = makeChar({ id: 2, x: 200, y: 100 + CHAR_SIZE });
    tickSeparation([a, b], 1 / 60);
    expect(a.x).toBe(200);
    expect(b.x).toBe(200);
  });
});
