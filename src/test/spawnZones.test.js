// 스폰 존 테스트: 인간은 오른쪽 위, 뱀파이어는 왼쪽 아래에서만 스폰된다.
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { startWave, tickWaves, reviveVampires } from "../game/waves.js";
import {
  HUMAN_SPAWN_ZONE, VAMPIRE_SPAWN_ZONE, FLOOR_Y, CHAR_SIZE,
  humanCountForWave,
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
