import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SLOT_LAYER, SKILL_CATEGORIES, LAYER_SPRITE_PREFIX, PATTERN_COLORS, COLOR_LABEL, COLOR_KEYS,
  emptyEquip, getEquippedLayers, bakedPatternPath, equipColor,
} from "../skills/skillPatterns.js";
import { createCharacter, createInitialState, serialize, loadState } from "../state/gameState.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("skillPatterns", () => {
  it("4 슬롯이 각각 하나의 시각 레이어에 매핑된다", () => {
    expect(SLOT_LAYER).toEqual({
      passive: "speckle", active: "rili", movement: "backline", aura: "glow",
    });
  });

  it("빈 장착은 어떤 레이어 색도 만들지 않는다", () => {
    const char = { equipped: emptyEquip() };
    expect(getEquippedLayers(char)).toEqual({
      speckle: null, rili: null, backline: null, glow: null,
    });
  });

  it("장착 색이 해당 레이어로 스택된다", () => {
    const char = {
      equipped: { passive: "gray", active: "yellow", movement: "blue", aura: "red" },
    };
    expect(getEquippedLayers(char)).toEqual({
      speckle: "gray", rili: "yellow", backline: "blue", glow: "red",
    });
  });

  it("알 수 없는 색은 무시된다", () => {
    const char = { equipped: { ...emptyEquip(), passive: "chartreuse" } };
    expect(getEquippedLayers(char).speckle).toBeNull();
  });
});

describe("장착 슬롯 조작", () => {
  it("equipColor는 슬롯에 색을 넣고 변경 여부를 반환한다", () => {
    const char = { equipped: emptyEquip() };
    expect(equipColor(char, "passive", "red")).toBe(true);
    expect(char.equipped.passive).toBe("red");
    expect(equipColor(char, "passive", "red")).toBe(false); // 동일 → 변경 없음
  });

  it("알 수 없는 색이나 null은 슬롯을 비운다", () => {
    const char = { equipped: { ...emptyEquip(), active: "yellow" } };
    expect(equipColor(char, "active", "nope")).toBe(true);
    expect(char.equipped.active).toBeNull();
    char.equipped.active = "yellow";
    expect(equipColor(char, "active", null)).toBe(true);
    expect(char.equipped.active).toBeNull();
  });
});

describe("색상 팔레트·스프라이트 인프라", () => {
  const KEYS = [
    "red", "dark_red", "orange", "blue", "dark_blue", "yellow", "dark_yellow",
    "green", "dark_green", "teal", "purple", "dark_purple", "black", "gray",
  ];

  it("팔레트는 14색이며 모두 hex 값이고 라벨이 있다", () => {
    expect(Object.keys(PATTERN_COLORS).sort()).toEqual([...KEYS].sort());
    expect(COLOR_KEYS).toEqual(Object.keys(PATTERN_COLORS));
    for (const key of KEYS) {
      expect(PATTERN_COLORS[key]).toMatch(/^#[0-9a-f]{6}$/);
      expect(COLOR_LABEL[key]).toBeTruthy();
    }
  });

  it("bakedPatternPath가 올바른 경로를 만든다", () => {
    expect(bakedPatternPath("speckle", "red")).toBe("assets/shrimp_variants/SPECKLE-red.png");
    expect(bakedPatternPath("rili", "dark_green")).toBe("assets/shrimp_variants/RILI-dark_green.png");
    expect(bakedPatternPath("backline", "gray")).toBe("assets/shrimp_variants/BACKLINE-gray.png");
  });

  it("알 수 없는 레이어/색은 null", () => {
    expect(bakedPatternPath("glow", "red")).toBeNull();
    expect(bakedPatternPath("speckle", "chartreuse")).toBeNull();
  });

  it("3패턴 × 14색 = 42개 스프라이트가 실제로 존재한다", () => {
    for (const layer of Object.keys(LAYER_SPRITE_PREFIX)) {
      for (const colorKey of KEYS) {
        const rel = bakedPatternPath(layer, colorKey);
        expect(existsSync(new URL(rel, `file://${repoRoot}`))).toBe(true);
      }
    }
  });
});

describe("gameState equipped 슬롯", () => {
  it("뱀파이어는 데모 색 세트를, 인간은 빈 슬롯을 가진다", () => {
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire");
    const human = createCharacter(state, "human");
    expect(SKILL_CATEGORIES.every((c) => vamp.equipped[c] != null)).toBe(true);
    expect(getEquippedLayers(vamp).glow).toBe("red");
    expect(human.equipped).toEqual(emptyEquip());
  });

  it("장착 상태가 저장/복원을 통해 유지된다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire", {
      equipped: { passive: "orange", active: "purple", movement: "black", aura: "teal" },
    });
    storage.setItem("vampireraise.save.v1", serialize(state));
    const restored = loadState(storage);
    const rc = restored.chars.items.find((c) => c.id === vamp.id);
    expect(rc.equipped).toEqual({
      passive: "orange", active: "purple", movement: "black", aura: "teal",
    });
  });
});
