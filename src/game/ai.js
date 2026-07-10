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
  TANK_W, TANK_H, FLOOR_Y, DETECT_RANGE, PING_REFRESH_S,
  DASH_ROUTE_MULT, DASH_SPD, DASH_COOLDOWN_S, DASH_ARRIVE_DIST, DASH_MAX_S,
} from "../constants.js";
import { startJump, getCharBodyTop, NON_PLATFORM_BLOCK_TYPES } from "../engine/physics.js";
import { isLogicLayerBlock, PLATFORM_W } from "../platform/platformBlockRenderer.js";
import { findNearestEnemy, aliveChars } from "./combat.js";

/** 감지·추적이 동작하는 상태 (지상 행동 중일 때만 주변을 살핀다) */
const AWARE_STATES = new Set(["IDLE", "STAY", "CRAWL"]);

/** 돌진 종료: 그 자리에서 낙하 → 착지 후 교전/재탐색. 쿨다운 시작 */
function endDash(c) {
  c.state = "FALL";
  c.vx = 0; c.vy = 0;
  c._dashTargetId = null;
  c._dashPath = null;
  c._dashGoal = null;
  c._dashCd = DASH_COOLDOWN_S;
}

/** 경로 탐색에서 지형(벽)으로 치는 블록: 플랫폼 레이어의 밟을 수 있는 블록 */
function isSolidForRoute(p) {
  if (isLogicLayerBlock(p.blockType)) return false;
  if (p.blockType === "white_hole_block") return false;
  if (NON_PLATFORM_BLOCK_TYPES.has(p.blockType)) return false;
  return true;
}

// ── 돌진 경로 탐색 (20px 그리드 BFS) ──
const CELL = PLATFORM_W;              // 20
const COLS = TANK_W / CELL;           // 16
const ROWS = TANK_H / CELL;           // 32
const cellIdx = (col, row) => row * COLS + col;

function cellOfPoint(px, py) {
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(px / CELL))),
    row: Math.max(0, Math.min(ROWS - 1, Math.floor(py / CELL))),
  };
}

function buildSolidGrid(platforms) {
  const solid = new Uint8Array(COLS * ROWS);
  // 바닥 아래(몸통 중심이 물리적으로 내려갈 수 없는) 줄은 통행 불가 —
  // 그렇지 않으면 BFS가 "바닥 밑으로 지나가는" 가짜 경로를 만든다.
  for (let row = 0; row < ROWS; row++) {
    if (row * CELL + CELL / 2 > FLOOR_Y - 6) {
      for (let col = 0; col < COLS; col++) solid[cellIdx(col, row)] = 1;
    }
  }
  for (const p of platforms) {
    if (!isSolidForRoute(p)) continue;
    const col = Math.round(p.x / CELL);
    const row = Math.round(p.y / CELL);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) solid[cellIdx(col, row)] = 1;
  }
  return solid;
}

/** 몸통 중심점 — 비행 조향과 셀 판정 기준 (몸통이 셀 안에 들어가도록) */
export function bodyCenter(c) {
  return { x: c.x + c.w / 2, y: (getCharBodyTop(c) + c.y + c.h) / 2 };
}

/** 직선 구간이 막힌 칸을 지나는가 (8px 샘플링, 스무딩용) */
function segmentBlocked(solid, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < steps; i++) {
    const { col, row } = cellOfPoint(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    if (solid[cellIdx(col, row)]) return true;
  }
  return false;
}

/**
 * 플랫폼 블록을 "돌아가는" 최단 경로 탐색 (4방향 BFS).
 * 경로 길이(칸수×20px)가 budgetPx를 넘거나 도달 불가면 null.
 * @param {{x:number,y:number}} from 몸통 중심
 * @param {{x:number,y:number}} to 대상 몸통 중심
 * @returns {{waypoints:Array<{x:number,y:number}>, lengthPx:number} | null}
 */
export function findDashPath(from, to, platforms, budgetPx) {
  const solid = buildSolidGrid(platforms);
  const start = cellOfPoint(from.x, from.y);
  const goal = cellOfPoint(to.x, to.y);
  const startI = cellIdx(start.col, start.row);
  const goalI = cellIdx(goal.col, goal.row);
  if (startI === goalI) return { waypoints: [], lengthPx: 0 };
  const maxSteps = Math.floor(budgetPx / CELL);
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  dist[startI] = 0;
  const queue = [startI];
  let head = 0;
  let found = false;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goalI) { found = true; break; }
    if (dist[cur] >= maxSteps) continue;
    const col = cur % COLS;
    const row = (cur / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const ni = cellIdx(nc, nr);
      if (dist[ni] !== -1) continue;
      if (solid[ni] && ni !== goalI) continue; // 대상이 선 칸은 도착 허용
      dist[ni] = dist[cur] + 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = goalI; i !== startI; i = prev[i]) cells.push(i);
  cells.reverse();
  const lengthPx = cells.length * CELL;
  if (lengthPx > budgetPx) return null;
  const raw = cells.map((i) => ({ x: (i % COLS) * CELL + CELL / 2, y: ((i / COLS) | 0) * CELL + CELL / 2 }));
  // 스무딩(string pulling): 직선으로 건너뛸 수 있는 중간 웨이포인트 제거
  const waypoints = [];
  let anchor = from;
  for (let i = 0; i < raw.length; i++) {
    if (i < raw.length - 1 && !segmentBlocked(solid, anchor.x, anchor.y, raw[i + 1].x, raw[i + 1].y)) continue;
    waypoints.push(raw[i]);
    anchor = raw[i];
  }
  return { waypoints, lengthPx };
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

    // ── 돌진 조향: 경로(웨이포인트)를 따라 블록을 돌아서 비행 ──
    if (c.state === "DASH") {
      const t = byId.get(c._dashTargetId);
      c._dashTimeLeft = (c._dashTimeLeft ?? 0) - simDt;
      if (!t || t.dead || c._dashTimeLeft <= 0) { endDash(c); continue; }
      const bc = bodyCenter(c);
      const tc = bodyCenter(t);
      // 대상이 경로 목표 칸을 벗어나면 재탐색 (실패 시 돌진 포기)
      const goalCell = cellOfPoint(tc.x, tc.y);
      if (!c._dashGoal || goalCell.col !== c._dashGoal.col || goalCell.row !== c._dashGoal.row) {
        const path = findDashPath(bc, tc, state.platforms.items, DETECT_RANGE.vampire * DASH_ROUTE_MULT);
        if (!path) { endDash(c); continue; }
        c._dashPath = path.waypoints;
        c._dashGoal = goalCell;
      }
      // 다음 웨이포인트로, 다 소화했으면 대상 본체로 조향
      while (c._dashPath?.length && Math.hypot(c._dashPath[0].x - bc.x, c._dashPath[0].y - bc.y) <= 8) {
        c._dashPath.shift();
      }
      const target = c._dashPath?.length ? c._dashPath[0] : tc;
      const dx = target.x - bc.x, dy = target.y - bc.y;
      const d = Math.max(0.001, Math.hypot(dx, dy));
      if (!c._dashPath?.length && Math.hypot(tc.x - bc.x, tc.y - bc.y) <= DASH_ARRIVE_DIST) {
        endDash(c);
        continue;
      }
      c.vx = (dx / d) * DASH_SPD;
      c.vy = (dy / d) * DASH_SPD;
      c.dir = dx >= 0 ? 1 : -1;
      continue;
    }

    if (!AWARE_STATES.has(c.state)) {
      // 전투 진입/공중/스턴 동안 핑은 무효 (전투 후 재탐색)
      if (c.state === "FIGHT") c._ping = null;
      continue;
    }

    // ── 뱀파이어 패시브(혈귀 돌진) ──
    // 감지는 남들과 동일한 감지 원. 플랫폼 블록을 돌아가는 최단 경로를 계산해,
    // 그 경로 길이가 감지범위×2 이내일 때만 발동해 경로를 따라 날아간다.
    // 너무 돌아가야 하거나 봉쇄돼 있으면 발동 X → 핑 걷기.
    if (c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestEnemy(c, chars);
      if (found
        && found.dist <= (DETECT_RANGE.vampire ?? 0)
        && found.dist > DASH_ARRIVE_DIST + 8) {
        const bc = bodyCenter(c);
        const tc = bodyCenter(found.char);
        const path = findDashPath(bc, tc, state.platforms.items, DETECT_RANGE.vampire * DASH_ROUTE_MULT);
        if (path) {
          c.state = "DASH";
          c._dashTargetId = found.char.id;
          c._dashPath = path.waypoints;
          c._dashGoal = cellOfPoint(tc.x, tc.y);
          c._dashTimeLeft = DASH_MAX_S;
          c._ping = null;
          c._platformId = null;
          continue;
        }
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
