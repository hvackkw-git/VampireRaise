import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SLOT_LAYER, LAYER_SPRITE_PREFIX, PATTERN_COLORS, SKILL_CATALOG, SKILL_CATEGORIES,
  emptyEquip, getEquippedLayers, bakedPatternPath, skillsInCategory, equipSkill,
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

  it("카탈로그의 모든 스킬은 유효한 슬롯·팔레트 색·진영을 가진다", () => {
    for (const skill of Object.values(SKILL_CATALOG)) {
      expect(SLOT_LAYER).toHaveProperty(skill.category);
      expect(PATTERN_COLORS).toHaveProperty(skill.colorKey);
      expect(["vampire", "human"]).toContain(skill.side);
    }
  });

  it("뱀파이어 스킬표가 이미지대로 들어있다 (예시 몇 칸)", () => {
    expect(SKILL_CATALOG.v_passive_red.name).toBe("소환");
    expect(SKILL_CATALOG.v_passive_black.name).toBe("공격");
    expect(SKILL_CATALOG.v_movement_dark_purple.name).toBe("아군소환");
    expect(SKILL_CATALOG.v_aura_black.name).toBe("상대 살점뜯기");
    // 오라 빈 칸은 카탈로그에 없다
    expect(SKILL_CATALOG.v_aura_dark_red).toBeUndefined();
  });

  it("빈 장착은 어떤 레이어 색도 만들지 않는다", () => {
    const char = { equipped: emptyEquip() };
    expect(getEquippedLayers(char)).toEqual({
      speckle: null, rili: null, backline: null, glow: null,
    });
  });

  it("장착 스킬의 색 키가 해당 레이어로 스택된다", () => {
    const char = {
      equipped: {
        passive: "v_passive_black",    // black
        active: "v_active_yellow",     // yellow
        movement: "v_movement_purple", // purple
        aura: "v_aura_red",            // red
      },
    };
    expect(getEquippedLayers(char)).toEqual({
      speckle: "black",
      rili: "yellow",
      backline: "purple",
      glow: "red",
    });
  });

  it("알 수 없는 스킬 id는 무시된다", () => {
    const char = { equipped: { ...emptyEquip(), passive: "nope" } };
    expect(getEquippedLayers(char).speckle).toBeNull();
  });
});

describe("장착 슬롯 조작 (진영별)", () => {
  it("skillsInCategory는 해당 진영·카테고리 스킬만 반환한다", () => {
    for (const category of SKILL_CATEGORIES) {
      const ids = skillsInCategory("vampire", category);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(SKILL_CATALOG[id].category).toBe(category);
        expect(SKILL_CATALOG[id].side).toBe("vampire");
      }
    }
  });

  it("인간은 아직 스킬이 없다", () => {
    for (const category of SKILL_CATEGORIES) {
      expect(skillsInCategory("human", category)).toEqual([]);
    }
  });

  it("equipSkill은 슬롯에 스킬을 끼우고 변경 여부를 반환한다", () => {
    const char = { side: "vampire", equipped: emptyEquip() };
    expect(equipSkill(char, "passive", "v_passive_red")).toBe(true);
    expect(char.equipped.passive).toBe("v_passive_red");
    expect(equipSkill(char, "passive", "v_passive_red")).toBe(false); // 동일 → 변경 없음
  });

  it("카테고리·진영이 맞지 않는 스킬이나 null은 슬롯을 비운다", () => {
    const char = { side: "vampire", equipped: { ...emptyEquip(), active: "v_active_red" } };
    expect(equipSkill(char, "active", "v_movement_red")).toBe(true); // 카테고리 불일치 → 비움
    expect(char.equipped.active).toBeNull();
    char.equipped.active = "v_active_red";
    expect(equipSkill(char, "active", null)).toBe(true);
    expect(char.equipped.active).toBeNull();
  });

  it("다른 진영 스킬은 장착되지 않는다", () => {
    const human = { side: "human", equipped: emptyEquip() };
    expect(equipSkill(human, "passive", "v_passive_red")).toBe(false);
    expect(human.equipped.passive).toBeNull();
  });
});

describe("색상별 패턴 스프라이트 인프라", () => {
  const COLOR_KEYS = [
    "red", "dark_red", "orange", "blue", "dark_blue", "yellow", "dark_yellow",
    "green", "dark_green", "teal", "purple", "dark_purple", "black", "gray",
  ];

  it("팔레트는 14색이며 모두 hex 값이다", () => {
    expect(Object.keys(PATTERN_COLORS).sort()).toEqual([...COLOR_KEYS].sort());
    for (const hex of Object.values(PATTERN_COLORS)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
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
      for (const colorKey of COLOR_KEYS) {
        const rel = bakedPatternPath(layer, colorKey);
        expect(existsSync(new URL(rel, `file://${repoRoot}`))).toBe(true);
      }
    }
  });
});

describe("gameState equipped 슬롯", () => {
  it("뱀파이어는 데모 장착 세트를, 인간은 빈 슬롯을 가진다", () => {
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire");
    const human = createCharacter(state, "human");
    expect(vamp.equipped.passive).toBe("v_passive_red");
    expect(getEquippedLayers(vamp).glow).toBe("red");
    expect(human.equipped).toEqual(emptyEquip());
  });

  it("장착 상태가 저장/복원을 통해 유지된다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire", {
      equipped: { passive: "v_passive_orange", active: "v_active_purple", movement: "v_movement_black", aura: "v_aura_yellow" },
    });
    storage.setItem("vampireraise.save.v1", serialize(state));
    const restored = loadState(storage);
    const rc = restored.chars.items.find((c) => c.id === vamp.id);
    expect(rc.equipped).toEqual({
      passive: "v_passive_orange", active: "v_active_purple", movement: "v_movement_black", aura: "v_aura_yellow",
    });
  });
});
