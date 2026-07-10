// Human descent navigation. A route consists only of walking along a platform
// top and dropping from an edge, so every transition moves strictly downward.

import { TANK_W, FLOOR_Y, CHAR_SIZE } from "../constants.js";
import {
  CHAR_HITBOX_W, PLATFORM_W, getSpikeDir,
} from "../platform/platformBlockRenderer.js";
import { isTangiblePlatform } from "../engine/physics.js";

const HITBOX_HALF = CHAR_HITBOX_W / 2;
const MIN_CENTER_X = CHAR_SIZE / 2;
const MAX_CENTER_X = TANK_W - CHAR_SIZE / 2;

function isSafeSupport(block) {
  if (block.blockType === "spring_block" || block.blockType === "black_hole_block") return false;
  if (block.blockType === "spike_block" && getSpikeDir(block.rotation ?? 0) === "up") return false;
  return true;
}

function overlapsFallLine(centerX, cell) {
  return centerX + HITBOX_HALF > cell.x && centerX - HITBOX_HALF < cell.x + PLATFORM_W;
}

function buildNavigation(platforms, blockPowered = null, goalX = null) {
  const tangible = platforms.filter((p) => isTangiblePlatform(p, blockPowered));
  const cellsByKey = new Map();
  for (const block of tangible) {
    const key = `${block.x},${block.y}`;
    let cell = cellsByKey.get(key);
    if (!cell) {
      cell = { x: block.x, y: block.y, blocks: [], safe: true, segment: null };
      cellsByKey.set(key, cell);
    }
    cell.blocks.push(block);
    if (!isSafeSupport(block)) cell.safe = false;
  }
  const cells = [...cellsByKey.values()];
  const rows = new Map();
  for (const cell of cells.filter((entry) => entry.safe)) {
    const row = rows.get(cell.y) ?? [];
    row.push(cell);
    rows.set(cell.y, row);
  }

  const segments = [];
  const segmentByPlatformId = new Map();
  const planMemo = new Map();
  for (const [y, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    let segment = null;
    for (const cell of row) {
      if (!segment || cell.x > segment.right) {
        segment = { id: `${y}:${cell.x}`, y, left: cell.x, right: cell.x + PLATFORM_W, cells: [] };
        segments.push(segment);
      } else {
        segment.right = Math.max(segment.right, cell.x + PLATFORM_W);
      }
      segment.cells.push(cell);
      cell.segment = segment;
      for (const block of cell.blocks) segmentByPlatformId.set(block.id, segment);
    }
  }

  function landingAt(centerX, afterY) {
    const hits = cells.filter((cell) => cell.y > afterY + 0.1 && overlapsFallLine(centerX, cell));
    if (hits.length === 0) return { floor: true, y: FLOOR_Y };
    const firstY = Math.min(...hits.map((cell) => cell.y));
    const firstCells = hits.filter((cell) => cell.y === firstY);
    if (firstCells.some((cell) => !cell.safe)) return null;
    const cell = firstCells.reduce((best, entry) => (
      Math.abs(entry.x + PLATFORM_W / 2 - centerX) < Math.abs(best.x + PLATFORM_W / 2 - centerX)
        ? entry : best
    ));
    return cell.segment ? { floor: false, y: firstY, segment: cell.segment } : null;
  }

  function planFromSegment(segment, startX) {
    const memoKey = `${segment.id}:${startX}`;
    if (planMemo.has(memoKey)) return planMemo.get(memoKey);
    const drops = [segment.left - HITBOX_HALF - 1, segment.right + HITBOX_HALF + 1]
      .filter((x) => x >= MIN_CENTER_X && x <= MAX_CENTER_X);
    let best = null;
    for (const targetX of drops) {
      const landing = landingAt(targetX, segment.y);
      if (!landing) continue;
      let tailDistance;
      if (landing.floor) {
        // 바닥에 닿은 뒤 목표(베이스) x까지 걸어가는 거리까지 포함해 최소 경로를 고른다.
        tailDistance = (FLOOR_Y - segment.y)
          + (goalX == null ? 0 : Math.abs(targetX - goalX));
      } else {
        const next = planFromSegment(landing.segment, targetX);
        if (!next) continue;
        tailDistance = landing.y - segment.y + next.distance;
      }
      const distance = Math.abs(targetX - startX) + tailDistance;
      if (!best || distance < best.distance) {
        best = { targetX, dir: targetX >= startX ? 1 : -1, distance };
      }
    }
    planMemo.set(memoKey, best);
    return best;
  }

  function spawnRoute(centerX) {
    const landing = landingAt(centerX, -1);
    if (!landing) return null;
    if (landing.floor) return { centerX, x: centerX - CHAR_SIZE / 2, distance: FLOOR_Y };
    const next = planFromSegment(landing.segment, centerX);
    if (!next) return null;
    return {
      centerX,
      x: centerX - CHAR_SIZE / 2,
      distance: landing.y + next.distance,
    };
  }

  return { segmentByPlatformId, planFromSegment, spawnRoute };
}

/** 위쪽 스폰 지점에서 바닥까지 도달 가능한 모든 가로 위치. */
export function findHumanSpawnRoutes(platforms, blockPowered = null) {
  const nav = buildNavigation(platforms, blockPowered);
  const routes = [];
  for (let centerX = MIN_CENTER_X; centerX <= MAX_CENTER_X; centerX += 2) {
    const route = nav.spawnRoute(centerX);
    if (route) routes.push(route);
  }
  return routes;
}

export function hasHumanDescentPath(platforms, blockPowered = null) {
  return findHumanSpawnRoutes(platforms, blockPowered).length > 0;
}

export function createHumanDescentNavigator(platforms, blockPowered = null, goalX = null) {
  const nav = buildNavigation(platforms, blockPowered, goalX);
  return {
    findStep(char) {
      if (char?._platformId == null) return null;
      const segment = nav.segmentByPlatformId.get(char._platformId);
      if (!segment) return null;
      return nav.planFromSegment(segment, char.x + char.w / 2);
    },
  };
}

/** 현재 플랫폼에서 바닥으로 이어지는 최단 하강 가장자리. */
export function findHumanDescentStep(char, platforms, blockPowered = null) {
  return createHumanDescentNavigator(platforms, blockPowered).findStep(char);
}
