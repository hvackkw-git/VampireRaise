// src/game/ai.js
// IDLE 타이머 만료 시 다음 행동 결정.
// 뱀파이어/노예: 랜덤 배회 (v1 — 추적 이동 AI는 PLAN.md 6.5 향후 구현).
// 인간: 가장 가까운 뱀파이어 진영을 향해 걷는다.

import { defaultIdleDecide, startJump } from "../engine/physics.js";
import { findNearestEnemy, aliveChars } from "./combat.js";

/** 상태를 받아 physics 틱에 주입할 행동 결정 콜백을 만든다 */
export function makeIdleDecider(state, rng = Math.random) {
  return (c) => {
    if (c.side === "human") {
      const found = findNearestEnemy(c, aliveChars(state));
      if (found) {
        const target = found.char;
        c.dir = target.x + target.w / 2 >= c.x + c.w / 2 ? 1 : -1;
        if (rng() < 0.15 && target.y + target.h < c.y) {
          // 목표가 위에 있으면 가끔 점프 시도
          startJump(c, rng);
        } else {
          c.state = "CRAWL";
          c.timer = 1.5 + rng() * 2;
        }
        return;
      }
    }
    // 뱀파이어/노예(및 목표 없는 인간): 랜덤 배회
    defaultIdleDecide(c, rng);
  };
}
