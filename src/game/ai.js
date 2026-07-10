// src/game/ai.js
// 감지·핑 추적 AI.
// 비전투 유닛은 PING_REFRESH_S(1초)마다 자기 감지 원(DETECT_RANGE) 안에서 가장 가까운
// 적에게 핑을 찍고, 다음 갱신까지 그 대상을 향해 걷는다. 갱신 시점에 감지 원 안에
// 적이 없으면 핑을 지우고 랜덤 배회로 돌아간다 (감지 범위는 향후 성장 요소).
//
// 기본 핑 추적은 경로 탐색 없이 수평으로 걷는다. 단, 뱀파이어 돌진은 중력을
// 무시하며, 플랫폼 블록을 장애물로 둔 20px 그리드 BFS 최단 경로가 감지범위×2
// 예산 이내인 적에게 그 최단 경로의 웨이포인트를 따라 날아간다.
// 지형 기준은 물리와 동일: 전원 ON(투명) 게이트는 벽이 아니고, up-가시·스프링·
// 블랙홀 윗면은 착지 목표로 삼지 않는다. 돌진 중단 시에는 제자리에서 낙하한다.
//
// 점프·하강(드롭스루) 중에도 돌진할 수 있다. 공중 좌표는 그리드에서 벗어나 있으므로, 현재 돌진
// 규칙(그리드/착지 가능 지점 기준 BFS 경로)을 지키기 위해 먼저 공중 위치를 그리드에
// 맞춘 "돌진 시작 위치"로 좌표보정한 뒤, 그 보정 위치에서 목표까지 최단 경로를
// 계산한다. 실제 비행 경로는 [공중 현재 위치 → 좌표보정 시작 위치 → …BFS 경로… → 목표].

import {
  DETECT_RANGE, PING_REFRESH_S,
  DASH_ROUTE_MULT, DASH_RANGED_ROUTE_MULT, DASH_RANGED_SKILL_MULT, TANK_W, TANK_H, FLOOR_Y,
  DASH_SPD, DASH_COOLDOWN_S, DASH_ARRIVE_DIST, DASH_MAX_S, DASH_MP_COST,
  HUMAN_PROJECTILE_RANGE, VAMPIRE_SPAWN_ZONE,
  isEnemySide,
} from "../constants.js";

/** 인간이 행군하는 베이스(뱀파이어 스폰 존) 중심 x */
const BASE_GOAL_X = VAMPIRE_SPAWN_ZONE.x + VAMPIRE_SPAWN_ZONE.w / 2;
import { startJump, NON_PLATFORM_BLOCK_TYPES } from "../engine/physics.js";
import { isLogicLayerBlock, getSpikeDir, PLATFORM_W, PLATFORM_H } from "../platform/platformBlockRenderer.js";
import { findNearestEnemy, aliveChars } from "./combat.js";
import { createHumanDescentNavigator } from "./descentNavigation.js";

/** 감지·추적이 동작하는 상태 (지상 행동 중일 때만 주변을 살핀다) */
const AWARE_STATES = new Set(["CRAWL"]);

/**
 * 돌진 종료.
 * - 도착(arrived): 목표 플랫폼 윗면에 스냅 착지.
 * - 중단(대상 사망·타임아웃·목표 플랫폼 소실): 그 자리에서 멈추고 자연 낙하 —
 *   목표 지점으로 순간이동하지 않는다.
 */
function endDash(c, platforms = [], { arrived = false, blockPowered = null } = {}) {
  const goal = c._dashGoal;
  const goalPlatform = arrived && goal?.platformId != null
    ? platforms.find((p) => p.id === goal.platformId && isSolidForRoute(p, blockPowered))
    : null;
  if (goalPlatform) {
    c.x = goal.x - c.w / 2;
    c.y = goalPlatform.y - c.h;
    c._platformId = goalPlatform.id;
    c.state = "CRAWL";
    c.timer = 0.2;
  } else {
    // 중단(또는 착지면 소실): 현재 위치에서 정지 후 자연 낙하
    c.state = "FALL";
    c.timer = 0.2;
    c._platformId = null;
  }
  c.vx = 0; c.vy = 0;
  c._dashTargetId = null;
  c._dashRoute = null;
  c._dashRouteIndex = 0;
  c._dashGoal = null;
  c._dashCd = DASH_COOLDOWN_S;
}

/**
 * 돌진 개시 — 상태·경로·목표를 세팅한다. (_ping은 호출부에서 목적에 맞게 지정)
 * 지상(CRAWL)·원거리 반격·점프(공중) 모두 같은 방식으로 비행에 진입한다.
 */
function beginDash(c, found) {
  c.state = "DASH";
  c.mp = Math.max(0, (c.mp ?? 0) - DASH_MP_COST);
  c._dashTargetId = found.char.id;
  c._dashRoute = found.route.path;
  c._dashGoal = found.goal;
  c._dashRouteIndex = 1;
  c._dashTimeLeft = DASH_MAX_S;
  c._platformId = null;
  c._jumpApexY = null; // 점프 중 돌진 진입 시 잔여 점프 상태 정리
  c._dropThroughId = null; // 하강(드롭스루) 중 돌진 진입 시 잔여 드롭 상태 정리
}

/**
 * 우회 거리 추정에서 지형(벽)으로 치는 블록 — 물리 isTangible과 동일 기준.
 * 게이트는 논리 레이어지만 지형이기도 하다: OFF면 벽(밟을 수 있음), ON(투명)이면 통과.
 */
function isSolidForRoute(p, blockPowered = null) {
  if (p.blockType === "gate_block") return !blockPowered?.get(p.id);
  if (isLogicLayerBlock(p.blockType)) return false;
  if (p.blockType === "white_hole_block") return false;
  if (NON_PLATFORM_BLOCK_TYPES.has(p.blockType)) return false;
  return true;
}

/**
 * 돌진 착지·핑 목표로 삼을 수 있는 "안전하게 설 수 있는" 윗면인가.
 * up-가시(밟는 즉시 발동)·스프링(튕겨냄)·블랙홀(밟으면 워프) 윗면은 목표에서 제외 —
 * 돌진 착지는 tryLand 기믹 판정을 거치지 않으므로 애초에 목표로 잡지 않는다.
 */
function isStandableGoalTop(p) {
  if (p.blockType === "spring_block") return false;
  if (p.blockType === "black_hole_block") return false;
  if (p.blockType === "spike_block" && getSpikeDir(p.rotation ?? 0) === "up") return false;
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

/** 지면(바닥) 위에 서는 착지 지점 — platformId 없음 → endDash에서 자연 낙하로 안착 */
function floorStandPoint(target, charH) {
  return { x: target.x + target.w / 2, y: FLOOR_Y - charH / 2, platformId: null };
}

/** 대상이 지면 근처(플랫폼 없이 땅 위)에 서 있는가 — 지면을 착지 목표로 삼을지 판단 */
function isNearFloor(target) {
  return target.y + target.h >= FLOOR_Y - Math.max(target.h, PLATFORM_H);
}

/**
 * 돌진 주체가 지면보다 충분히 높은 곳(위 플랫폼 등)에 있는가.
 * 지면 착지는 "위에서 아래로 내려꽂는" 경우에만 허용 — 평지에서 옆 적에게
 * 수평 돌진하지 않도록 한다. (여유 PLATFORM_H: 최하단 플랫폼도 지면보다 훨씬 위)
 */
function isElevatedAboveFloor(from) {
  return from != null && from.y + from.h < FLOOR_Y - PLATFORM_H;
}

function isInPlatformUpperArea(target, p) {
  if (target._platformId === p.id) return true;
  const cx = target.x + target.w / 2;
  const feetY = target.y + target.h;
  const horizontalMargin = target.w / 2;
  const minX = p.x - horizontalMargin;
  const maxX = p.x + PLATFORM_W + horizontalMargin;
  return cx >= minX
    && cx <= maxX
    && feetY <= p.y + 1
    && feetY >= p.y - Math.max(target.h, PLATFORM_H);
}

function nearestPlatformStandPointTo(target, platforms, charH, blockPowered = null, from = null) {
  const goal = centerOf(target);
  let best = null;
  for (const p of platforms) {
    if (!isSolidForRoute(p, blockPowered) || !isStandableGoalTop(p)) continue;
    if (!isInPlatformUpperArea(target, p)) continue;
    const pt = platformStandPoint(p, charH);
    const dist = Math.hypot(pt.x - goal.x, pt.y - goal.y);
    if (!best || dist < best.dist || (dist === best.dist && p.id < best.platformId)) {
      best = { ...pt, dist };
    }
  }
  // 위 플랫폼에 있는 돌진 주체는 지면 근처의 적에게 바닥으로도 내려꽂을 수 있다.
  // (평지에서 옆 적에게 수평 돌진하는 것은 막기 위해 주체가 지면보다 높을 때만)
  if (isNearFloor(target) && isElevatedAboveFloor(from)) {
    const fp = floorStandPoint(target, charH);
    const dist = Math.hypot(fp.x - goal.x, fp.y - goal.y);
    if (!best || dist < best.dist) best = { ...fp, dist };
  }
  return best;
}

function standableCenterYs(platforms, charH, blockPowered = null) {
  const ys = new Set([FLOOR_Y - charH / 2]);
  for (const p of platforms) {
    if (!isSolidForRoute(p, blockPowered)) continue;
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

/** 플랫폼(벽)이 점유한 그리드 셀 집합. isSolidForRoute와 동일 기준. */
function platformBlockedCells(platforms, blockPowered = null) {
  const blocked = new Set();
  for (const p of platforms) {
    if (!isSolidForRoute(p, blockPowered)) continue;
    const minX = clamp(Math.floor(p.x / ROUTE_CELL), 0, ROUTE_COLS - 1);
    const maxX = clamp(Math.floor((p.x + PLATFORM_W - 1) / ROUTE_CELL), 0, ROUTE_COLS - 1);
    const minY = clamp(Math.floor(p.y / ROUTE_CELL), 0, ROUTE_ROWS - 1);
    const maxY = clamp(Math.floor((p.y + PLATFORM_H - 1) / ROUTE_CELL), 0, ROUTE_ROWS - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) blocked.add(cellKey(x, y));
    }
  }
  return blocked;
}

function routeObstacles(platforms, startCell, goalCell, blockPowered = null) {
  const blocked = platformBlockedCells(platforms, blockPowered);
  // 캐릭터가 이미 겹친 출발/도착 셀은 탐색 가능해야 한다.
  blocked.delete(cellKey(startCell.x, startCell.y));
  blocked.delete(cellKey(goalCell.x, goalCell.y));
  return blocked;
}

/** 블록 셀이면 가장 가까운 빈 셀을, 아니면 자기 자신을 반환 (링 확장 탐색). */
function nearestFreeCell(cell, blocked) {
  if (!blocked.has(cellKey(cell.x, cell.y))) return cell;
  const maxR = Math.max(ROUTE_COLS, ROUTE_ROWS);
  for (let r = 1; r <= maxR; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 현재 링 테두리만
        const nx = cell.x + dx, ny = cell.y + dy;
        if (nx < 0 || nx >= ROUTE_COLS || ny < 0 || ny >= ROUTE_ROWS) continue;
        if (blocked.has(cellKey(nx, ny))) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
      }
    }
    if (best) return best;
  }
  return cell; // 판 전체가 막힘 (사실상 없음)
}

/**
 * 플랫폼 블록을 장애물로 보고 20px 그리드 BFS로 실제 우회 최단 경로를 구한다.
 * 반환 dist는 출발 중심→첫 셀 중심 + 셀 이동 길이 + 마지막 셀 중심→대상 중심의 실제 경로 길이다.
 */
export function findDashRoute(c, t, platforms, goalOverride = null, blockPowered = null) {
  const start = centerOf(c), goal = goalOverride ?? centerOf(t);
  const startCell = pointToCell(start), goalCell = pointToCell(goal);
  const startKey = cellKey(startCell.x, startCell.y);
  const goalKey = cellKey(goalCell.x, goalCell.y);
  const blocked = routeObstacles(platforms, startCell, goalCell, blockPowered);
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

  const standYs = standableCenterYs(platforms, c.h, blockPowered);
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

export function estimateRouteDist(c, t, platforms, blockPowered = null) {
  return findDashRoute(c, t, platforms, null, blockPowered)?.dist ?? Infinity;
}

function dashRouteMultiplier(c) {
  return Number.isFinite(c?.dashRouteMult) ? c.dashRouteMult : DASH_ROUTE_MULT;
}

function rangedDashRouteMultiplier(c) {
  return Number.isFinite(c?.rangedDashRouteMult)
    ? c.rangedDashRouteMult
    : DASH_RANGED_ROUTE_MULT * DASH_RANGED_SKILL_MULT;
}

export function requestRangedDash(vampire, attackerId) {
  if (!vampire || vampire.dead || vampire.side !== "vampire") return;
  vampire._rangedRetaliation = { targetId: attackerId, routeMult: rangedDashRouteMultiplier(vampire) };
  vampire._ping = { targetId: attackerId, ranged: true };
}

/**
 * 인간 원거리 자세 잡기 갱신.
 * 원거리 사거리(인식 범위) 안에 적이 들어오면 _rangedBraced를 세워 물리에서 이속을 1/4로 줄인다.
 */
function updateRangedBrace(c, chars) {
  if (c.side !== "human") { c._rangedBraced = false; return; }
  const range = c.projectileSkill?.range ?? HUMAN_PROJECTILE_RANGE ?? DETECT_RANGE.human;
  const found = findNearestEnemy(c, chars);
  c._rangedBraced = !!(found && found.dist <= range);
}

function isInDetectRange(c, enemy) {
  const range = DETECT_RANGE[c.side] ?? 0;
  const a = centerOf(c);
  const b = centerOf(enemy);
  return Math.hypot(b.x - a.x, b.y - a.y) <= range;
}

function dashGoalForEnemy(c, enemy, platforms, blockPowered = null) {
  return nearestPlatformStandPointTo(enemy, platforms, c.h, blockPowered, c);
}

function findDashRouteToTarget(c, enemy, platforms, routeMult, blockPowered = null) {
  const detectRange = DETECT_RANGE[c.side] ?? 0;
  const budget = detectRange * routeMult;
  const goal = dashGoalForEnemy(c, enemy, platforms, blockPowered);
  if (!goal) return null;
  const route = findDashRoute(c, pointAsTarget(goal, c), platforms, goal, blockPowered);
  if (!route || route.dist > budget || route.dist <= DASH_ARRIVE_DIST + 8) return null;
  return { char: enemy, route, goal };
}

function firstWalkableDashRoutePoint(c, enemy, platforms, blockPowered = null) {
  const detectRange = DETECT_RANGE[c.side] ?? 0;
  const budget = detectRange * dashRouteMultiplier(c);
  const goal = dashGoalForEnemy(c, enemy, platforms, blockPowered);
  if (!goal) return null;
  const route = findDashRoute(c, pointAsTarget(goal, c), platforms, goal, blockPowered);
  if (!route || route.dist <= budget) return null;

  const cx = c.x + c.w / 2;
  for (const pt of route.path.slice(1)) {
    if (Math.abs(pt.x - cx) >= 4) return { ...pt, platformId: goal.platformId };
  }
  return { ...goal };
}

function findNearestDashRoute(c, chars, platforms, blockPowered = null) {
  let best = null;
  for (const enemy of chars) {
    if (enemy === c || enemy.dead || !isEnemySide(c.side, enemy.side)) continue;
    if (!isInDetectRange(c, enemy)) continue;
    const found = findDashRouteToTarget(c, enemy, platforms, dashRouteMultiplier(c), blockPowered);
    if (!found) continue;
    const { route, goal } = found;
    if (!best || route.dist < best.route.dist || (route.dist === best.route.dist && enemy.id < best.char.id)) {
      best = { char: enemy, route, goal };
    }
  }
  return best;
}

/**
 * 공중(점프) 좌표를 그리드에 맞춘 "돌진 좌표보정 시작 위치"(중심 좌표).
 * BFS는 이 보정 위치에서 목표까지의 경로를 계산하고, 실제 비행은 공중 현재 위치에서
 * 이 위치로 먼저 이동(좌표보정)한 뒤 그 경로를 따른다.
 *
 * 중요: 보정 위치가 플랫폼 블록 셀 안에 찍히면 안 된다. 공중 중심이 블록 셀에 겹쳐
 * 있으면(1칸 통로·플랫폼 옆 스침) 가장 가까운 빈 셀 중심으로 밀어낸다.
 */
function jumpDashStartCenter(c, platforms, blockPowered = null) {
  const blocked = platformBlockedCells(platforms, blockPowered);
  const cell = nearestFreeCell(pointToCell(centerOf(c)), blocked);
  return cellCenter(cell);
}

/**
 * 점프 중 돌진 경로. 좌표보정 시작 위치에서 목표까지 BFS 최단 경로를 구하고,
 * 그 앞에 공중 현재 위치 → 보정 위치 leg를 붙여 반환한다. 예산 판정은 규칙대로
 * 보정 시작 위치→목표 경로 길이(route.dist)로 한다.
 */
function findJumpDashRouteToTarget(c, enemy, platforms, routeMult, blockPowered = null) {
  const detectRange = DETECT_RANGE[c.side] ?? 0;
  const budget = detectRange * routeMult;
  const goal = dashGoalForEnemy(c, enemy, platforms, blockPowered);
  if (!goal) return null;
  const startCenter = jumpDashStartCenter(c, platforms, blockPowered);
  const startChar = { x: startCenter.x - c.w / 2, y: startCenter.y - c.h / 2, w: c.w, h: c.h };
  const route = findDashRoute(startChar, pointAsTarget(goal, c), platforms, goal, blockPowered);
  if (!route || route.dist > budget || route.dist <= DASH_ARRIVE_DIST + 8) return null;
  const path = [centerOf(c), ...route.path]; // 공중 현재 위치 → 좌표보정 시작 위치 leg 선두 추가
  return { char: enemy, route: { dist: route.dist, path }, goal };
}

function findNearestJumpDashRoute(c, chars, platforms, blockPowered = null) {
  let best = null;
  for (const enemy of chars) {
    if (enemy === c || enemy.dead || !isEnemySide(c.side, enemy.side)) continue;
    if (!isInDetectRange(c, enemy)) continue;
    const found = findJumpDashRouteToTarget(c, enemy, platforms, dashRouteMultiplier(c), blockPowered);
    if (!found) continue;
    if (!best || found.route.dist < best.route.dist
      || (found.route.dist === best.route.dist && enemy.id < best.char.id)) {
      best = found;
    }
  }
  return best;
}

/**
 * 매 프레임 감지 틱.
 * @param {object} state
 * @param {number} simDt 초
 * @param {() => number} rng
 * @param {Map<number, boolean>|null} blockPowered 이번 프레임 신호 결과 — 게이트 투명화 반영용
 */
export function tickAggro(state, simDt, rng = Math.random, blockPowered = null) {
  const chars = aliveChars(state);
  const byId = new Map(chars.map((c) => [c.id, c]));
  let descentNavigator = null;
  for (const c of chars) {
    if (c._dashCd > 0) c._dashCd -= simDt;
    updateRangedBrace(c, chars); // 인간: 원거리 사거리 안 적 감지 → 이속 감속 플래그

    // ── 돌진 조향: BFS 경로 웨이포인트를 따라 비행 ──
    if (c.state === "DASH") {
      const t = byId.get(c._dashTargetId);
      c._dashTimeLeft = (c._dashTimeLeft ?? 0) - simDt;
      if (!t || t.dead || c._dashTimeLeft <= 0) {
        endDash(c, state.platforms.items, { blockPowered }); // 중단 — 제자리 낙하
        continue;
      }
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const goal = c._dashGoal ?? centerOf(t);
      const tx = goal.x, ty = goal.y;
      const arriveDist = goal.platformId != null ? 4 : DASH_ARRIVE_DIST;
      if (Math.hypot(tx - cx, ty - cy) <= arriveDist) {
        endDash(c, state.platforms.items, { arrived: true, blockPowered });
        continue;
      }
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

    // ── 점프(공중) 중 돌진: 적이 감지범위에 들어오면 좌표보정 후 최단 경로로 돌진 ──
    // 공중 위치를 그리드 "돌진 시작 위치"로 좌표보정한 뒤, 보정 위치→목표 BFS 경로를 따른다.
    if (c.state === "JUMP" && c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestJumpDashRoute(c, chars, state.platforms.items, blockPowered);
      if (found) {
        beginDash(c, found);
        c._ping = null;
        continue;
      }
    }

    // ── 하강(드롭스루 등 공중 낙하) 중 돌진: 점프+돌진과 동일 로직 ──
    // 공중 좌표를 그리드 "돌진 시작 위치"로 좌표보정한 뒤, 보정 위치→목표 BFS 경로를 따른다.
    if (c.state === "FALL" && c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestJumpDashRoute(c, chars, state.platforms.items, blockPowered);
      if (found) {
        beginDash(c, found);
        c._ping = null;
        continue;
      }
    }

    if (!AWARE_STATES.has(c.state)) {
      // 전투 진입/공중/스턴 동안 핑은 무효 (전투 후 재탐색)
      if (c.state === "FIGHT") c._ping = null;
      continue;
    }

    // 인간은 적을 쫓지 않고 뱀파이어 스폰 존(베이스)까지 최소 경로로 행군한다.
    // 플랫폼 위에선 베이스에 가까운 쪽으로 내려가는 최단 하강 가장자리를 따라가고,
    // 바닥에선 베이스 x를 향해 곧장 걷는다. (앞을 막는 뱀파이어와는 combat 틱이 교전 처리)
    if (c.side === "human") {
      c._ping = null;
      if (c._platformId != null) {
        descentNavigator ??= createHumanDescentNavigator(state.platforms.items, blockPowered, BASE_GOAL_X);
        const descent = descentNavigator.findStep(c);
        if (descent) {
          c._descentTargetX = descent.targetX;
          c.dir = descent.dir;
          c.state = "CRAWL";
          c.timer = Math.max(c.timer, 0.4);
          continue;
        }
      }
      c._descentTargetX = null;
      const cx = c.x + c.w / 2;
      if (Math.abs(BASE_GOAL_X - cx) > 2) c.dir = BASE_GOAL_X > cx ? 1 : -1;
      c.state = "CRAWL";
      c.timer = Math.max(c.timer, 0.4);
      continue;
    }


    // ── 원거리 피격 반격: 공격자에게 핑을 찍고 더 넓은 예산(감지×2.5×스킬배율)으로 돌진 ──
    if (c.side === "vampire" && c._rangedRetaliation) {
      const t = byId.get(c._rangedRetaliation.targetId);
      const routeMult = c._rangedRetaliation.routeMult ?? rangedDashRouteMultiplier(c);
      const found = t && !t.dead && isEnemySide(c.side, t.side)
        ? findDashRouteToTarget(c, t, state.platforms.items, routeMult, blockPowered)
        : null;
      if (found) {
        beginDash(c, found);
        c._ping = { targetId: found.char.id, ranged: true, x: found.goal.x, y: found.goal.y, platformId: found.goal.platformId };
        c._rangedRetaliation = null;
        continue;
      }
      c._rangedRetaliation = null;
    }

    // ── 뱀파이어 패시브(혈귀 돌진) ──
    // 중력을 무시한다. 감지 원 안의 적 중 플랫폼을 피해 돌아가는 BFS 최단 경로가
    // 감지범위×배율 이내인 가장 짧은 대상에게 그 최단 경로로 날아간다.
    if (c.side === "vampire" && !(c._dashCd > 0)) {
      const found = findNearestDashRoute(c, chars, state.platforms.items, blockPowered);
      if (found) {
        beginDash(c, found);
        c._ping = null;
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
          ? (firstWalkableDashRoutePoint(c, found.char, state.platforms.items, blockPowered)
            ?? nearestPlatformStandPointTo(found.char, state.platforms.items, c.h, blockPowered, c))
          : null;
        if (c.side === "vampire" && !pingPoint) {
          c._ping = null;
          continue;
        }
        c._ping = { targetId: found.char.id, ...(pingPoint ? { x: pingPoint.x, y: pingPoint.y, platformId: pingPoint.platformId } : {}) };
        // 대상이 위에 있으면 가끔 점프로 올라가 본다
        const t = found.char;
        const pingX = Number.isFinite(c._ping.x) ? c._ping.x : t.x + t.w / 2;
        const dx = pingX - (c.x + c.w / 2);
        if (c.side !== "human" && t.y + t.h < c.y - 4 && Math.abs(dx) < 40 && rng() < 0.3) {
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
      // 수평으로 겹쳐도 멈추지 않는다. 교전 가능하면 combat 틱이 FIGHT로 전환한다.
      c.state = "CRAWL";
      c.timer = Math.max(c.timer, 0.2);
      if (c.dir !== 1 && c.dir !== -1) c.dir = dx >= 0 ? 1 : -1;
    } else {
      c.dir = dx > 0 ? 1 : -1;
      c.state = "CRAWL";
      c.timer = Math.max(c.timer, 0.2); // 계속 걷도록 유지 (핑이 살아있는 동안)
    }
  }
}

// 핑이 없을 때도 physics의 defaultMoveDecide가 걷기/도약을 계속 유지한다.
