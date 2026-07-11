// 전투·전염·경험치·웨이브 테스트
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickCombat, grantExp, infectToSlave } from "../game/combat.js";
import {
  startWave, tickWaves, vampireSideAlive, humansAlive, grantAccountExp, reviveVampires,
} from "../game/waves.js";
import {
  humanCountForWave, humanStatsForWave, expToNext, SLAVE_BASE,
  accountExpForWave, accountExpToNext, FLOOR_Y,
} from "../constants.js";

let state;
beforeEach(() => {
  state = createInitialState();
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
    expect(before - human.hp).toBe(11); // 10 × 1.1 = 11
    expect(vamp._revengePending).toBe(false); // 1회 소모
  });

  it("기본 red 1포인트는 복수 효과 없음(×1.0)", () => {
    const { vamp, human } = setupDuel({ red: 1 });
    tickCombat(state, 0.016);
    vamp._atkCd = 0;
    const before = human.hp;
    tickCombat(state, 0.016);
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
    const events = tickCombat(state, 0.1);
    expect(human.hp).toBeLessThan(100);
    expect(events.some((e) => e.type === "hit")).toBe(true);
  });

  it("인간이 뱀파이어에게 막타를 맞으면 소유 노예로 전염된다", () => {
    const vamp = state.chars.items[0];
    vamp._atkCd = 0;
    vamp.atk = 999;
    const human = createCharacter(state, "human", {
      x: vamp.x + 10, y: vamp.y, maxHp: 10, atk: 1, level: 1,
    });
    const events = tickCombat(state, 0.1);
    expect(human.side).toBe("slave");
    expect(human.ownerVampireId).toBe(vamp.id);
    expect(human.maxHp).toBe(SLAVE_BASE.maxHp);
    expect(human.hp).toBe(SLAVE_BASE.maxHp);
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
    expect(human.side).toBe("slave");
    expect(human.ownerVampireId).toBe(early.id);
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

  it("인간 전멸 시 클리어: 보상 지급·웨이브 증가·죽은 뱀파이어 부활", () => {
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    // 인간 전멸 처리
    state.chars.items = state.chars.items.filter((c) => c.side !== "human");
    state.chars.items[0].dead = true; // 죽은 뱀파이어 1
    const bloodBefore = state.blood;
    const events = tickWaves(state, 0.1);
    expect(events.some((e) => e.type === "clear")).toBe(true);
    expect(state.blood).toBeGreaterThan(bloodBefore);
    expect(state.wave.current).toBe(2);
    expect(state.chars.items[0].dead).toBe(false); // 부활
  });

  it("뱀파이어 진영 전멸 시 패배: 웨이브 1 리셋·인간 제거·뱀파이어 부활", () => {
    state.wave.current = 7;
    startWave(state);
    for (let t = 0; t < 12; t += 0.1) tickWaves(state, 0.1);
    for (const c of state.chars.items) {
      if (c.side === "vampire") { c.dead = true; }
    }
    const events = tickWaves(state, 0.1);
    expect(events.some((e) => e.type === "defeat")).toBe(true);
    expect(state.wave.current).toBe(1);
    expect(humansAlive(state)).toBe(0);
    expect(vampireSideAlive(state)).toBeGreaterThan(0);
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
