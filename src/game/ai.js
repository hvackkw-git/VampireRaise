// src/game/ai.js
// 감지·행동 AI.
// 각 캐릭터는 진영별 감지 원(DETECT_RANGE)을 가진다. 적이 자기 원 안에 들어오면
// 인식하고 그쪽으로 걸어가 교전 거리까지 접근한다 (교전 자체는 combat.js).
// 감지 밖에서는 랜덤 배회. 본격적인 경로 추적(플랫폼 점프 내비)은 PLAN.md 6.5 향후 구현.

import { DETECT_RANGE } from "../constants.js";
import { defaultIdleDecide, startJump } from "../engine/physics.js";
import { findNearestEnemy, aliveChars } from "./combat.js";

/** 감지 가능 상태 (지상 행동 중일 때만 주변을 살핀다) */
const AWARE_STATES = new Set(["IDLE", "STAY", "CRAWL"]);

/**
 * 매 프레임 감지 틱: 자기 감지 원 안의 가장 가까운 적을 향해 걷는다.
 * - 대상이 거의 바로 위/아래(수평 거리 4px 미만)면 제자리 대기 (좌우 떨림 방지).
 * - 진행 방향이 블록에 막히면 physics의 반복 튕김 → 점프 탈출이 자연스럽게 발동한다.
 */
export function tickAggro(state, rng = Math.random) {
  const chars = aliveChars(state);
  for (const c of chars) {
    if (!AWARE_STATES.has(c.state)) continue;
    const found = findNearestEnemy(c, chars);
    if (!found || found.dist > (DETECT_RANGE[c.side] ?? 0)) continue;
    const t = found.char;
    const dx = (t.x + t.w / 2) - (c.x + c.w / 2);
    if (Math.abs(dx) < 4) {
      // 수평으로 겹침 (위/아래 플랫폼) — 마주 선 채 대기
      c.state = "STAY";
      c.timer = Math.max(c.timer, 0.2);
      c.dir = dx >= 0 ? 1 : -1;
      c.vx = 0;
    } else {
      c.dir = dx > 0 ? 1 : -1;
      c.state = "CRAWL";
      c.timer = 0.25 + rng() * 0.2; // 짧게 걷고 재평가
    }
  }
}

/** IDLE 타이머 만료 시 다음 행동 결정 콜백 (감지 밖: 랜덤 배회) */
export function makeIdleDecider(state, rng = Math.random) {
  return (c) => {
    const found = findNearestEnemy(c, aliveChars(state));
    if (found && found.dist <= (DETECT_RANGE[c.side] ?? 0)) {
      const t = found.char;
      c.dir = t.x + t.w / 2 >= c.x + c.w / 2 ? 1 : -1;
      if (rng() < 0.15 && t.y + t.h < c.y) {
        // 목표가 위에 있으면 가끔 점프 시도
        startJump(c, rng);
      } else {
        c.state = "CRAWL";
        c.timer = 1.5 + rng() * 2;
      }
      return;
    }
    // 감지 밖: 랜덤 배회
    defaultIdleDecide(c, rng);
  };
}
