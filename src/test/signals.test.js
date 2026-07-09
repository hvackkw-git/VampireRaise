// 신호 시스템 이식 검증: 스위치→레드스톤→전구, 게이트, 뱀파이어 센서
import { describe, it, expect } from "vitest";
import {
  computeBlockSignals, computeCharsOnPlatformIds,
} from "../platform/platformBlockRenderer.js";
import { tickGates, tickSensors } from "../platform/logicBlocks.js";

describe("computeBlockSignals (이식 검증)", () => {
  it("캐릭터가 밟은 스위치 → 레드스톤 → 전구 점등", () => {
    const platforms = [
      { id: 1, x: 100, y: 400, blockType: "switch_block" },
      { id: 2, x: 120, y: 400, blockType: "redstone_block" },
      { id: 3, x: 140, y: 400, blockType: "lightbulb_block" },
    ];
    const off = computeBlockSignals(platforms, new Set());
    expect(off.powered.get(3)).toBe(false);
    const on = computeBlockSignals(platforms, new Set([1]));
    expect(on.powered.get(1)).toBe(true);
    expect(on.powered.get(2)).toBe(true);
    expect(on.powered.get(3)).toBe(true);
  });

  it("NC 스위치는 반대로 동작", () => {
    const platforms = [{ id: 1, x: 0, y: 400, blockType: "switch_nc_block" }];
    expect(computeBlockSignals(platforms, new Set()).powered.get(1)).toBe(true);
    expect(computeBlockSignals(platforms, new Set([1])).powered.get(1)).toBe(false);
  });

  it("computeCharsOnPlatformIds: 캐릭터가 선 블록 id 집합", () => {
    const platforms = [{ id: 1, x: 100, y: 400, blockType: "switch_block" }];
    const chars = [{ _platformId: 1 }, { _platformId: null }];
    expect([...computeCharsOnPlatformIds(platforms, chars)]).toEqual([1]);
  });
});

describe("게이트/센서", () => {
  it("AND 게이트: 두 입력 모두 ON일 때만 출력", () => {
    const gate = { id: 1, x: 0, y: 400, blockType: "and_gate_block" };
    tickGates([gate], new Map([[1, [true, false]]]));
    expect(gate.gateState.outputOn).toBe(false);
    tickGates([gate], new Map([[1, [true, true]]]));
    expect(gate.gateState.outputOn).toBe(true);
  });

  it("뱀파이어 수 센서: 임계값 비교로 출력", () => {
    const sensor = { id: 1, x: 0, y: 400, blockType: "count_sensor_block" };
    tickSensors([sensor], { vampireCount: 3 }); // 기본 ≥5
    expect(sensor.sensorState.outputOn).toBe(false);
    tickSensors([sensor], { vampireCount: 6 });
    expect(sensor.sensorState.outputOn).toBe(true);
  });
});
