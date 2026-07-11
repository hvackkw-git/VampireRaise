import { describe, it, expect } from "vitest";
import { grantExp } from "../game/combat.js";
import { expToNext } from "../constants.js";
import { createInitialState } from "../state/gameState.js";
import { SKILL_TREE, DASH_SKILL_DEFS, normalizeSkillProgress } from "../skills/skillTree.js";

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

  it("레벨업 시 스킬포인트(별개 트랙)는 그대로 1씩 증가한다", () => {
    const char = createInitialState().chars.items[0];
    grantExp(char, expToNext(char.level), []);
    expect(char.level).toBe(2);
    expect(char.skillPoints).toBe(1);
  });

  it("normalizeSkillProgress: 잘못된 learnedSkills 정리", () => {
    const char = { level: 3, skillPoints: -2, learnedSkills: ["skill-01", "nope", "skill-01"] };
    normalizeSkillProgress(char);
    expect(char.skillPoints).toBe(0);
    expect(char.learnedSkills).toEqual(["skill-01"]);
  });
});
