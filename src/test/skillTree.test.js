import { describe, it, expect } from "vitest";
import { grantExp } from "../game/combat.js";
import { expToNext } from "../constants.js";
import { createCharacter, createInitialState, toSaveData } from "../state/gameState.js";
import { infectToSlave } from "../game/combat.js";
import {
  investZombieHp, investZombieTrait, zombieHpBonus, ZOMBIE_TRAIT_COST,
} from "../skills/zombieSkills.js";
import {
  SKILL_TREE, DASH_SKILL_DEFS, ZOMBIE_SKILL_DEFS, normalizeSkillProgress,
} from "../skills/skillTree.js";

describe("스킬트리 데이터", () => {
  it("세로 화면용 8행 40개 슬롯, 레벨 제한·선행 없음", () => {
    expect(SKILL_TREE).toHaveLength(40);
    expect(new Set(SKILL_TREE.map((s) => s.y))).toHaveLength(8);
    expect(SKILL_TREE.every((s) => s.requiredLevel === 1)).toBe(true); // 레벨 제한 없음
    expect(SKILL_TREE.every((s) => s.parents.length === 0)).toBe(true); // 선행 없음
  });

  it("Dash 스킬 9개(7색+대쉬 숙련+인식범위)를 배치한다: 왼쪽 열 8칸 + 우상단", () => {
    const dashNodes = SKILL_TREE.filter((s) => s.dash);
    expect(DASH_SKILL_DEFS).toHaveLength(8);
    expect(dashNodes).toHaveLength(DASH_SKILL_DEFS.length + 1); // 7색+대쉬 숙련 + 인식범위

    const leftX = Math.min(...SKILL_TREE.map((s) => s.x));
    const rightX = Math.max(...SKILL_TREE.map((s) => s.x));
    const topY = Math.min(...SKILL_TREE.map((s) => s.y));

    // 왼쪽 열 8칸(빨·주·노·초·파·보·하·대쉬숙련)이 위→아래 순서로 꽉 찬다
    const leftCol = SKILL_TREE.filter((s) => s.x === leftX).sort((a, b) => a.y - b.y);
    expect(leftCol.map((s) => s.dash?.key)).toEqual(
      ["red", "orange", "yellow", "green", "blue", "purple", "white", "cdmana"],
    );

    // 인식범위는 맨 오른쪽 열의 맨 위(우상단)
    const topRight = SKILL_TREE.find((s) => s.x === rightX && s.y === topY);
    expect(topRight.dash?.key).toBe("detect");
    expect(dashNodes.some((s) => s.dash.kind === "detect")).toBe(true);
  });

  it("좀비 스킬 8개를 두 번째 열에 위→아래로 배치한다", () => {
    const zombieNodes = SKILL_TREE.filter((s) => s.zombie);
    expect(ZOMBIE_SKILL_DEFS).toHaveLength(8);
    expect(zombieNodes).toHaveLength(ZOMBIE_SKILL_DEFS.length);

    const xs = [...new Set(SKILL_TREE.map((s) => s.x))].sort((a, b) => a - b);
    const secondX = xs[1];
    const secondCol = SKILL_TREE.filter((s) => s.x === secondX).sort((a, b) => a.y - b.y);
    expect(secondCol.map((s) => s.zombie?.key)).toEqual(ZOMBIE_SKILL_DEFS.map((def) => def.key));
    expect(secondCol.every((s) => !s.dash)).toBe(true);
  });

  it("레벨업 시 스킬포인트(별개 트랙)는 그대로 1씩 증가한다", () => {
    const char = createInitialState().chars.items[0];
    const { level, skillPoints } = char;
    grantExp(char, expToNext(char.level), []);
    expect(char.level).toBe(level + 1);
    expect(char.skillPoints).toBe(skillPoints + 1);
  });

  it("normalizeSkillProgress: 잘못된 learnedSkills 정리", () => {
    const char = { level: 3, skillPoints: -2, learnedSkills: ["skill-01", "nope", "skill-01"] };
    normalizeSkillProgress(char);
    expect(char.skillPoints).toBe(0);
    expect(char.learnedSkills).toEqual(["skill-01"]);
  });

  it("2열 1행 투자 시 SP 1을 쓰고 소유 좀비 체력만 1 올린다", () => {
    const state = createInitialState();
    const owner = state.chars.items[0];
    const otherOwner = createCharacter(state, "vampire");
    owner.skillPoints = 2;
    const ownZombie = createCharacter(state, "slave", {
      ownerVampireId: owner.id, maxHp: 5, hp: 3,
    });
    const otherZombie = createCharacter(state, "slave", {
      ownerVampireId: otherOwner.id, maxHp: 5, hp: 3,
    });

    expect(investZombieHp(owner, state.chars.items)).toBe(true);
    expect(owner.skillPoints).toBe(1);
    expect(owner.zombieHpPoints).toBe(1);
    expect(ownZombie.maxHp).toBe(6);
    expect(ownZombie.hp).toBe(4);
    expect(otherZombie.maxHp).toBe(5);
    expect(otherZombie.hp).toBe(3);
  });

  it("투자 포인트는 이후 감염되는 좀비와 저장 데이터에도 적용된다", () => {
    const state = createInitialState();
    const owner = state.chars.items[0];
    owner.skillPoints = 3;
    expect(investZombieHp(owner, state.chars.items)).toBe(true);
    expect(investZombieHp(owner, state.chars.items)).toBe(true);
    expect(zombieHpBonus(owner)).toBe(2);

    const human = createCharacter(state, "human", { maxHp: 20, hp: 20 });
    infectToSlave(human, owner);
    expect(human.maxHp).toBe(7);
    expect(human.hp).toBe(7);

    const savedOwner = toSaveData(state).chars.items.find((c) => c.id === owner.id);
    expect(savedOwner.zombieHpPoints).toBe(2);
  });

  it("SP가 없으면 좀비 체력에 투자하지 않는다", () => {
    const owner = createInitialState().chars.items[0];
    owner.skillPoints = 0;
    expect(investZombieHp(owner, [])).toBe(false);
    expect(owner.zombieHpPoints).toBe(0);
  });

  it("좀비 스킬 2~4는 5SP 선택형이며 하나를 배우면 나머지를 못 배운다", () => {
    const owner = createInitialState().chars.items[0];
    owner.skillPoints = 10;
    expect(investZombieTrait(owner, "zombie-yellow-revive")).toBe(true);
    expect(owner.skillPoints).toBe(10 - ZOMBIE_TRAIT_COST);
    expect(owner.zombieTrait).toBe("zombie-yellow-revive");
    expect(investZombieTrait(owner, "zombie-red-poison")).toBe(false);
    expect(owner.skillPoints).toBe(5);
  });

  it("좀비 선택형 스킬은 5SP 미만이면 배울 수 없다", () => {
    const owner = createInitialState().chars.items[0];
    owner.skillPoints = 4;
    expect(investZombieTrait(owner, "zombie-yellow-revive")).toBe(false);
    expect(owner.zombieTrait).toBeNull();
  });
});
