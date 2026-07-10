// 꾸미기 모드 배치 규칙 테스트 — Shrimprium과 동일 규칙 검증
import { describe, it, expect, beforeEach } from "vitest";
import {
  snapToGrid, placeBlock, moveBlock, rotateBlock, removeBlock,
} from "../decorate/placementRules.js";
import { getPlatformYRange } from "../platform/platformBlockRenderer.js";
import { TANK_H } from "../constants.js";

let state;
beforeEach(() => {
  state = { platforms: { nextId: 1, items: [] } };
});

const { minY, maxY } = getPlatformYRange(TANK_H);

describe("snapToGrid", () => {
  it("20px 그리드에 스냅한다", () => {
    expect(snapToGrid(33, minY + 27)).toEqual({ x: 20, y: minY + 20 });
  });
  it("상/하 4칸 금지 영역은 null", () => {
    expect(snapToGrid(0, minY - 1)).toBeNull();
    expect(snapToGrid(0, maxY + 21)).toBeNull();
    expect(snapToGrid(0, minY)).not.toBeNull();
    expect(snapToGrid(0, maxY)).not.toBeNull();
  });
});

describe("placeBlock", () => {
  it("빈 칸에 배치 성공", () => {
    const res = placeBlock(state, 20, minY, "platform_block");
    expect(res.ok).toBe(true);
    expect(state.platforms.items).toHaveLength(1);
  });
  it("같은 레이어 점유 시 실패", () => {
    placeBlock(state, 20, minY, "platform_block");
    const res = placeBlock(state, 20, minY, "hongyeom_block");
    expect(res).toEqual({ ok: false, reason: "occupied" });
  });
  it("다른 레이어(논리)는 같은 칸에 겹침 허용", () => {
    placeBlock(state, 20, minY, "platform_block");
    const res = placeBlock(state, 20, minY, "redstone_block");
    expect(res.ok).toBe(true);
    expect(state.platforms.items).toHaveLength(2);
  });
  it("범위 밖 배치 실패", () => {
    expect(placeBlock(state, 0, minY - 20, "platform_block").ok).toBe(false);
    expect(placeBlock(state, 320, minY, "platform_block").ok).toBe(false);
  });
  it("블랙홀은 화이트홀과 쌍으로 생성되고 서로 pairId 참조", () => {
    const res = placeBlock(state, 40, minY, "black_hole_block");
    expect(res.ok).toBe(true);
    const [black, white] = state.platforms.items;
    expect(black.blockType).toBe("black_hole_block");
    expect(white.blockType).toBe("white_hole_block");
    expect(black.pairId).toBe(white.id);
    expect(white.pairId).toBe(black.id);
  });
  it("화이트홀은 직접 배치 불가", () => {
    expect(placeBlock(state, 40, minY, "white_hole_block").ok).toBe(false);
  });
  it("리콜 블록은 수조당 1개", () => {
    expect(placeBlock(state, 0, minY, "recall_block").ok).toBe(true);
    expect(placeBlock(state, 40, minY, "recall_block")).toEqual({ ok: false, reason: "recallExists" });
  });
});

describe("moveBlock", () => {
  it("그리드 이동 + 범위 클램프", () => {
    placeBlock(state, 20, minY, "platform_block");
    const id = state.platforms.items[0].id;
    moveBlock(state, id, -100, 0);
    expect(state.platforms.items[0].x).toBe(0);
    moveBlock(state, id, 0, -100);
    expect(state.platforms.items[0].y).toBe(minY);
  });
  it("같은 레이어 블록과 겹치면 위치 교환", () => {
    placeBlock(state, 0, minY, "platform_block");
    placeBlock(state, 20, minY, "hongyeom_block");
    const [a, b] = state.platforms.items;
    moveBlock(state, a.id, 20, 0);
    expect(a.x).toBe(20);
    expect(b.x).toBe(0);
  });
});

describe("rotate/remove", () => {
  it("90° 단위 회전", () => {
    placeBlock(state, 0, minY, "redstone_corner_block");
    const p = state.platforms.items[0];
    rotateBlock(state, p.id);
    expect(p.rotation).toBe(90);
    rotateBlock(state, p.id); rotateBlock(state, p.id); rotateBlock(state, p.id);
    expect(p.rotation).toBe(0);
  });
  it("블랙홀 회수 시 화이트홀도 함께 제거", () => {
    placeBlock(state, 40, minY, "black_hole_block");
    const black = state.platforms.items[0];
    removeBlock(state, black.id);
    expect(state.platforms.items).toHaveLength(0);
  });
});
