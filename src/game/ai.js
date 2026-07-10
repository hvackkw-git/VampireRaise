// src/game/ai.js
// 감지·핑 추적 AI.
// 비전투 유닛은 PING_REFRESH_S(1초)마다 자기 감지 원(DETECT_RANGE) 안에서 가장 가까운
// 적에게 핑을 찍고, 다음 갱신까지 그 대상을 향해 걷는다. 갱신 시점에 감지 원 안에
// 적이 없으면 핑을 지우고 랜덤 배회로 돌아간다 (감지 범위는 향후 성장 요소).
//
// 이동은 "물리적 최단거리" 시도일 뿐 경로 탐색이 아니다: 플랫폼 위에서 아래 적을
// 인식하면 그냥 수평으로 걸어가고, 멍청해서 가장자리를 넘어 떨어질 수도 있다
// (→ 함정 설계 요소). 대상이 바로 위/아래면 제자리에 멈춰 마주 본다(국소 최소거리).

import { DETECT_RANGE, PING_REFRESH_S } from "../constants.js";
import { startJump } from "../engine/physics.js";
import { findNearestEnemy, aliveChars } from "./combat.js";

/** 감지·추적이 동작하는 상태 (지상 행동 중일 때만 주변을 살핀다) */
const AWARE_STATES = new Set(["IDLE", "STAY", "CRAWL"]);

/**
 * 매 프레임 감지 틱.
 * @param {object} state
 * @param {number} simDt 초
 * @param {() => number} rng
 */
export function tickAggro(state, simDt, rng = Math.random) {
  const chars = aliveChars(state);
  const byId = new Map(chars.map((c) => [c.id, c]));
  for (const c of chars) {
    if (!AWARE_STATES.has(c.state)) {
      // 전투 진입/공중/스턴 동안 핑은 무효 (전투 후 재탐색)
      if (c.state === "FIGHT") c._ping = null;
      continue;
    }

    // ── 1초마다 핑 갱신: 감지 원 안 최근접 적 ──
    c._pingCd = (c._pingCd ?? 0) - simDt;
    if (c._pingCd <= 0) {
      c._pingCd = PING_REFRESH_S;
      const found = findNearestEnemy(c, chars);
      if (found && found.dist <= (DETECT_RANGE[c.side] ?? 0)) {
        c._ping = { targetId: found.char.id };
        // 대상이 위에 있으면 가끔 점프로 올라가 본다
        const t = found.char;
        const dx = (t.x + t.w / 2) - (c.x + c.w / 2);
        if (t.y + t.h < c.y - 4 && Math.abs(dx) < 40 && rng() < 0.3) {
          c.dir = dx >= 0 ? 1 : -1;
          startJump(c, rng);
          continue;
        }
      } else {
        c._ping = null; // 감지 원을 벗어남 → 랜덤 배회 복귀
      }
    }

    // ── 핑 대상을 향해 걷기 ──
    if (!c._ping) continue;
    const t = byId.get(c._ping.targetId);
    if (!t || t.dead) { c._ping = null; continue; }
    const dx = (t.x + t.w / 2) - (c.x + c.w / 2);
    if (Math.abs(dx) < 4) {
      // 수평으로 겹침 (바로 위/아래) — 더 걸어도 가까워지지 않는 국소 최소거리
      c.state = "STAY";
      c.timer = Math.max(c.timer, 0.2);
      c.dir = dx >= 0 ? 1 : -1;
      c.vx = 0;
    } else {
      c.dir = dx > 0 ? 1 : -1;
      c.state = "CRAWL";
      c.timer = Math.max(c.timer, 0.2); // 계속 걷도록 유지 (핑이 살아있는 동안)
    }
  }
}

// 핑이 없을 때의 행동은 physics의 defaultIdleDecide(랜덤 배회)가 담당한다.
