// 전투·전염·경험치·웨이브 테스트
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickCombat, grantExp, infectToSlave } from "../game/combat.js";
import { startWave, tickWaves, vampireSideAlive, humansAlive } from "../game/waves.js";
import { humanCountForWave, humanStatsForWave, expToNext } from "../constants.js";

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
    expect(vamp.state).toBe("IDLE");
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

  it("인간이 뱀파이어에게 죽으면 노예로 전염된다", () => {
    const vamp = state.chars.items[0];
    vamp._atkCd = 0;
    vamp.atk = 999;
    const human = createCharacter(state, "human", {
      x: vamp.x + 10, y: vamp.y, maxHp: 10, atk: 1, level: 1,
    });
    const events = tickCombat(state, 0.1);
    expect(human.side).toBe("slave");
    expect(human.hp).toBe(human.maxHp);
    expect(events.some((e) => e.type === "infect")).toBe(true);
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
    expect(human.hp).toBe(30);
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
