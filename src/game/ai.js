// src/game/ai.js
// 감지·핑 추적 AI.
// 비전투 유닛은 PING_REFRESH_S(1초)마다 자기 감지 원(DETECT_RANGE) 안에서 가장 가까운
// 적에게 핑을 찍고, 다음 갱신까지 그 대상을 향해 걷는다. 갱신 시점에 감지 원 안에
// 적이 없으면 핑을 지우고 랜덤 배회로 돌아간다 (감지 범위는 향후 성장 요소).
//
// 이동은 "물리적 최단거리" 시도일 뿐 경로 탐색이 아니다: 플랫폼 위에서 아래 적을
// 인식하면 그냥 수평으로 걸어가고, 멍청해서 가장자리를 넘어 떨어질 수도 있다
// (→ 함정 설계 요소). 대상이 바로 위/아래면 제자리에 멈춰 마주 본다(국소 최소거리).

import {
  DETECT_RANGE, PING_REFRESH_S,
  DASH_ROUTE_MULT, DASH_CLIMB_COST, DASH_BLOCK_DETOUR_PX,
  DASH_SPD, DASH_COOLDOWN_S, DASH_ARRIVE_DIST, DASH_MAX_S,
} from "../constants.js";
import { startJump, NON_PLATFORM_BLOCK_TYPES } from "../engine/physics.js";
import { isLogicLayerBlock, PLATFORM_W, PLATFORM_H } from "../platform/platformBlockRenderer.js";
import { findNearestEnemy, aliveChars } from "./combat.js";

/** 감지·추적이 동작하는 상태 (지상 행동 중일 때만 주변을 살핀다) */
const AWARE_STATES = new Set(["IDLE", "STAY", "CRAWL"]);

/** 돌진 종료: 그 자리에서 낙하 → 착지 후 교전/재탐색. 쿨다운 시작 */
function endDash(c) {
  c.state = "FALL";
  c.vx = 0; c.vy = 0;
  c._dashTargetId = null;
  c._dashCd = DASH_COOLDOWN_S;
}

/** 우회 거리 추정에서 지형(벽)으로 치는 블록: 플랫폼 레이어의 밟을 수 있는 블록 */
function isSolidForRoute(p) {
  if (isLogicLayerBlock(p.blockType)) return false;
  if (p.blockType === "white_hole_block") return false;
  if (NON_PLATFORM_BLOCK_TYPES.has(p.blockType)) return false;
  return true;
}

/**
 * 걸어갈 때의 우회 거리 추정 (단순 휴리스틱, 경로 탐색 아님):
 *   수평 거리 + 수직 거리×기어오르기 비용 + 직선 경로를 가로막는 블록당 우회 가산.
 * 돌진 발동 판정(예산 = 감지범위×2)에 쓴다.
 */
export function estimateRouteDist(c, t, platforms) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
  const dx = tx - cx, dy = ty - cy;
  const direct = Math.hypot(dx, dy);
  const hit = new Set();
  const steps = Math.max(1, Math.ceil(direct / 8));
  for (let i = 1; i < steps; i++) {
    const px = cx + (dx * i) / steps;
    const py = cy + (dy * i) / steps;
    for (const p of platforms) {
      if (!isSolidForRoute(p)) continue;
      if (px >= p.x && px < p.x + PLATFORM_W && py >= p.y && py < p.y + PLATFORM_H) {
        hit.add(p.id);
      }
    }
  }
  return Math.abs(dx) + Math.abs(dy) * DASH_CLIMB_COST + hit.size * DASH_BLOCK_DETOUR_PX;
}

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
    if (c._dashCd > 0) c._dashCd -= simDt;

    // ── 돌진 조향: 대상을 향해 직선 비행 (중력·지형 무시는 physics가 처리) ──
    if (c.state === "DASH") {
      const t = byId.get(c._dashTargetId);
      c._dashTimeLeft = (c._dashTimeLeft ?? 0) - simDt;
      if (!t || t.dead || c._dashTimeLeft <= 0) { endDash(c); continue; }
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d <= DASH_ARRIVE_DIST) { endDash(c); continue; }
      c.vx = ((tx - cx) / d) * DASH_SPD;
      c.vy = ((ty - cy) / d) * DASH_SPD;
      c.dir = tx >= cx ? 1 : -1;
      continue;
    }

    if (!AWARE_STATES.has(c.state)) {
      // 전투 진입/공중/스턴 동안 핑은 무효 (전투 후 재탐색)
      if (c.state === "FIGHT") c._ping = null;
      continue;
    }

    // ── 뱀파이어 패시브(혈귀 돌진) ──
    // 감지는 남들과 동일한 감지 원. 걸어가면 돌아가야 하는 우회 거리가
    // 감지범위×2 이내일 때만 중력 무시 직선 돌진. 너무 돌아가면 발동 X → 걷기.
    if (c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestEnemy(c, chars);
      if (found
        && found.dist <= (DETECT_RANGE.vampire ?? 0)
        && found.dist > DASH_ARRIVE_DIST + 8
        && estimateRouteDist(c, found.char, state.platforms.items)
           <= DETECT_RANGE.vampire * DASH_ROUTE_MULT) {
        c.state = "DASH";
        c._dashTargetId = found.char.id;
        c._dashTimeLeft = DASH_MAX_S;
        c._ping = null;
        c._platformId = null;
        continue;
      }
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
