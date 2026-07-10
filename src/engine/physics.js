// src/engine/physics.js
// 캐릭터 이동 물리 — Shrimprium mountAquarium의 새우 물리를 슬림 이식.
// 상태: IDLE / CRAWL / STAY / JUMP / FALL / STUN / DEAD
// 기믹: 스프링·가시·컨베이어·미끄럼·블랙홀 워프·스턴·투명 게이트·스위치 밟음

import {
  PLATFORM_W, PLATFORM_H,
  getCharHitbox, charOverlapsPlatformX, charSweepsPlatformX,
  getSlideDir, getSpikeDir, getConveyorDir, isLogicLayerBlock,
} from "../platform/platformBlockRenderer.js";
import {
  TANK_W, FLOOR_Y, CRAWL_SPD,
  PX_GRAVITY, PX_GRAVITY_JUMP, PX_GRAVITY_JUMP_LAND,
  STUN_DURATION_MS, CONVEYOR_PUSH_SPD, SLIDE_SPD, WARP_COOLDOWN_MS,
} from "../constants.js";

/** 캐릭터가 밟을 수 없는(지형이 아닌) 블록 — 레드스톤 배선 + 스턴 */
export const NON_PLATFORM_BLOCK_TYPES = new Set([
  "redstone_block",
  "redstone_straight_block",
  "redstone_corner_block",
  "redstone_bridge_block",
  "redstone_tee_block",
  "stun_block",
]);

/** 미끄럼 블록 윗면(경사) Y — Shrimprium getSlopeTopY 이식 */
export function getSlopeTopY(plat, cx) {
  const r = (((Number(plat.rotation) || 0) % 360) + 360) % 360;
  const t = Math.max(0, Math.min(1, (cx - plat.x) / PLATFORM_W));
  if (r === 0)   return plat.y + t * PLATFORM_H;
  if (r === 270) return plat.y + (1 - t) * PLATFORM_H;
  return plat.y; // 90°/180°: 평평
}

/** 블록이 현재 지형으로 유효한가 (화이트홀·ON 게이트·배선·스턴 제외) */
function isTangible(plat, blockPowered) {
  if (plat.blockType === "white_hole_block") return false;
  if (plat.blockType === "gate_block" && blockPowered.get(plat.id)) return false;
  if (NON_PLATFORM_BLOCK_TYPES.has(plat.blockType)) return false;
  return true;
}

/** 블랙홀 → 짝 화이트홀 워프. 성공 시 true */
function tryWarp(c, plat, platforms, now) {
  if (plat.blockType !== "black_hole_block") return false;
  if (now < c._warpCooldownUntil) return false;
  const white = platforms.find((p) => p.id === plat.pairId);
  if (!white) return false;
  c.x = white.x + PLATFORM_W / 2 - c.w / 2;
  c.y = white.y - c.h;
  c.vx = 0; c.vy = 0;
  c._platformId = null;
  c.state = "FALL";
  c._warpCooldownUntil = now + WARP_COOLDOWN_MS;
  return true;
}

/** 가시 발동: 플랫폼 무시하고 바닥까지 낙하 + 잠깐 스턴 느낌 */
function triggerSpike(c, now) {
  c._platformId = null;
  c.state = "FALL";
  c.vx = 0; c.vy = 60;
  c._spikeIgnoreUntil = now + 1500; // 낙하 중 다른 플랫폼 통과
}

/** 스턴 발동 */
function triggerStun(c, now) {
  c._platformId = null;
  c.state = "STUN";
  c.vx = 0;
  c._stunUntil = now + STUN_DURATION_MS;
  c._stunImmuneUntil = now + STUN_DURATION_MS + 1000;
}

/** 위로 뛰는 점프 시작 (Shrimprium의 SWIM 대체 — 각도 -30~-60°) */
export function startJump(c, rng = Math.random, minDeg = 30, spanDeg = 30) {
  const angle = -(minDeg + rng() * spanDeg);
  const speed = 80 + rng() * 40;
  const rad = (angle * Math.PI) / 180;
  c.state = "JUMP";
  c.vx = c.dir * Math.cos(rad) * speed;
  c.vy = Math.sin(rad) * speed;
  c._platformId = null;
  c._jumpApexY = null;
}

/**
 * 착지 판정: 이번 프레임 스윕 구간에서 캐릭터가 내려앉을 플랫폼을 찾아 처리.
 * @returns {boolean} 착지(또는 워프/기믹 발동) 여부
 */
function tryLand(c, ctx, simDt) {
  const { platforms, blockPowered, now } = ctx;
  if (c.vy <= 0 || c._platformId != null) return false;
  const nextX = c.x + c.vx * simDt;
  for (const plat of platforms) {
    if (!charSweepsPlatformX(c, plat, nextX)) continue;
    if (!isTangible(plat, blockPowered)) continue;
    // 가시 트리거 후 바닥까지 통과 (블랙홀은 정상 워프)
    if (plat.blockType !== "black_hole_block" && now < (c._spikeIgnoreUntil ?? 0)) continue;
    const nextY = c.y + c.vy * simDt;
    const landY = plat.blockType === "slide_block"
      ? getSlopeTopY(plat, c.x + c.w / 2) : plat.y;
    if (c.y + c.h <= landY && nextY + c.h >= landY) {
      if (tryWarp(c, plat, platforms, now)) return true;
      c.y = landY - c.h;
      c._platformId = plat.id;
      c.vy = 0; c.vx = 0; c._jumpApexY = null;
      if (plat.blockType === "spike_block" && getSpikeDir(plat.rotation ?? 0) === "up") {
        triggerSpike(c, now);
      } else if (plat.blockType === "spring_block") {
        // 스프링: 고각(-60~-80°)으로 다시 튕김
        c._platformId = null;
        startJump(c, ctx.rng, 60, 20);
        plat.lastBounceAt = now;
      } else {
        c.state = "IDLE";
        c.timer = 0.5 + (ctx.rng?.() ?? Math.random()) * 1.5;
      }
      return true;
    }
  }
  return false;
}

/** 바닥 착지 처리 */
function landOnFloor(c, ctx) {
  const groundY = FLOOR_Y - c.h;
  if (c.y >= groundY && c.vy > 0) {
    c.y = groundY; c.vy = 0; c.vx = 0; c._jumpApexY = null;
    c.state = c.state === "STUN" ? "STUN" : "IDLE";
    if (c.state === "IDLE") c.timer = 0.5 + (ctx.rng?.() ?? Math.random()) * 1.5;
    return true;
  }
  return false;
}

/** 스턴 블록 접촉 검사 (밟는 게 아니라 스치면 발동). 돌진 중에는 지형 무시 */
function checkStunTouch(c, ctx) {
  const { platforms, now } = ctx;
  if (now < c._stunImmuneUntil || c.state === "STUN" || c.state === "DASH") return;
  const hb = getCharHitbox(c);
  for (const plat of platforms) {
    if (plat.blockType !== "stun_block") continue;
    const overlapX = hb.x + hb.w > plat.x && hb.x < plat.x + PLATFORM_W;
    const overlapY = c.y + c.h > plat.y && c.y < plat.y + PLATFORM_H;
    if (overlapX && overlapY) { triggerStun(c, now); return; }
  }
}

/**
 * 캐릭터 1명의 물리 틱.
 * @param {object} c 캐릭터
 * @param {object} ctx { platforms, blockPowered, now(ms), rng }
 * @param {number} simDt 초
 * @param {(c:object)=>void} [onIdleDecide] IDLE 타이머 만료 시 다음 행동 결정 콜백(AI 주입)
 */
export function tickCharacter(c, ctx, simDt, onIdleDecide) {
  if (c.dead || c.state === "DEAD") return;
  const { platforms, blockPowered, now } = ctx;
  const rng = ctx.rng ?? Math.random;
  const GROUND_Y = FLOOR_Y - c.h;
  c.timer -= simDt;

  // ── 플랫폼 인식 지반고 (플랫폼 삭제·이탈·게이트 투명화 → 자유낙하) ──
  let effectiveGroundY = GROUND_Y;
  let onPlat = null;
  if (c._platformId != null) {
    const plat = platforms.find((p) => p.id === c._platformId);
    if (plat && isTangible(plat, blockPowered) && charOverlapsPlatformX(c, plat)) {
      onPlat = plat;
      effectiveGroundY = plat.blockType === "slide_block"
        ? getSlopeTopY(plat, c.x + c.w / 2) - c.h
        : plat.y - c.h;
    } else {
      c._platformId = null;
      if (c.state === "IDLE" || c.state === "CRAWL" || c.state === "STAY" || c.state === "FIGHT") {
        c.vx = 0; c.vy = 0;
        c.state = "FALL";
      }
    }
  }

  // ── 스턴 만료 ──
  if (c.state === "STUN" && now >= c._stunUntil) {
    c.state = "IDLE"; c.timer = 0.3;
  }

  // ── 상태 머신 ──
  if (c.state === "IDLE" || c.state === "STAY" || c.state === "FIGHT") {
    c.vx = 0;
    if (c.y < effectiveGroundY - 0.5) {
      // 발밑이 비었으면 낙하로 전환
      c.state = "FALL";
    } else {
      c.y = effectiveGroundY; c.vy = 0;
      // FIGHT는 전투 틱이 해제할 때까지 그 자리에서 마주보고 유지
      if (c.state !== "FIGHT" && c.timer <= 0) {
        if (c.state === "STAY") {
          c.state = "IDLE"; c.timer = 0.3 + rng();
        } else if (onIdleDecide) {
          onIdleDecide(c);
        } else {
          defaultIdleDecide(c, rng);
        }
      }
    }
  }

  else if (c.state === "CRAWL") {
    c.y = effectiveGroundY; c.vy = 0;
    c.vx = c.dir * CRAWL_SPD;
    // 벽 반전
    if ((c.x <= 2 && c.dir < 0) || (c.x >= TANK_W - c.w - 2 && c.dir > 0)) {
      c.dir *= -1; c.vx = c.dir * CRAWL_SPD;
    }
    // 수평 블록 충돌: 진행 방향 앞 블록 → 반전 (가시 측면·블랙홀 측면 기믹 포함)
    const hb = getCharHitbox(c);
    const hbLeft = hb.x, hbRight = hb.x + hb.w;
    for (const plat of platforms) {
      if (plat.id === c._platformId) continue;
      if (!isTangible(plat, blockPowered)) continue;
      if (c.y + c.h <= plat.y || c.y >= plat.y + PLATFORM_H) continue;
      const MARGIN = 1;
      const step = Math.abs(c.vx) * simDt + MARGIN;
      const hitRight = c.dir > 0 && hbRight <= plat.x && hbRight + step > plat.x;
      const hitLeft = c.dir < 0 && hbLeft >= plat.x + PLATFORM_W && hbLeft - step < plat.x + PLATFORM_W;
      if (!hitRight && !hitLeft) continue;
      if (tryWarp(c, plat, platforms, now)) break;
      const spikeDir = plat.blockType === "spike_block" ? getSpikeDir(plat.rotation ?? 0) : null;
      if ((hitRight && spikeDir === "left") || (hitLeft && spikeDir === "right")) {
        triggerSpike(c, now); break;
      }
      c.dir *= -1; c.vx = c.dir * CRAWL_SPD;
      c._blockBounces = (c._blockBounces || 0) + 1;
      c._blockBounceDecay = 0;
      break;
    }
    // 튕김 감쇠 / 4회 이상 연속 튕기면 점프 탈출 (Shrimprium 동작)
    if (c._blockBounces > 0) {
      c._blockBounceDecay = (c._blockBounceDecay || 0) + simDt;
      if (c._blockBounceDecay > 1.2) { c._blockBounces = 0; c._blockBounceDecay = 0; }
    }
    if ((c._blockBounces || 0) >= 4) {
      c._blockBounces = 0; c._blockBounceDecay = 0;
      startJump(c, rng, 40, 20);
    } else {
      if (rng() < 0.012) { c.state = "STAY"; c.timer = 0.5 + rng() * 2; c.vx = 0; }
      if (c.timer <= 0) { c.state = "IDLE"; c.timer = 0.5 + rng() * 2; c.vx = 0; }
    }
  }

  else if (c.state === "JUMP") {
    if (c.vy >= 0 && c._jumpApexY == null) c._jumpApexY = c.y;
    const inLastFifth = c._jumpApexY != null && c.y >= GROUND_Y + 0.2 * (c._jumpApexY - GROUND_Y);
    c.vy += (inLastFifth ? PX_GRAVITY_JUMP_LAND : PX_GRAVITY_JUMP) * simDt;
    if (!tryLand(c, ctx, simDt)) landOnFloor(c, ctx);
  }

  else if (c.state === "DASH") {
    // 뱀파이어 패시브 돌진: 중력·지형 전부 무시하고 직선 비행.
    // 조향(vx/vy)은 ai.tickAggro가 매 프레임 대상 방향으로 갱신한다 — 여기선 적분만.
  }

  else if (c.state === "FALL" || c.state === "STUN") {
    c.vy += PX_GRAVITY * simDt;
    if (c.state === "STUN" || now < (c._spikeIgnoreUntil ?? 0)) {
      // 스턴/가시 낙하: 플랫폼 무시, 바닥만
      landOnFloor(c, ctx);
    } else if (!tryLand(c, ctx, simDt)) {
      landOnFloor(c, ctx);
    }
  }

  // ── 지면 위 기믹: 컨베이어 / 미끄럼 / 가시(선 자리) ──
  if (onPlat && c._platformId != null) {
    if (onPlat.blockType === "conveyor_block" && blockPowered.get(onPlat.id)) {
      const d = getConveyorDir(onPlat.rotation ?? 0);
      if (d === "left") c.x -= CONVEYOR_PUSH_SPD * simDt;
      else if (d === "right") c.x += CONVEYOR_PUSH_SPD * simDt;
    } else if (onPlat.blockType === "slide_block") {
      const sd = getSlideDir(onPlat.rotation ?? 0);
      if (sd === "right") c.x += SLIDE_SPD * simDt;
      else if (sd === "left") c.x -= SLIDE_SPD * simDt;
      c.y = getSlopeTopY(onPlat, c.x + c.w / 2) - c.h;
    }
  }

  // ── 위치 적분 + 경계 클램프 ──
  c.x += c.vx * simDt;
  c.y += c.vy * simDt;
  c.x = Math.max(0, Math.min(TANK_W - c.w, c.x));
  if (c.y > FLOOR_Y - c.h) { c.y = FLOOR_Y - c.h; c.vy = 0; }

  // ── 스턴 블록 접촉 ──
  checkStunTouch(c, ctx);
}

/** 기본 IDLE 행동 선택: 18% 점프 / 64% 걷기 / 18% 대기 (Shrimprium 비율) */
export function defaultIdleDecide(c, rng = Math.random) {
  const r = rng();
  if (r < 0.18) {
    startJump(c, rng);
  } else if (r < 0.82) {
    c.state = "CRAWL";
    c.timer = 2 + rng() * 3;
    if (c.x < 40) c.dir = 1;
    else if (c.x > TANK_W - 72) c.dir = -1;
    else if (c.dir !== 1 && c.dir !== -1) c.dir = rng() > 0.5 ? 1 : -1;
  } else {
    c.state = "STAY";
    c.timer = 1 + rng() * 3;
  }
}
