import { describe, it, expect } from "vitest";
import {
  SLOT_LAYER, LAYER_MASK, SKILL_CATALOG, emptyEquip, getEquippedLayers,
} from "../skills/skillPatterns.js";
import { createCharacter, createInitialState, serialize, loadState } from "../state/gameState.js";

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

  it("카탈로그의 모든 스킬 카테고리는 유효한 슬롯이다", () => {
    for (const skill of Object.values(SKILL_CATALOG)) {
      expect(SLOT_LAYER).toHaveProperty(skill.category);
    }
  });

  it("스페클/릴리/백라인 마스크 스프라이트 경로가 존재한다", () => {
    expect(LAYER_MASK.speckle).toContain("SPECKLE.png");
    expect(LAYER_MASK.rili).toContain("RILI.png");
    expect(LAYER_MASK.backline).toContain("BACKLINE.png");
  });

  it("빈 장착은 어떤 레이어 색도 만들지 않는다", () => {
    const char = { equipped: emptyEquip() };
    expect(getEquippedLayers(char)).toEqual({
      speckle: null, rili: null, backline: null, glow: null,
    });
  });

  it("장착 스킬의 색이 해당 레이어로 스택된다 (하양 스페클 + 노랑 릴리 + 파랑 백라인 + glow)", () => {
    const char = {
      equipped: {
        passive: "ironScale",   // #ffffff
        active: "frenzy",       // #ffd23b
        movement: "dash",       // #3b7bff
        aura: "crimsonAura",    // #ff2020
      },
    };
    expect(getEquippedLayers(char)).toEqual({
      speckle: "#ffffff",
      rili: "#ffd23b",
      backline: "#3b7bff",
      glow: "#ff2020",
    });
  });

  it("알 수 없는 스킬 id는 무시된다", () => {
    const char = { equipped: { ...emptyEquip(), passive: "nope" } };
    expect(getEquippedLayers(char).speckle).toBeNull();
  });
});

describe("gameState equipped 슬롯", () => {
  it("뱀파이어는 기본 장착 세트를, 인간은 빈 슬롯을 가진다", () => {
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire");
    const human = createCharacter(state, "human");
    expect(vamp.equipped.passive).toBe("ironScale");
    expect(getEquippedLayers(vamp).glow).toBe("#ff2020");
    expect(human.equipped).toEqual(emptyEquip());
  });

  it("장착 상태가 저장/복원을 통해 유지된다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const vamp = createCharacter(state, "vampire", {
      equipped: { passive: "toxicSkin", active: "venomShot", movement: "blink", aura: "frostAura" },
    });
    storage.setItem("vampireraise.save.v1", serialize(state));
    const restored = loadState(storage);
    const rc = restored.chars.items.find((c) => c.id === vamp.id);
    expect(rc.equipped).toEqual({
      passive: "toxicSkin", active: "venomShot", movement: "blink", aura: "frostAura",
    });
  });
});
