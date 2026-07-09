// 감지(인식 원) AI 테스트: 원 안에 들어오면 인식하고 접근, 노예는 감지 반경이 작다
import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickAggro } from "../game/ai.js";
import { DETECT_RANGE } from "../constants.js";

let state;
beforeEach(() => {
  state = createInitialState();
  state.chars.items = []; // 빈 전장에서 직접 배치
});

const put = (side, x, over = {}) => {
  const c = createCharacter(state, side, { x, y: 592, maxHp: 100, atk: 5, ...over });
  c.state = "IDLE";
  c.timer = 99; // 자율 행동 억제 — 감지 반응만 관찰
  return c;
};

describe("감지 원", () => {
  it("감지 원 안의 적을 인식하고 그쪽으로 걷는다", () => {
    const vamp = put("vampire", 100);
    put("human", 100 + DETECT_RANGE.vampire - 10); // 원 안
    tickAggro(state, () => 0.5);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp.dir).toBe(1);
  });

  it("감지 원 밖의 적은 인식하지 못한다", () => {
    const vamp = put("vampire", 0);
    put("human", DETECT_RANGE.vampire + 60); // 원 밖
    tickAggro(state, () => 0.5);
    expect(vamp.state).toBe("IDLE");
  });

  it("서로의 원에 들어오면 양쪽 다 인식한다", () => {
    const vamp = put("vampire", 100);
    const human = put("human", 160); // 60px — 둘 다 감지 반경 안
    tickAggro(state, () => 0.5);
    expect(vamp.state).toBe("CRAWL");
    expect(vamp.dir).toBe(1);
    expect(human.state).toBe("CRAWL");
    expect(human.dir).toBe(-1);
  });

  it("노예는 감지 반경이 작다: 같은 거리에서 뱀파이어는 보지만 노예는 못 본다", () => {
    expect(DETECT_RANGE.slave).toBeLessThan(DETECT_RANGE.vampire);
    const d = DETECT_RANGE.slave + 15; // 노예 반경 밖, 뱀파이어 반경 안
    const vamp = put("vampire", 100);
    const slave = put("slave", 100);
    put("human", 100 + d);
    tickAggro(state, () => 0.5);
    expect(vamp.state).toBe("CRAWL");
    expect(slave.state).toBe("IDLE");
  });

  it("교전 중(FIGHT)에는 감지가 행동을 덮어쓰지 않는다", () => {
    const vamp = put("vampire", 100);
    vamp.state = "FIGHT";
    put("human", 130);
    tickAggro(state, () => 0.5);
    expect(vamp.state).toBe("FIGHT");
  });
});
