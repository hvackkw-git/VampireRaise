// src/game/ai.js
// 감지·핑 추적 AI.
// 비전투 유닛은 PING_REFRESH_S(1초)마다 자기 감지 원(DETECT_RANGE) 안에서 가장 가까운
// 적에게 핑을 찍고, 다음 갱신까지 그 대상을 향해 걷는다. 갱신 시점에 감지 원 안에
// 적이 없으면 핑을 지우고 랜덤 배회로 돌아간다 (감지 범위는 향후 성장 요소).
//
// 기본 핑 추적은 경로 탐색 없이 수평으로 걷는다. 단, 뱀파이어 돌진은 중력을
// 무시하며, 플랫폼 블록을 장애물로 둔 20px 그리드 BFS 최단 경로가 감지범위×2
// 예산 이내인 적에게 그 최단 경로의 웨이포인트를 따라 날아간다.

import {
  DETECT_RANGE, PING_REFRESH_S,
  DASH_ROUTE_MULT, TANK_W, TANK_H, FLOOR_Y,
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
  c._dashRoute = null;
  c._dashRouteIndex = 0;
  c._dashGoal = null;
  c._dashCd = DASH_COOLDOWN_S;
}

/** 우회 거리 추정에서 지형(벽)으로 치는 블록: 플랫폼 레이어의 밟을 수 있는 블록 */
function isSolidForRoute(p) {
  if (isLogicLayerBlock(p.blockType)) return false;
  if (p.blockType === "white_hole_block") return false;
  if (NON_PLATFORM_BLOCK_TYPES.has(p.blockType)) return false;
  return true;
}

const ROUTE_CELL = PLATFORM_W;
const ROUTE_COLS = Math.floor(TANK_W / ROUTE_CELL);
const ROUTE_ROWS = Math.floor(TANK_H / ROUTE_CELL);
const ROUTE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const centerOf = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
const pointAsTarget = (pt, c) => ({ x: pt.x - c.w / 2, y: pt.y - c.h / 2, w: c.w, h: c.h });
const cellKey = (x, y) => `${x},${y}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function pointToCell(pt) {
  return {
    x: clamp(Math.floor(pt.x / ROUTE_CELL), 0, ROUTE_COLS - 1),
    y: clamp(Math.floor(pt.y / ROUTE_CELL), 0, ROUTE_ROWS - 1),
  };
}

function cellCenter(cell) {
  return {
    x: cell.x * ROUTE_CELL + ROUTE_CELL / 2,
    y: cell.y * ROUTE_CELL + ROUTE_CELL / 2,
  };
}

function platformStandPoint(p, charH) {
  return { x: p.x + PLATFORM_W / 2, y: p.y - charH / 2, platformId: p.id };
}

function nearestPlatformStandPointTo(target, platforms, charH) {
  const goal = centerOf(target);
  let best = null;
  for (const p of platforms) {
    if (!isSolidForRoute(p)) continue;
    const pt = platformStandPoint(p, charH);
    const dist = Math.hypot(pt.x - goal.x, pt.y - goal.y);
    if (!best || dist < best.dist || (dist === best.dist && p.id < best.platformId)) {
      best = { ...pt, dist };
    }
  }
  return best;
}

function standableCenterYs(platforms, charH) {
  const ys = new Set([FLOOR_Y - charH / 2]);
  for (const p of platforms) {
    if (!isSolidForRoute(p)) continue;
    ys.add(p.y - charH / 2);
  }
  return [...ys];
}

function snapDashYToStandable(y, standYs) {
  let best = y;
  let bestDist = Infinity;
  for (const sy of standYs) {
    const dist = Math.abs(sy - y);
    if (dist < bestDist) {
      best = sy;
      bestDist = dist;
    }
  }
  return best;
}

function routeObstacles(platforms, startCell, goalCell) {
  const blocked = new Set();
  for (const p of platforms) {
    if (!isSolidForRoute(p)) continue;
    const minX = clamp(Math.floor(p.x / ROUTE_CELL), 0, ROUTE_COLS - 1);
    const maxX = clamp(Math.floor((p.x + PLATFORM_W - 1) / ROUTE_CELL), 0, ROUTE_COLS - 1);
    const minY = clamp(Math.floor(p.y / ROUTE_CELL), 0, ROUTE_ROWS - 1);
    const maxY = clamp(Math.floor((p.y + PLATFORM_H - 1) / ROUTE_CELL), 0, ROUTE_ROWS - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) blocked.add(cellKey(x, y));
    }
  }
  // 캐릭터가 이미 겹친 출발/도착 셀은 탐색 가능해야 한다.
  blocked.delete(cellKey(startCell.x, startCell.y));
  blocked.delete(cellKey(goalCell.x, goalCell.y));
  return blocked;
}

/**
 * 플랫폼 블록을 장애물로 보고 20px 그리드 BFS로 실제 우회 최단 경로를 구한다.
 * 반환 dist는 출발 중심→첫 셀 중심 + 셀 이동 길이 + 마지막 셀 중심→대상 중심의 실제 경로 길이다.
 */
export function findDashRoute(c, t, platforms, goalOverride = null) {
  const start = centerOf(c), goal = goalOverride ?? centerOf(t);
  const startCell = pointToCell(start), goalCell = pointToCell(goal);
  const startKey = cellKey(startCell.x, startCell.y);
  const goalKey = cellKey(goalCell.x, goalCell.y);
  const blocked = routeObstacles(platforms, startCell, goalCell);
  const queue = [startCell];
  const prev = new Map([[startKey, null]]);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const curKey = cellKey(cur.x, cur.y);
    if (curKey === goalKey) break;
    for (const [dx, dy] of ROUTE_DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || nx >= ROUTE_COLS || ny < 0 || ny >= ROUTE_ROWS) continue;
      const nk = cellKey(nx, ny);
      if (blocked.has(nk) || prev.has(nk)) continue;
      prev.set(nk, curKey);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(goalKey)) return null;

  const cells = [];
  for (let k = goalKey; k; k = prev.get(k)) {
    const [x, y] = k.split(",").map(Number);
    cells.push({ x, y });
  }
  cells.reverse();
  const rawPoints = [start, ...cells.map(cellCenter), goal];
  let dist = 0;
  for (let i = 1; i < rawPoints.length; i++) {
    const last = rawPoints[i - 1];
    const pt = rawPoints[i];
    dist += Math.hypot(pt.x - last.x, pt.y - last.y);
  }

  const standYs = standableCenterYs(platforms, c.h);
  const snappedPoints = [start, ...cells.map((cell) => {
    const pt = cellCenter(cell);
    return { ...pt, y: snapDashYToStandable(pt.y, standYs) };
  }), goal];
  const path = [start];
  for (const pt of snappedPoints.slice(1)) {
    const last = path[path.length - 1];
    const step = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (step < 0.001) continue;
    path.push(pt);
  }
  return { dist, path };
}

export function estimateRouteDist(c, t, platforms) {
  return findDashRoute(c, t, platforms)?.dist ?? Infinity;
}

function findNearestDashRoute(c, chars, platforms) {
  const budget = (DETECT_RANGE.vampire ?? 0) * DASH_ROUTE_MULT;
  let best = null;
  for (const enemy of chars) {
    if (enemy === c || enemy.dead || enemy.side === c.side) continue;
    const goal = nearestPlatformStandPointTo(enemy, platforms, c.h);
    if (!goal) continue;
    const route = findDashRoute(c, pointAsTarget(goal, c), platforms, goal);
    if (!route || route.dist > budget || route.dist <= DASH_ARRIVE_DIST + 8) continue;
    if (!best || route.dist < best.route.dist) best = { char: enemy, route, goal };
  }
  return best;
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

    // ── 돌진 조향: BFS 경로 웨이포인트를 따라 비행 ──
    if (c.state === "DASH") {
      const t = byId.get(c._dashTargetId);
      c._dashTimeLeft = (c._dashTimeLeft ?? 0) - simDt;
      if (!t || t.dead || c._dashTimeLeft <= 0) { endDash(c); continue; }
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const goal = c._dashGoal ?? centerOf(t);
      const tx = goal.x, ty = goal.y;
      if (Math.hypot(tx - cx, ty - cy) <= DASH_ARRIVE_DIST) { endDash(c); continue; }
      const route = c._dashRoute;
      let i = c._dashRouteIndex ?? 1;
      while (route && i < route.length - 1 && Math.hypot(route[i].x - cx, route[i].y - cy) <= 8) i++;
      const wp = route?.[i] ?? { x: tx, y: ty };
      c._dashRouteIndex = i;
      const d = Math.hypot(wp.x - cx, wp.y - cy);
      if (d <= 0.001) { c.vx = 0; c.vy = 0; continue; }
      c.vx = ((wp.x - cx) / d) * DASH_SPD;
      c.vy = ((wp.y - cy) / d) * DASH_SPD;
      c.dir = wp.x >= cx ? 1 : -1;
      continue;
    }

    if (!AWARE_STATES.has(c.state)) {
      // 전투 진입/공중/스턴 동안 핑은 무효 (전투 후 재탐색)
      if (c.state === "FIGHT") c._ping = null;
      continue;
    }

    // ── 뱀파이어 패시브(혈귀 돌진) ──
    // 중력을 무시한다. 직선 감지 원 밖(특히 위쪽)의 적도 플랫폼을 피해 돌아가는
    // BFS 최단 경로가 감지범위×2 이내면 그 최단 경로로 날아간다.
    if (c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestDashRoute(c, chars, state.platforms.items);
      if (found) {
        c.state = "DASH";
        c._dashTargetId = found.char.id;
        c._dashRoute = found.route.path;
        c._dashGoal = found.goal;
        c._dashRouteIndex = 1;
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
        const pingPoint = c.side === "vampire"
          ? nearestPlatformStandPointTo(found.char, state.platforms.items, c.h)
          : null;
        c._ping = { targetId: found.char.id, ...(pingPoint ? { x: pingPoint.x, y: pingPoint.y, platformId: pingPoint.platformId } : {}) };
        // 대상이 위에 있으면 가끔 점프로 올라가 본다
        const t = found.char;
        const pingX = Number.isFinite(c._ping.x) ? c._ping.x : t.x + t.w / 2;
        const dx = pingX - (c.x + c.w / 2);
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
    const pingX = Number.isFinite(c._ping.x) ? c._ping.x : t.x + t.w / 2;
    const dx = pingX - (c.x + c.w / 2);
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
