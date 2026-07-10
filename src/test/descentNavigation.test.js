import { describe, it, expect } from "vitest";
import {
  findHumanDescentStep, findHumanSpawnRoutes, hasHumanDescentPath,
} from "../game/descentNavigation.js";
import { CHAR_SIZE, FLOOR_Y } from "../constants.js";
import { createCharacter, createInitialState } from "../state/gameState.js";
import { tickAggro } from "../game/ai.js";
import { tickCharacter } from "../engine/physics.js";

const row = (y, omittedX = null, blockType = "platform_block") =>
  Array.from({ length: 16 }, (_, index) => ({
    id: y * 100 + index,
    x: index * 20,
    y,
    blockType,
  })).filter((block) => block.x !== omittedX);

describe("인간 하강 경로", () => {
  it("장애물이 없으면 위에서 바닥까지 경로가 있다", () => {
    expect(hasHumanDescentPath([])).toBe(true);
    expect(findHumanSpawnRoutes([]).length).toBeGreaterThan(0);
  });

  it("수조 전체 폭을 막은 플랫폼 행은 웨이브 경로를 차단한다", () => {
    expect(hasHumanDescentPath(row(300))).toBe(false);
  });

  it("한 칸 틈이 있으면 걷기와 낙하로 바닥까지 도달한다", () => {
    expect(hasHumanDescentPath(row(300, 160))).toBe(true);
  });

  it("위쪽에 틈이 있어도 아래쪽 전폭 장벽이 막으면 경로가 없다", () => {
    expect(hasHumanDescentPath([...row(220, 160), ...row(420)])).toBe(false);
  });

  it("전원 ON 게이트는 열린 길, OFF 게이트는 장벽으로 계산한다", () => {
    const gates = row(300, null, "gate_block");
    const on = new Map(gates.map((gate) => [gate.id, true]));
    const off = new Map(gates.map((gate) => [gate.id, false]));
    expect(hasHumanDescentPath(gates, on)).toBe(true);
    expect(hasHumanDescentPath(gates, off)).toBe(false);
  });

  it("플랫폼 위 인간은 바닥으로 이어지는 가까운 가장자리를 선택한다", () => {
    const platforms = [80, 100, 120].map((x, index) => ({
      id: index + 1, x, y: 300, blockType: "platform_block",
    }));
    const human = {
      x: 120, y: 300 - CHAR_SIZE, w: CHAR_SIZE, h: CHAR_SIZE,
      _platformId: 3,
    };
    const step = findHumanDescentStep(human, platforms);
    expect(step).not.toBeNull();
    expect(step.dir).toBe(1);
    expect(step.targetX).toBeGreaterThan(human.x + human.w / 2);
  });

  it("실제 AI·물리 틱에서도 인간은 플랫폼에서 내려와 바닥에 도착한다", () => {
    const state = createInitialState();
    state.chars.items = [];
    state.platforms.items = [80, 100, 120].map((x, index) => ({
      id: index + 1, x, y: 300, blockType: "platform_block",
    }));
    const human = createCharacter(state, "human", {
      x: 120, y: 300 - CHAR_SIZE, state: "CRAWL",
    });
    human._platformId = 3;
    human.timer = 99;
    const powered = new Map();
    let now = 10000;
    for (let t = 0; t < 4; t += 1 / 60) {
      tickAggro(state, 1 / 60, () => 0.5, powered);
      tickCharacter(human, {
        platforms: state.platforms.items, blockPowered: powered, now, rng: () => 0.5,
      }, 1 / 60);
      now += 1000 / 60;
      expect(["IDLE", "STAY"]).not.toContain(human.state);
    }
    expect(human._platformId).toBeNull();
    expect(human.y).toBe(FLOOR_Y - CHAR_SIZE);
    expect(human.state).toBe("CRAWL");
  });
});
