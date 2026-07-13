// 전투·전염·경험치·웨이브 테스트
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import {
  tickCombat, grantExp, infectToSlave, explodeZombiePoison,
  ZOMBIE_POISON_MAX_STACKS,
} from "../game/combat.js";
import { tickCharacter } from "../engine/physics.js";
import {
  startWave, tickWaves, vampireSideAlive, humansAlive, grantAccountExp, reviveVampires,
  vampireCount, canRebirth, rebirth, updateRebirthUnlock,
} from "../game/waves.js";
import {
  humanCountForWave, humanStatsForWave, expToNext, SLAVE_BASE,
  accountExpForWave, accountExpToNext, FLOOR_Y, VAMPIRE_SPAWN_ZONE,
  REBIRTH_MAX_VAMPIRES, rebirthWaveRequirement,
  INITIAL_VAMPIRE_COUNT, INITIAL_VAMPIRE_LEVEL, vampireStatsForLevel,
  vampireReviveCooldown, ATTACK_RAISE_S, ATTACK_SLAM_S,
} from "../constants.js";

const SLAM_TIME = ATTACK_RAISE_S + ATTACK_SLAM_S;
function tickUntilSlam(state) {
  return tickCombat(state, SLAM_TIME);
}

let state;
beforeEach(() => {
  state = createInitialState();
});

describe("초기 상태", () => {
  it("Vamp Shrimp 1마리, 레벨 10으로 시작한다", () => {
    expect(INITIAL_VAMPIRE_COUNT).toBe(1);
    const vampires = state.chars.items.filter((c) => c.side === "vampire");
    expect(vampires).toHaveLength(1);
    const vamp = vampires[0];
    expect(vamp.level).toBe(INITIAL_VAMPIRE_LEVEL);
    const stats = vampireStatsForLevel(INITIAL_VAMPIRE_LEVEL);
    expect(vamp.maxHp).toBe(stats.maxHp);
    expect(vamp.atk).toBe(stats.atk);
    expect(vamp.skillPoints).toBe(INITIAL_VAMPIRE_LEVEL - 1);
  });
});

describe("교전 (마주보고 싸우기)", () => {
  it("적과 만나면 둘 다 멈춰 서서 마주본다 (FIGHT)", () => {
    const vamp = state.chars.items[0];
    vamp.x = 100; vamp.dir = -1; vamp._atkCd = 5;
    const human = createCharacter(state, "human", { x: 120, y: vamp.y, maxHp: 100, atk: 1 });
    human.dir = 1; human._atkCd = 5;
    const events = tickCombat(state, 0.016);
    expect(events.some((e) => e.type === "engage")).toBe(true);
    expect(vamp.state).toBe("FIGHT");
    expect(human.state).toBe("FIGHT");
    expect(vamp.dir).toBe(1);   // 오른쪽의 인간을 마주본다
    expect(human.dir).toBe(-1); // 왼쪽의 뱀파이어를 마주본다
    expect(vamp.vx).toBe(0);
  });

  it("대상이 멀어지면 교전이 풀린다", () => {
    const vamp = state.chars.items[0];
    vamp.x = 100; vamp._atkCd = 5;
    const human = createCharacter(state, "human", { x: 120, y: vamp.y, maxHp: 100, atk: 1 });
    human._atkCd = 5;
    tickCombat(state, 0.016);
    expect(vamp.state).toBe("FIGHT");
    human.x = 300; // 강제로 멀어짐
    tickCombat(state, 0.016);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp._fightTargetId).toBeNull();
  });

  it("공중(점프)으로 스쳐 지나갈 때는 교전·데미지가 없다", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp]; // 랜덤 위치의 다른 초기 뱀파이어 배제
    vamp.x = 100; vamp.state = "JUMP"; vamp._atkCd = 0;
    const human = createCharacter(state, "human", { x: 110, y: vamp.y, maxHp: 100, atk: 5 });
    human._atkCd = 0;
    const events = tickCombat(state, 0.016);
    expect(events.some((e) => e.type === "engage")).toBe(false);
    expect(events.some((e) => e.type === "hit")).toBe(false);
    expect(human.hp).toBe(100);
  });

  it("스턴된 적은 상태를 유지한 채 뱀파이어의 일반 공격 대상이 된다", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    vamp.x = 100; vamp._atkCd = 0; vamp.atk = 7;
    const human = createCharacter(state, "human", { x: 118, y: vamp.y, maxHp: 100, atk: 99 });
    human.state = "STUN";
    human._stunUntil = 10000;
    human._atkCd = 0;

    tickCombat(state, 0.016);
    const events = tickUntilSlam(state);

    expect(vamp.state).toBe("FIGHT");
    expect(vamp._fightTargetId).toBe(human.id);
    expect(human.state).toBe("STUN");
    expect(human._fightTargetId).toBeNull();
    expect(human.hp).toBe(93);
    expect(vamp.hp).toBe(vamp.maxHp);
    expect(events.some((e) => e.type === "hit" && e.attacker === vamp && e.target === human)).toBe(true);
  });

  it("높이가 다르면(다른 플랫폼) 교전하지 않는다", () => {
    const vamp = state.chars.items[0];
    vamp.x = 100; vamp._atkCd = 0;
    const human = createCharacter(state, "human", { x: 100, y: vamp.y - 60, maxHp: 100, atk: 5 });
    human._atkCd = 0;
    const events = tickCombat(state, 0.016);
    expect(events.some((e) => e.type === "engage")).toBe(false);
  });
});

describe("빨강 · 복수 스킬 (피격 시 다음 공격력 증가)", () => {
  function setupDuel(dashColors) {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    vamp.dashColors = dashColors;
    vamp.x = 100; vamp.y = FLOOR_Y - vamp.h; vamp.state = "CRAWL";
    vamp.atk = 10; vamp.maxHp = 200; vamp.hp = 200; vamp._atkCd = 5; // 처음엔 뱀파이어가 공격 안 함
    const human = createCharacter(state, "human", { x: 118, y: vamp.y, maxHp: 200, atk: 4 });
    human._atkCd = 0; // 인간이 먼저 뱀파이어를 때린다
    return { vamp, human };
  }

  it("red 2포인트면 피격 후 다음 공격이 ×1.1", () => {
    const { vamp, human } = setupDuel({ red: 2 });
    tickCombat(state, 0.016); // 인간이 뱀파이어를 피격 → 복수 예약
    expect(vamp._revengePending).toBe(true);
    vamp._atkCd = 0; // 이제 뱀파이어가 반격
    const before = human.hp;
    tickCombat(state, 0.016);
    tickUntilSlam(state);
    expect(before - human.hp).toBe(11); // 10 × 1.1 = 11
    expect(vamp._revengePending).toBe(false); // 1회 소모
  });

  it("기본 red 1포인트는 복수 효과 없음(×1.0)", () => {
    const { vamp, human } = setupDuel({ red: 1 });
    tickCombat(state, 0.016);
    vamp._atkCd = 0;
    const before = human.hp;
    tickCombat(state, 0.016);
    tickUntilSlam(state);
    expect(before - human.hp).toBe(10); // 배율 없음
  });
});

describe("전투와 전염", () => {
  it("사거리 내 적을 공격해 데미지를 준다", () => {
    const vamp = state.chars.items[0];
    vamp._atkCd = 0;
    const human = createCharacter(state, "human", {
      x: vamp.x + 10, y: vamp.y, maxHp: 100, atk: 1, level: 1,
    });
    tickCombat(state, 0.1);
    const events = tickUntilSlam(state);
    expect(human.hp).toBeLessThan(100);
    expect(events.some((e) => e.type === "hit")).toBe(true);
  });

  it("뱀파이어 slam 윈드업 중 타깃이 정면 영역을 벗어나면 헛스윙한다", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    vamp.x = 100; vamp.y = FLOOR_Y - vamp.h; vamp.state = "CRAWL"; vamp._atkCd = 0; vamp.atk = 50;
    const human = createCharacter(state, "human", { x: vamp.x + 10, y: vamp.y, maxHp: 100, atk: 1 });
    human._atkCd = 5;
    tickCombat(state, ATTACK_RAISE_S);
    human.y = vamp.y + 30;
    const events = tickCombat(state, ATTACK_SLAM_S);
    expect(human.hp).toBe(100);
    expect(events.some((e) => e.type === "slam" && e.hit === false)).toBe(true);
    expect(events.some((e) => e.type === "hit" && e.attacker === vamp)).toBe(false);
    expect(vamp._fightClosing).toBe(false); // 높이 차이는 수평 접근으로 해결하지 않는다.
  });

  it("거리 부족으로 slam이 빗나가면 가까이 붙은 뒤 다음 slam을 적중시킨다", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    state.platforms.items = [];
    vamp.x = 100; vamp.y = FLOOR_Y - vamp.h; vamp.state = "CRAWL"; vamp._atkCd = 0;
    const human = createCharacter(state, "human", {
      x: 132, y: vamp.y, maxHp: 100, hp: 100, atk: 1,
    });
    human._atkCd = 999;

    tickCombat(state, 0.016);
    const missEvents = tickUntilSlam(state);
    expect(human.hp).toBe(100);
    expect(missEvents.some((e) => e.type === "slam" && e.hit === false)).toBe(true);
    expect(vamp._fightClosing).toBe(true);

    const ctx = { platforms: [], blockPowered: new Map(), now: 1000, rng: () => 0.5 };
    const events = [];
    for (let i = 0; i < 120 && human.hp === 100; i++) {
      tickCharacter(vamp, ctx, 1 / 60);
      tickCharacter(human, ctx, 1 / 60);
      events.push(...tickCombat(state, 1 / 60));
    }

    const centerGap = (human.x + human.w / 2) - (vamp.x + vamp.w / 2);
    expect(centerGap).toBeLessThanOrEqual(28.01);
    expect(human.hp).toBeLessThan(100);
    expect(events.some((e) => e.type === "slam" && e.hit === true)).toBe(true);
    expect(vamp._fightClosing).toBe(false);
  });

  it("인간이 뱀파이어에게 막타를 맞으면 소유 노예로 전염된다", () => {
    const vamp = state.chars.items[0];
    vamp._atkCd = 0;
    vamp.atk = 999;
    const human = createCharacter(state, "human", {
      x: vamp.x + 10, y: vamp.y, maxHp: 10, atk: 1, level: 1,
    });
    tickCombat(state, 0.1);
    const events = tickUntilSlam(state);
    expect(human.side).toBe("slave");
    expect(human.ownerVampireId).toBe(vamp.id);
    expect(human.maxHp).toBe(SLAVE_BASE.maxHp);
    expect(human.hp).toBe(SLAVE_BASE.maxHp);
    expect(human.zombiePattern).toBeNull();
    expect(human.zombieRevivesLeft).toBe(0);
    expect(events.some((e) => e.type === "infect" && e.owner === vamp)).toBe(true);
  });

  it("노예가 인간을 죽여도 전염시키지 않는다", () => {
    state.chars.items = [];
    const slave = createCharacter(state, "slave", { x: 100, y: 100, maxHp: 30, atk: 999 });
    slave._atkCd = 0;
    const human = createCharacter(state, "human", { x: 110, y: 100, maxHp: 5, atk: 1 });
    const events = tickCombat(state, 0.1);
    expect(human.side).toBe("human");
    expect(human.dead).toBe(true);
    expect(state.chars.items.includes(human)).toBe(false);
    expect(events.some((e) => e.type === "infect")).toBe(false);
  });

  it("여러 뱀파이어가 같은 틱에 인간을 죽이면 순번이 앞선 뱀파이어가 소유한다", () => {
    state.chars.items = [];
    const late = createCharacter(state, "vampire", { x: 100, y: 100, maxHp: 30, atk: 10, vampireOrder: 2 });
    const early = createCharacter(state, "vampire", { x: 120, y: 100, maxHp: 30, atk: 10, vampireOrder: 1 });
    const human = createCharacter(state, "human", { x: 110, y: 100, maxHp: 15, atk: 1 });
    late._atkCd = 0;
    early._atkCd = 0;
    tickCombat(state, 0.1);
    tickUntilSlam(state);
    expect(human.side).toBe("slave");
    expect(human.ownerVampireId).toBe(early.id);
  });

  it("노란 릴리 특성 뱀파이어가 막타를 치면 좀비가 RILI와 부활 1회를 얻는다", () => {
    state.chars.items = [];
    const vamp = createCharacter(state, "vampire", { x: 100, y: 100, atk: 999 });
    vamp.zombieTrait = "zombie-yellow-revive";
    vamp._atkCd = 0;
    const human = createCharacter(state, "human", { x: 110, y: 100, maxHp: 5, hp: 5, atk: 1 });
    tickCombat(state, 0.1);
    tickUntilSlam(state);
    expect(human.side).toBe("slave");
    expect(human.ownerVampireId).toBe(vamp.id);
    expect(human.zombiePattern).toBe("RILI_YELLOW");
    expect(human.zombieRevivesLeft).toBe(1);
  });

  it("RILI 좀비는 첫 사망에 부활하며 패턴이 사라지고 두 번째 사망은 최종이다", () => {
    state.chars.items = [];
    const owner = createCharacter(state, "vampire", { x: 10, y: 100 });
    const zombie = createCharacter(state, "slave", {
      x: 200, y: 100, maxHp: 5, hp: 0.5, ownerVampireId: owner.id,
      zombiePattern: "RILI_YELLOW", zombieRevivesLeft: 1,
    });
    state.wave.active = true;
    let events = tickCombat(state, 1);
    expect(state.chars.items).toContain(zombie);
    expect(zombie.hp).toBe(zombie.maxHp);
    expect(zombie.zombieRevivesLeft).toBe(0);
    expect(zombie.zombiePattern).toBeNull();
    expect(events.some((e) => e.type === "zombieRevive")).toBe(true);

    zombie.hp = 0.5;
    events = tickCombat(state, 1);
    expect(state.chars.items).not.toContain(zombie);
    expect(events.some((e) => e.type === "zombieRevive")).toBe(false);
  });

  it("붉은 릴리 특성 막타로 생성된 좀비는 독 폭발 상태를 얻는다", () => {
    state.chars.items = [];
    const vamp = createCharacter(state, "vampire", { x: 100, y: 100, atk: 999 });
    vamp.zombieTrait = "zombie-red-poison";
    vamp._atkCd = 0;
    const human = createCharacter(state, "human", { x: 110, y: 100, maxHp: 5, hp: 5, atk: 1 });
    tickCombat(state, 0.1);
    tickUntilSlam(state);
    expect(human.side).toBe("slave");
    expect(human.zombiePattern).toBe("RILI_RED_POISON");
    expect(human.zombieRevivesLeft).toBe(0);
  });

  it("독 폭발은 최대 5중첩이며 1초마다 중첩당 최대 체력 1% 피해를 준다", () => {
    state.chars.items = [];
    const zombie = createCharacter(state, "slave", {
      x: 100, y: 100, zombiePattern: "RILI_RED_POISON",
    });
    const human = createCharacter(state, "human", {
      x: 120, y: 100, maxHp: 100, hp: 100, atk: 0,
    });
    const events = [];
    for (let i = 0; i < 7; i++) explodeZombiePoison(zombie, state, events);
    expect(human.poisonStacks).toBe(ZOMBIE_POISON_MAX_STACKS);
    zombie.zombiePattern = null; // 다음 combat tick에서 추가 폭발 없음
    human.x = 260; // 일반 교전 피해 없이 독 피해만 검증
    tickCombat(state, 1);
    expect(human.hp).toBeCloseTo(95);
  });

  it("웨이브 도중에만 노예 체력이 초당 1 감소한다", () => {
    const slave = createCharacter(state, "slave", { maxHp: 5, hp: 5 });
    state.wave.active = false;
    tickCombat(state, 1);
    expect(slave.hp).toBe(5);
    state.wave.active = true;
    tickCombat(state, 1.5);
    expect(slave.hp).toBe(3.5);
  });

  it("뱀파이어 사망은 dead 마크로 보존(부활 대상), 노예는 제거", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    const slave = createCharacter(state, "slave", { x: vamp.x, y: vamp.y, maxHp: 5, atk: 1 });
    const human = createCharacter(state, "human", {
      x: vamp.x + 8, y: vamp.y, maxHp: 9999, atk: 9999, level: 1,
    });
    human._atkCd = 0;
    // 인간이 노예와 뱀파이어를 연속 처치
    tickCombat(state, 0.1);
    human._atkCd = 0;
    tickCombat(state, 0.1);
    expect(state.chars.items.includes(slave)).toBe(false); // 노예 제거
    expect(state.chars.items.includes(vamp)).toBe(true);   // 뱀파이어 보존
    expect(vamp.dead).toBe(true);
  });

  it("사망한 뱀파이어는 5초+레벨×1초 쿨타임 후 자동 부활한다", () => {
    const vamp = state.chars.items[0];
    state.chars.items = [vamp];
    vamp.level = 3;
    const human = createCharacter(state, "human", {
      x: vamp.x + 8, y: vamp.y, maxHp: 9999, atk: 9999, level: 1,
    });
    human._atkCd = 0;
    expect(vampireReviveCooldown(3)).toBe(8);
    tickCombat(state, 0.1); // 이 틱에 사망 + 부활 카운트다운 0.1초 소진
    expect(vamp.dead).toBe(true);
    expect(vamp._reviveCd).toBeCloseTo(7.9);

    tickCombat(state, 7.8); // 쿨타임이 다 차기 직전
    expect(vamp.dead).toBe(true);

    tickCombat(state, 0.2); // 쿨타임 만료 — 자동 부활
    expect(vamp.dead).toBe(false);
    expect(vamp.hp).toBe(vamp.maxHp);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp.y).toBe(FLOOR_Y - vamp.h);
    expect(vamp.x).toBeGreaterThanOrEqual(VAMPIRE_SPAWN_ZONE.x);
    expect(vamp.x + vamp.w).toBeLessThanOrEqual(VAMPIRE_SPAWN_ZONE.x + VAMPIRE_SPAWN_ZONE.w);
  });

  it("경험치 누적으로 레벨업하며 스탯 성장", () => {
    const vamp = state.chars.items[0];
    const { maxHp, atk, level } = vamp;
    grantExp(vamp, expToNext(level), []);
    expect(vamp.level).toBe(level + 1);
    expect(vamp.maxHp).toBe(maxHp + 10);
    expect(vamp.atk).toBe(atk + 2);
    expect(vamp.hp).toBe(vamp.maxHp);
  });

  it("infectToSlave는 상태를 초기화한다", () => {
    const human = createCharacter(state, "human", { maxHp: 30, atk: 3 });
    human.hp = 0;
    infectToSlave(human);
    expect(human.side).toBe("slave");
    expect(human.hp).toBe(SLAVE_BASE.maxHp);
    expect(human.dead).toBe(false);
  });
});

describe("웨이브", () => {
  it("웨이브 스케일: 인원·스탯이 증가한다", () => {
    expect(humanCountForWave(1)).toBeLessThanOrEqual(humanCountForWave(10));
    expect(humanStatsForWave(5).maxHp).toBeGreaterThan(humanStatsForWave(1).maxHp);
    expect(humanStatsForWave(5).atk).toBeGreaterThan(humanStatsForWave(1).atk);
  });

  it("시작하면 인간이 순차 스폰된다", () => {
    startWave(state);
    const events = [];
    for (let t = 0; t < 12; t += 0.1) events.push(...tickWaves(state, 0.1));
    const spawns = events.filter((e) => e.type === "spawn");
    expect(spawns.length).toBe(humanCountForWave(1));
    expect(humansAlive(state)).toBe(spawns.length);
  });

  it("바닥까지 내려오는 경로가 없으면 웨이브를 시작하지 않는다", () => {
    state.platforms.items = Array.from({ length: 16 }, (_, index) => ({
      id: index + 1, x: index * 20, y: 300, blockType: "platform_block",
    }));
    expect(startWave(state)).toBe(false);
    expect(state.wave.active).toBe(false);
    expect(state.wave.lastStartError).toBe("noPath");
  });

  it("전폭 장벽에 한 칸 틈이 있으면 웨이브를 시작한다", () => {
    state.platforms.items = Array.from({ length: 16 }, (_, index) => ({
      id: index + 1, x: index * 20, y: 300, blockType: "platform_block",
    })).filter((block) => block.x !== 160);
    expect(startWave(state)).toBe(true);
    expect(state.wave.pendingSpawns.every((spawn) => Number.isFinite(spawn.x))).toBe(true);
  });

  it("인간 전멸 시 클리어: 보상 지급·웨이브 증가·베이스와 뱀파이어 체력 회복", () => {
    createCharacter(state, "vampire"); // 뱀파이어 진영이 전멸하지 않도록 한 마리 더 배치
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    // 인간 전멸 처리
    state.chars.items = state.chars.items.filter((c) => c.side !== "human");
    state.core.hp = 1;
    state.chars.items[0].dead = true; // 죽은 뱀파이어 1
    state.chars.items[1].hp = 1; // 살아있는 뱀파이어도 회복 대상
    const bloodBefore = state.blood;
    const events = tickWaves(state, 0.1);
    expect(events.some((e) => e.type === "clear")).toBe(true);
    expect(state.blood).toBeGreaterThan(bloodBefore);
    expect(state.wave.current).toBe(2);
    expect(state.core.hp).toBe(state.core.max);
    expect(state.chars.items[0].dead).toBe(false); // 부활
    expect(state.chars.items[0].hp).toBe(state.chars.items[0].maxHp);
    expect(state.chars.items[1].hp).toBe(state.chars.items[1].maxHp);
  });

  it("뱀파이어 진영이 전멸해도 더 이상 웨이브가 끝나지 않는다 (베이스가 깨져야 리셋)", () => {
    state.wave.current = 7;
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    for (const c of state.chars.items) {
      if (c.side === "vampire") { c.dead = true; }
    }
    expect(vampireSideAlive(state)).toBe(0);
    const humansBefore = humansAlive(state);
    const events = tickWaves(state, 0.1);
    expect(events.some((e) => e.type === "defeat")).toBe(false);
    expect(state.wave.current).toBe(7); // 리셋되지 않는다
    expect(state.wave.active).toBe(true);
    expect(humansAlive(state)).toBe(humansBefore); // 인간도 제거되지 않는다
  });

  it("부활한 뱀파이어는 상단 낙하가 아니라 맨 아래 바닥에서 재시작한다", () => {
    for (const c of state.chars.items) {
      if (c.side === "vampire") { c.dead = true; c.y = 100; }
    }
    reviveVampires(state, () => 0.5);
    for (const c of state.chars.items) {
      if (c.side !== "vampire") continue;
      expect(c.dead).toBe(false);
      expect(c.state).toBe("CRAWL");
      expect(c.y).toBe(FLOOR_Y - c.h);
    }
  });

  it("클리어 시 계정 경험치를 획득한다", () => {
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    state.chars.items = state.chars.items.filter((c) => c.side !== "human");
    const expBefore = state.account.exp;
    tickWaves(state, 0.1); // clear (웨이브 1)
    expect(state.account.exp).toBe(expBefore + accountExpForWave(1));
  });

  it("계정 경험치가 차면 계정 레벨업한다", () => {
    const events = [];
    grantAccountExp(state, accountExpToNext(1) + 5, events);
    expect(state.account.level).toBe(2);
    expect(state.account.exp).toBe(5);
    expect(events.some((e) => e.type === "acctlevel" && e.level === 2)).toBe(true);
  });

  it("자동 웨이브: 클리어 후 딜레이 뒤 자동 시작", () => {
    state.wave.auto = true;
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    state.chars.items = state.chars.items.filter((c) => c.side !== "human");
    tickWaves(state, 0.1); // clear
    expect(state.wave.active).toBe(false);
    let started = false;
    for (let t = 0; t < 5; t += 0.1) {
      if (tickWaves(state, 0.1).some((e) => e.type === "autostart")) { started = true; break; }
    }
    expect(started).toBe(true);
    expect(state.wave.active).toBe(true);
  });
});

describe("재시작(Rebirth)", () => {
  it("새우 1마리 · 웨이브 10 미만이면 재시작 불가", () => {
    state.wave.current = 9;
    expect(canRebirth(state)).toBe(false);
    expect(rebirth(state)).toBe(false);
    expect(vampireCount(state)).toBe(1);
  });

  it("새우 1마리 · 웨이브 10 이상이면 레벨·스킬 유지한 채 웨이브 1로, 새우 1마리 추가", () => {
    const vamp = state.chars.items[0];
    vamp.level = 15;
    vamp.skillPoints = 4;
    vamp.learnedSkills = ["skill-01"];
    state.wave.current = 12;
    state.core.hp = state.core.max - 3;
    expect(canRebirth(state)).toBe(true);

    expect(rebirth(state)).toBe(true);
    expect(state.wave.current).toBe(1);
    expect(state.wave.active).toBe(false);
    expect(state.core.hp).toBe(state.core.max);
    expect(vampireCount(state)).toBe(2);

    const survivor = state.chars.items.find((c) => c.id === vamp.id);
    expect(survivor.level).toBe(15);
    expect(survivor.skillPoints).toBe(4);
    expect(survivor.learnedSkills).toEqual(["skill-01"]);

    const newcomer = state.chars.items.find((c) => c.side === "vampire" && c.id !== vamp.id);
    expect(newcomer.level).toBe(1);
  });

  it("웨이브를 훨씬 넘겨 존버해도 재시작 1회에는 새우가 1마리만 늘어난다", () => {
    state.wave.current = 25; // 다음 문턱(20)을 훌쩍 넘겼어도
    expect(rebirth(state)).toBe(true);
    expect(vampireCount(state)).toBe(2); // 여전히 +1
  });

  it("새우 마릿수마다 재시작 문턱은 마릿수×10", () => {
    expect(rebirthWaveRequirement(1)).toBe(10);
    expect(rebirthWaveRequirement(2)).toBe(20);
    expect(rebirthWaveRequirement(4)).toBe(40);
  });

  it("최대 마릿수(5) 도달 시 더 이상 재시작으로 늘어나지 않는다", () => {
    for (let i = 1; i < REBIRTH_MAX_VAMPIRES; i++) createCharacter(state, "vampire");
    expect(vampireCount(state)).toBe(REBIRTH_MAX_VAMPIRES);
    state.wave.current = 999;
    expect(canRebirth(state)).toBe(false);
    expect(rebirth(state)).toBe(false);
    expect(vampireCount(state)).toBe(REBIRTH_MAX_VAMPIRES);
  });

  it("웨이브 진행 중에는 재시작할 수 없다", () => {
    state.wave.current = 10;
    startWave(state);
    expect(canRebirth(state)).toBe(false);
    expect(rebirth(state)).toBe(false);
  });

  it("문턱 도달 후 게임오버로 이전 웨이브로 후퇴해도 재시작 활성이 유지된다", () => {
    // 문턱(웨이브 10) 도달 → 래치 켜짐
    state.wave.current = 10;
    updateRebirthUnlock(state);
    expect(state.wave.rebirthUnlocked).toBe(true);
    expect(canRebirth(state)).toBe(true);

    // 다음 웨이브에서 죽음(게임오버) → 이전 웨이브로 후퇴했다고 가정
    state.wave.current = 9;
    // 문턱 미달로 후퇴했지만 래치가 유지되어 여전히 재시작 가능
    expect(canRebirth(state)).toBe(true);
  });

  it("재시작을 실행하면 래치가 풀려 새 문턱에 다시 도달해야 활성화된다", () => {
    state.wave.current = 10;
    updateRebirthUnlock(state);
    expect(rebirth(state)).toBe(true); // 마릿수 1→2, 문턱 20
    expect(state.wave.rebirthUnlocked).toBe(false);
    expect(canRebirth(state)).toBe(false);

    state.wave.current = 20;
    updateRebirthUnlock(state);
    expect(canRebirth(state)).toBe(true);
  });
});
