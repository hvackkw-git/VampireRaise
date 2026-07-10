import { describe, it, expect } from "vitest";
import { createInitialState, loadState, saveState } from "../state/gameState.js";
import { grantExp } from "../game/combat.js";
import { expToNext } from "../constants.js";
import { SKILL_TREE, learnSkill, skillStatus } from "../skills/skillTree.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("스킬트리 데이터", () => {
  it("세로 화면용 6행 30개 슬롯과 독립 가지를 가진다", () => {
    expect(SKILL_TREE).toHaveLength(30);
    expect(new Set(SKILL_TREE.map((s) => s.y))).toHaveLength(6);
    expect(SKILL_TREE.filter((s) => s.parents.length === 0).length).toBeGreaterThan(5);
  });
});

describe("스킬 습득", () => {
  it("레벨, 선행 스킬, 포인트를 모두 검사한다", () => {
    const char = createInitialState().chars.items[0];
    expect(skillStatus(char, "skill-01").state).toBe("level");
    char.level = 4;
    char.skillPoints = 2;
    expect(skillStatus(char, "skill-06").state).toBe("prerequisite");
    expect(learnSkill(char, "skill-01").state).toBe("learned");
    expect(skillStatus(char, "skill-06").state).toBe("available");
  });

  it("습득 시 1포인트를 쓰고 중복 습득하지 않는다", () => {
    const char = createInitialState().chars.items[0];
    char.level = 2;
    char.skillPoints = 1;
    expect(learnSkill(char, "skill-01").learnedNow).toBe(true);
    expect(char.skillPoints).toBe(0);
    expect(char.learnedSkills).toEqual(["skill-01"]);
    expect(learnSkill(char, "skill-01").learnedNow).toBeUndefined();
    expect(char.learnedSkills).toEqual(["skill-01"]);
  });

  it("뱀파이어가 레벨업할 때마다 1포인트를 얻는다", () => {
    const char = createInitialState().chars.items[0];
    grantExp(char, expToNext(char.level), []);
    expect(char.level).toBe(2);
    expect(char.skillPoints).toBe(1);
  });

  it("스킬 진행 상태를 저장하고 복원한다", () => {
    const storage = memoryStorage();
    const state = createInitialState();
    const char = state.chars.items[0];
    char.level = 2;
    char.skillPoints = 1;
    learnSkill(char, "skill-01");
    saveState(state, storage);
    const restored = loadState(storage);
    expect(restored.chars.items[0].skillPoints).toBe(0);
    expect(restored.chars.items[0].learnedSkills).toEqual(["skill-01"]);
  });
});
