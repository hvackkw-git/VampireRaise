// src/decorate/placementRules.js
// 꾸미기 모드 배치 규칙 — Shrimprium decorateModeHandlers의 플랫폼 규칙을 순수 함수로 이식.
// 규칙: 20px 그리드, 상/하 4칸 금지, 논리/플랫폼 2레이어 겹침 허용(같은 레이어만 점유),
//       이동 시 같은 레이어 블록과 위치 교환, 블랙홀-화이트홀 자동 쌍, 리콜 수조당 1개.

import {
  PLATFORM_W, PLATFORM_H, PLATFORM_STEP,
  getPlatformYRange, isLogicLayerBlock,
  PAIRED_BLOCK_OWNER, PAIRED_BLOCK_PARTNER,
} from "../platform/platformBlockRenderer.js";
import { TANK_W, TANK_H } from "../constants.js";

/** 두 블록 타입이 같은 레이어인지 */
export function isSameBlockLayer(a, b) {
  return isLogicLayerBlock(a) === isLogicLayerBlock(b);
}

/** 좌표를 배치 그리드에 스냅. 범위 밖이면 null */
export function snapToGrid(localX, localY) {
  const { minY, maxY } = getPlatformYRange(TANK_H);
  const x = Math.floor(localX / PLATFORM_STEP) * PLATFORM_STEP;
  const y = Math.floor(localY / PLATFORM_STEP) * PLATFORM_STEP;
  if (x < 0 || x + PLATFORM_W > TANK_W || y < minY || y > maxY) return null;
  return { x, y };
}

/**
 * 블랙홀(x,y)의 화이트홀 자동 배치 위치.
 * 우선순위: 같은 행 우측 → 위쪽 행(좌→우) → 아래쪽 행(좌→우) → 같은 행 좌측.
 */
export function findWhiteHolePosition(state, blackX, blackY) {
  const { minY, maxY } = getPlatformYRange(TANK_H);
  const existing = state.platforms.items;
  const occupied = (x, y) =>
    existing.some((p) => !isLogicLayerBlock(p.blockType) && p.x === x && p.y === y);
  for (let x = blackX + PLATFORM_STEP; x + PLATFORM_W <= TANK_W; x += PLATFORM_STEP) {
    if (!occupied(x, blackY)) return { x, y: blackY };
  }
  for (let y = blackY - PLATFORM_STEP; y >= minY; y -= PLATFORM_STEP) {
    for (let x = 0; x + PLATFORM_W <= TANK_W; x += PLATFORM_STEP) {
      if (!occupied(x, y)) return { x, y };
    }
  }
  for (let y = blackY + PLATFORM_STEP; y <= maxY; y += PLATFORM_STEP) {
    for (let x = 0; x + PLATFORM_W <= TANK_W; x += PLATFORM_STEP) {
      if (!occupied(x, y)) return { x, y };
    }
  }
  for (let x = blackX - PLATFORM_STEP; x >= 0; x -= PLATFORM_STEP) {
    if (!occupied(x, blackY)) return { x, y: blackY };
  }
  return null;
}

/**
 * (x,y)에 blockType 배치 시도.
 * @returns {{ok:true, ids:number[]} | {ok:false, reason:string}}
 *   reason: 'range' | 'occupied' | 'noPairSpace' | 'recallExists' | 'notPlaceable'
 */
export function placeBlock(state, x, y, blockType) {
  if (blockType === PAIRED_BLOCK_PARTNER) return { ok: false, reason: "notPlaceable" };
  const { minY, maxY } = getPlatformYRange(TANK_H);
  if (x < 0 || x + PLATFORM_W > TANK_W || y < minY || y > maxY || x % PLATFORM_STEP || y % PLATFORM_STEP) {
    return { ok: false, reason: "range" };
  }
  const items = state.platforms.items;
  if (items.some((p) => isSameBlockLayer(p.blockType, blockType) && p.x === x && p.y === y)) {
    return { ok: false, reason: "occupied" };
  }
  if (blockType === "recall_block" && items.some((p) => p.blockType === "recall_block")) {
    return { ok: false, reason: "recallExists" };
  }
  if (blockType === PAIRED_BLOCK_OWNER) {
    const wh = findWhiteHolePosition(state, x, y);
    if (!wh) return { ok: false, reason: "noPairSpace" };
    const blackId = state.platforms.nextId++;
    const whiteId = state.platforms.nextId++;
    items.push({ id: blackId, x, y, blockType: PAIRED_BLOCK_OWNER, pairId: whiteId });
    items.push({ id: whiteId, x: wh.x, y: wh.y, blockType: PAIRED_BLOCK_PARTNER, pairId: blackId });
    return { ok: true, ids: [blackId, whiteId] };
  }
  const id = state.platforms.nextId++;
  items.push({ id, x, y, blockType });
  return { ok: true, ids: [id] };
}

/**
 * 블록을 dx/dy px 이동 (그리드 단위, 범위 클램프). 같은 레이어 블록과 겹치면 위치 교환.
 * @returns {boolean} 실제로 이동했는지
 */
export function moveBlock(state, platId, dx, dy) {
  const items = state.platforms.items;
  const plat = items.find((p) => p.id === Number(platId));
  if (!plat) return false;
  const { minY, maxY } = getPlatformYRange(TANK_H);
  const newX = Math.max(0, Math.min(TANK_W - PLATFORM_W, plat.x + dx));
  const newY = Math.max(minY, Math.min(maxY, plat.y + dy));
  if (newX === plat.x && newY === plat.y) return false;
  const other = items.find(
    (p) => p.id !== plat.id && isSameBlockLayer(p.blockType, plat.blockType) && p.x === newX && p.y === newY,
  );
  if (other) { other.x = plat.x; other.y = plat.y; }
  plat.x = newX;
  plat.y = newY;
  return true;
}

/** 블록 90° 회전 */
export function rotateBlock(state, platId) {
  const plat = state.platforms.items.find((p) => p.id === Number(platId));
  if (!plat) return;
  plat.rotation = ((((Number(plat.rotation) || 0) + 90) % 360) + 360) % 360;
}

/** 블록 회수(제거). 블랙홀/화이트홀은 쌍으로 함께 제거 */
export function removeBlock(state, platId) {
  const items = state.platforms.items;
  const plat = items.find((p) => p.id === Number(platId));
  if (!plat) return [];
  const removeIds = new Set([plat.id]);
  if (plat.blockType === PAIRED_BLOCK_OWNER || plat.blockType === PAIRED_BLOCK_PARTNER) {
    if (plat.pairId != null) removeIds.add(plat.pairId);
  }
  state.platforms.items = items.filter((p) => !removeIds.has(p.id));
  return [...removeIds];
}

/** 한 칸(x,y)의 블록들 (최대 논리 1 + 플랫폼 1) */
export function blocksAtCell(state, x, y) {
  return state.platforms.items.filter((p) => p.x === x && p.y === y);
}

export { PLATFORM_W, PLATFORM_H, PLATFORM_STEP };
