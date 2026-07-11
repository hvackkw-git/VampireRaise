// 스폰 존 테스트: 인간은 오른쪽 위, 뱀파이어는 왼쪽 아래에서만 스폰된다.
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import {
  startWave, tickWaves, reviveVampires, tickBaseSiege, humansAlive,
} from "../game/waves.js";
import {
  HUMAN_SPAWN_ZONE, VAMPIRE_SPAWN_ZONE, FLOOR_Y, CHAR_SIZE,
  humanCountForWave, BASE_CORE_HP, BASE_SIEGE_COOLDOWN_S,
} from "../constants.js";

function inZoneX(x, size, zone) {
  return x >= zone.x - 0.5 && x + size <= zone.x + zone.w + 0.5;
}

let state;
beforeEach(() => {
  state = createInitialState();
});

describe("스폰 존", () => {
  it("초기 뱀파이어는 왼쪽 아래 존(바닥)에서 스폰된다", () => {
    for (const c of state.chars.items) {
      expect(c.side).toBe("vampire");
      expect(inZoneX(c.x, c.w, VAMPIRE_SPAWN_ZONE)).toBe(true);
      expect(c.y).toBe(FLOOR_Y - c.h);
    }
  });

  it("소환한 뱀파이어도 왼쪽 아래 존에서 스폰된다", () => {
    const v = createCharacter(state, "vampire");
    expect(inZoneX(v.x, v.w, VAMPIRE_SPAWN_ZONE)).toBe(true);
    expect(v.y).toBe(FLOOR_Y - v.h);
  });

  it("부활한 뱀파이어는 왼쪽 아래 존 바닥에서 재시작한다", () => {
    for (const c of state.chars.items) { c.dead = true; c.x = 999; c.y = 100; }
    reviveVampires(state, () => 0.5);
    for (const c of state.chars.items) {
      expect(c.dead).toBe(false);
      expect(c.state).toBe("CRAWL");
      expect(inZoneX(c.x, c.w, VAMPIRE_SPAWN_ZONE)).toBe(true);
      expect(c.y).toBe(FLOOR_Y - c.h);
    }
  });

  it("웨이브 인간은 오른쪽 위 존 x 범위 안에서 스폰된다", () => {
    expect(startWave(state)).toBe(true);
    const events = [];
    for (let t = 0; t < 12; t += 0.1) events.push(...tickWaves(state, 0.1));
    const spawns = events.filter((e) => e.type === "spawn");
    expect(spawns.length).toBe(humanCountForWave(1));
    for (const ev of spawns) {
      expect(inZoneX(ev.char.x, CHAR_SIZE, HUMAN_SPAWN_ZONE)).toBe(true);
    }
  });

  it("바닥까지 내려오는 경로가 전혀 없으면 웨이브가 시작되지 않는다", () => {
    // 전폭 장벽(틈 없음) → 어느 존에서도 바닥 경로가 없다
    state.platforms.items = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1, x: i * 20, y: 300, blockType: "platform_block",
    }));
    expect(startWave(state)).toBe(false);
    expect(state.wave.lastStartError).toBe("noPath");
  });
});

describe("베이스 코어 (뱀파이어 존 침입)", () => {
  it("초기 코어는 20", () => {
    expect(state.core.hp).toBe(BASE_CORE_HP);
    expect(state.core.max).toBe(BASE_CORE_HP);
  });

  it("인간이 뱀파이어 존에 도달하면 건물처럼 공격 주기마다 코어가 1씩 줄고, 그 인간은 제거되지 않는다", () => {
    state.chars.items = [];
    const h = createCharacter(state, "human", {
      x: VAMPIRE_SPAWN_ZONE.x, y: FLOOR_Y - CHAR_SIZE, state: "CRAWL",
    });
    h._siegeCd = 0; // 첫 공격이 이번 틱에 나가도록
    const before = state.core.hp;
    const events = tickBaseSiege(state, 0.1);
    expect(events.some((e) => e.type === "invade")).toBe(true);
    expect(state.core.hp).toBe(before - 1);
    expect(state.chars.items.includes(h)).toBe(true); // 제거되지 않는다

    // 공격 주기가 다 차기 전까지는 더 깎이지 않는다
    const midEvents = tickBaseSiege(state, BASE_SIEGE_COOLDOWN_S - 0.05);
    expect(midEvents.length).toBe(0);
    expect(state.core.hp).toBe(before - 1);

    // 다음 공격 주기가 돌아오면 다시 1 깎인다
    const nextEvents = tickBaseSiege(state, 0.1);
    expect(nextEvents.some((e) => e.type === "invade")).toBe(true);
    expect(state.core.hp).toBe(before - 2);
  });

  it("교전(FIGHT) 중인 인간은 코어를 공격하지 않는다", () => {
    state.chars.items = [];
    const h = createCharacter(state, "human", {
      x: VAMPIRE_SPAWN_ZONE.x, y: FLOOR_Y - CHAR_SIZE, state: "FIGHT",
    });
    h._siegeCd = 0;
    const before = state.core.hp;
    const events = tickBaseSiege(state, 0.1);
    expect(events.length).toBe(0);
    expect(state.core.hp).toBe(before);
  });

  it("존 밖(공중 낙하 중)의 인간은 코어를 줄이지 않는다", () => {
    state.chars.items = [];
    createCharacter(state, "human", { x: VAMPIRE_SPAWN_ZONE.x, y: -CHAR_SIZE, state: "FALL" });
    const before = state.core.hp;
    const events = tickBaseSiege(state, 0.1);
    expect(events.length).toBe(0);
    expect(state.core.hp).toBe(before);
  });

  it("코어가 0이 되면 게임오버: 웨이브 리셋·코어 회복·뱀파이어 부활", () => {
    state.core.hp = 1;
    state.wave.current = 5;
    state.wave.active = true;
    state.chars.items = [];
    const vamp = createCharacter(state, "vampire");
    vamp.dead = true;
    const h = createCharacter(state, "human", {
      x: VAMPIRE_SPAWN_ZONE.x, y: FLOOR_Y - CHAR_SIZE, state: "CRAWL",
    });
    h._siegeCd = 0; // 이번 틱에 즉시 공격하도록
    const events = tickWaves(state, 0.1, () => 0.5);
    expect(events.some((e) => e.type === "gameover")).toBe(true);
    expect(state.core.hp).toBe(state.core.max);
    expect(state.wave.current).toBe(1);
    expect(state.wave.active).toBe(false);
    expect(humansAlive(state)).toBe(0);
    expect(vamp.dead).toBe(false); // 부활
  });
});
