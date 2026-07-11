import { describe, it, expect } from "vitest";
import { grantExp } from "../game/combat.js";
import { expToNext } from "../constants.js";
import { createInitialState } from "../state/gameState.js";
import { SKILL_TREE, DASH_SKILL_DEFS, normalizeSkillProgress } from "../skills/skillTree.js";

describe("스킬트리 데이터", () => {
  it("세로 화면용 6행 30개 슬롯, 레벨 제한·선행 없음", () => {
    expect(SKILL_TREE).toHaveLength(30);
    expect(new Set(SKILL_TREE.map((s) => s.y))).toHaveLength(6);
    expect(SKILL_TREE.every((s) => s.requiredLevel === 1)).toBe(true); // 레벨 제한 없음
    expect(SKILL_TREE.every((s) => s.parents.length === 0)).toBe(true); // 선행 없음
  });

  it("Dash 스킬 8개(7색+인식범위)를 왼쪽 열부터 차례대로 배치한다", () => {
    const dashNodes = SKILL_TREE.filter((s) => s.dash);
    expect(dashNodes).toHaveLength(DASH_SKILL_DEFS.length);
    expect(DASH_SKILL_DEFS).toHaveLength(8);

    const leftX = Math.min(...SKILL_TREE.map((s) => s.x));
    // 왼쪽 열 6칸(빨·주·노·초·파·보)이 위→아래 순서
    const leftCol = SKILL_TREE.filter((s) => s.x === leftX).sort((a, b) => a.y - b.y);
    expect(leftCol.map((s) => s.dash?.key)).toEqual(["red", "orange", "yellow", "green", "blue", "purple"]);

    // 넘친 2개(하양·인식범위)는 다음 열 위쪽에 배치
    const overflow = dashNodes.filter((s) => s.x !== leftX).sort((a, b) => a.y - b.y);
    expect(overflow.map((s) => s.dash?.key)).toEqual(["white", "detect"]);

    // 인식범위 포함
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
