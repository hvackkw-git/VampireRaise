import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, createCharacter } from "../state/gameState.js";
import { tickHumanProjectiles } from "../game/projectiles.js";
import { tickAggro } from "../game/ai.js";
import {
  CHAR_SIZE, DETECT_RANGE, FLOOR_Y, HUMAN_PROJECTILE_DAMAGE,
  DASH_RANGED_ROUTE_MULT, DASH_RANGED_SKILL_MULT,
} from "../constants.js";

let state;
beforeEach(() => {
  state = createInitialState();
  state.chars.items = [];
  state.platforms.items = [];
  state.projectiles = { nextId: 1, items: [] };
});

const put = (side, x, over = {}) => {
  const c = createCharacter(state, side, { x, y: FLOOR_Y - CHAR_SIZE, maxHp: 100, atk: 5, ...over });
  c.state = "CRAWL";
  c.timer = 99;
  c._pingCd = 999;
  c._dashCd = 999;
  c._projectileCd = 0;
  return c;
};

describe("인간 투사체", () => {
  it("인식 범위 안 적에게 투사체를 발사한다", () => {
    const human = put("human", 100);
    const vamp = put("vampire", 100 + DETECT_RANGE.human - 30);

    const events = tickHumanProjectiles(state, 0.016);

    expect(state.projectiles.items).toHaveLength(1);
    expect(state.projectiles.items[0]).toMatchObject({ attackerId: human.id, targetId: vamp.id, damage: HUMAN_PROJECTILE_DAMAGE });
    expect(events.some((e) => e.type === "projectileFire")).toBe(true);
    expect(human._projectileCd).toBeGreaterThan(0);
  });

  it("스킬 훅으로 동시 발사 수와 피해량을 바꿀 수 있다", () => {
    const human = put("human", 100, { projectileSkill: { count: 2, damage: 9, cooldown: 0.5 } });
    put("vampire", 150);

    tickHumanProjectiles(state, 0.016);

    expect(state.projectiles.items).toHaveLength(2);
    expect(state.projectiles.items.every((p) => p.damage === 9)).toBe(true);
    expect(human._projectileCd).toBe(0.5);
  });

  it("뱀파이어가 투사체에 맞으면 공격자에게 원거리 반격 핑을 찍고 감지×2.5×1.1 예산으로 돌진한다", () => {
    const human = put("human", 40);
    const vamp = put("vampire", 40 + DETECT_RANGE.vampire * 2.4);
    vamp._dashCd = 999; // 일반 감지 돌진은 꺼둔다.
    state.platforms.items.push({ id: 1, x: human.x, y: human.y + human.h, blockType: "platform_block" });
    state.projectiles.items.push({
      id: 1,
      side: "human",
      attackerId: human.id,
      targetId: vamp.id,
      x: vamp.x + vamp.w / 2,
      y: vamp.y + vamp.h / 2,
      vx: 0,
      vy: 0,
      damage: 4,
      homing: false,
      ttl: 1,
    });

    const events = tickHumanProjectiles(state, 0.016);
    expect(events.some((e) => e.type === "projectileHit" && e.target === vamp)).toBe(true);
    expect(vamp.hp).toBe(96);
    expect(vamp._ping).toMatchObject({ targetId: human.id, ranged: true });
    expect(vamp._rangedRetaliation.routeMult).toBe(DASH_RANGED_ROUTE_MULT * DASH_RANGED_SKILL_MULT);

    vamp._dashCd = 0;
    tickAggro(state, 0.016, () => 0.9);
    expect(vamp.state).toBe("DASH");
    expect(vamp._dashTargetId).toBe(human.id);
  });
});
