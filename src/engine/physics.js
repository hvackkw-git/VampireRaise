// src/engine/physics.js
// 캐릭터 이동 물리 — Shrimprium mountAquarium의 새우 물리를 슬림 이식.
// 상태: CRAWL / FIGHT / JUMP / FALL / STUN / DASH / DEAD
// 기믹: 스프링·가시·컨베이어·미끄럼·블랙홀 워프·스턴·투명 게이트·스위치 밟음

import {
  PLATFORM_W, PLATFORM_H,
  getCharHitbox, charOverlapsPlatformX, charSweepsPlatformX,
  getSlideDir, getSpikeDir, getConveyorDir, isLogicLayerBlock,
} from "../platform/platformBlockRenderer.js";
import {
  TANK_W, FLOOR_Y, CRAWL_SPD, CHAR_SPRITES,
  PX_GRAVITY, PX_GRAVITY_JUMP, PX_GRAVITY_JUMP_LAND,
  JUMP_SPEED_MIN, JUMP_SPEED_SPAN, JUMP_MIN_DEG, JUMP_SPAN_DEG,
  STUN_DURATION_MS, CONVEYOR_PUSH_SPD, SLIDE_SPD, WARP_COOLDOWN_MS,
  HUMAN_RANGED_BRACE_SPEED_MULT,
} from "../constants.js";

const HOLY_OBSTACLE_DROP_DELAY_MS = 5000;

/**
 * 현재 걷기 속도. Holy Shrimp는 원거리 사거리 안에 적이 들어오면(_rangedBraced) 자세를 잡느라
 * 이속이 1/4로 줄어든다 — ai.tickAggro가 매 프레임 _rangedBraced를 갱신한다.
 */
function crawlSpeed(c) {
  return c._rangedBraced ? CRAWL_SPD * HUMAN_RANGED_BRACE_SPEED_MULT : CRAWL_SPD;
}

/**
 * 세로 충돌용 몸통 윗변 Y. 진영별 스프라이트 상단 투명 여백(topPad)을 제외해
 * 실제 그림이 있는 몸통만 벽·스턴 판정에 쓴다.
 * 발(c.y + c.h)은 그대로 — 착지/지면 판정은 변하지 않는다.
 */
export function getCharBodyTop(c) {
  const cfg = CHAR_SPRITES[c.side];
  if (!cfg) return c.y;
  return c.y + cfg.topPad * (c.h / cfg.size);
}

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
export function isTangiblePlatform(plat, blockPowered) {
  if (plat.blockType === "white_hole_block") return false;
  if (plat.blockType === "gate_block" && blockPowered?.get(plat.id)) return false;
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
  c._dropThroughId = c._platformId;
  c._platformId = null;
  c.state = "STUN";
  c.vx = 0;
  c.vy = Math.max(0, Number(c.vy) || 0);
  c._stunUntil = now + STUN_DURATION_MS;
  c._stunImmuneUntil = now + STUN_DURATION_MS + 1000;
}

/** 위로 뛰는 점프 시작 (최하단 플랫폼 도달을 보장하는 기본 각도 -52~-68°) */
export function startJump(c, rng = Math.random, minDeg = JUMP_MIN_DEG, spanDeg = JUMP_SPAN_DEG) {
  if (c.side === "human") {
    if (c._platformId != null) startDrop(c);
    else {
      c.state = "FALL";
      c.vx = 0;
      c.vy = Math.max(0, Number(c.vy) || 0);
    }
    return false;
  }
  const angle = -(minDeg + rng() * spanDeg);
  const speed = JUMP_SPEED_MIN + rng() * JUMP_SPEED_SPAN;
  const rad = (angle * Math.PI) / 180;
  c.state = "JUMP";
  c.vx = c.dir * Math.cos(rad) * speed;
  c.vy = Math.sin(rad) * speed;
  c._platformId = null;
  c._jumpApexY = null;
  return true;
}

/**
 * 드롭스루: 밟고 있던 발판을 통과해 바로 아래로 내려간다 (다른 플랫포머의 아래 점프).
 * 떠난 발판(_dropThroughId)만 착지 판정에서 무시하고 그대로 자유낙하하므로,
 * 바로 아래 발판(또는 바닥)에 안착한다.
 */
export function startDrop(c) {
  c._dropThroughId = c._platformId;
  c._platformId = null;
  c.state = "FALL";
  c.vx = 0; c.vy = 0;
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
  const nextY = c.y + c.vy * simDt;
  const candidates = [];
  for (const plat of platforms) {
    if (plat.id === c._dropThroughId) continue; // 드롭스루: 방금 떠난 발판은 통과
    if (!charSweepsPlatformX(c, plat, nextX)) continue;
    if (!isTangiblePlatform(plat, blockPowered)) continue;
    // 가시 트리거 후 바닥까지 통과 (블랙홀은 정상 워프)
    if (plat.blockType !== "black_hole_block" && now < (c._spikeIgnoreUntil ?? 0)) continue;
    const landY = plat.blockType === "slide_block"
      ? getSlopeTopY(plat, c.x + c.w / 2) : plat.y;
    if (c.y + c.h <= landY && nextY + c.h >= landY) {
      candidates.push({ plat, landY });
    }
  }
  if (candidates.length === 0) return false;

  // 한 프레임에 여러 발판을 가로질러도 현재 위치에서 가장 가까운 윗면에 착지한다.
  candidates.sort((a, b) => a.landY - b.landY || a.plat.id - b.plat.id);
  const { plat, landY } = candidates[0];
  const wasStunned = c.state === "STUN" && now < c._stunUntil;
  if (tryWarp(c, plat, platforms, now)) return true;
  c.y = landY - c.h;
  c._platformId = plat.id;
  c._dropThroughId = null; // 아래 발판에 안착 → 드롭스루 종료
  c.vy = 0; c.vx = 0; c._jumpApexY = null;
  if (plat.blockType === "spike_block" && getSpikeDir(plat.rotation ?? 0) === "up") {
    triggerSpike(c, now);
  } else if (plat.blockType === "spring_block") {
    if (c.side === "human") {
      // 적 Holy Shrimp는 점프하지 않는다. 스프링도 방금 밟은 발판으로 표시해 통과 낙하한다.
      startDrop(c);
    } else {
      // 스프링: 고각(-60~-80°)으로 다시 튕김
      c._platformId = null;
      startJump(c, ctx.rng, 60, 20);
      plat.lastBounceAt = now;
    }
  } else if (wasStunned) {
    c.state = "STUN";
  } else {
    c.state = "CRAWL";
    c.timer = 0.8 + (ctx.rng?.() ?? Math.random()) * 1.4;
  }
  return true;
}

/** 바닥 착지 처리 */
function landOnFloor(c, ctx) {
  const groundY = FLOOR_Y - c.h;
  if (c.y >= groundY && c.vy > 0) {
    c.y = groundY; c.vy = 0; c.vx = 0; c._jumpApexY = null; c._dropThroughId = null;
    c.state = c.state === "STUN" ? "STUN" : "CRAWL";
    if (c.state === "CRAWL") c.timer = 0.8 + (ctx.rng?.() ?? Math.random()) * 1.4;
    return true;
  }
  return false;
}

/** 스턴 블록 접촉 검사 (밟는 게 아니라 스치면 발동). 돌진 중에는 지형 무시 */
function checkStunTouch(c, ctx) {
  const { platforms, now } = ctx;
  if (now < c._stunImmuneUntil || c.state === "STUN" || c.state === "DASH") return;
  const hb = getCharHitbox(c);
  const bodyTop = getCharBodyTop(c);
  for (const plat of platforms) {
    if (plat.blockType !== "stun_block") continue;
    const overlapX = hb.x + hb.w > plat.x && hb.x < plat.x + PLATFORM_W;
    const overlapY = c.y + c.h > plat.y && bodyTop < plat.y + PLATFORM_H;
    if (overlapX && overlapY) { triggerStun(c, now); return; }
  }
}

/**
 * 캐릭터 1명의 물리 틱.
 * @param {object} c 캐릭터
 * @param {object} ctx { platforms, blockPowered, now(ms), rng }
 * @param {number} simDt 초
 */
export function tickCharacter(c, ctx, simDt) {
  if (c.dead || c.state === "DEAD") return;
  const { platforms, blockPowered, now } = ctx;
  const rng = ctx.rng ?? Math.random;
  const GROUND_Y = FLOOR_Y - c.h;
  // 구버전 런타임 상태가 남아 있어도 멈추지 않고 즉시 걷기로 흡수한다.
  if (c.state === "IDLE" || c.state === "STAY") {
    c.state = "CRAWL";
    c.timer = 0;
  }
  // Holy Shrimp는 어떤 AI/복원 경로에서 JUMP가 들어와도 상승하지 않는다.
  if (c.side === "human" && c.state === "JUMP") {
    if (c._platformId != null) startDrop(c);
    else {
      c.state = "FALL";
      c.vx = 0;
      c.vy = Math.max(0, Number(c.vy) || 0);
    }
  }
  c.timer -= simDt;

  // ── 플랫폼 인식 지반고 (플랫폼 삭제·이탈·게이트 투명화 → 자유낙하) ──
  let effectiveGroundY = GROUND_Y;
  let onPlat = null;
  if (c._platformId != null) {
    const plat = platforms.find((p) => p.id === c._platformId);
    if (plat && isTangiblePlatform(plat, blockPowered) && charOverlapsPlatformX(c, plat)) {
      onPlat = plat;
      effectiveGroundY = plat.blockType === "slide_block"
        ? getSlopeTopY(plat, c.x + c.w / 2) - c.h
        : plat.y - c.h;
    } else {
      c._platformId = null;
      if (c.state === "CRAWL" || c.state === "FIGHT") {
        c.vx = 0; c.vy = 0;
        c.state = "FALL";
      }
    }
  }

  // Holy Shrimp는 전방 블록에 처음 막힌 시점부터 5초 동안 방향을 바꿔 걷는다.
  // 재충돌이나 플랫폼 이동으로 예약을 갱신하지 않고, 만료 순간 밟고 있는 발판에서 드롭한다.
  if (c.side === "human" && c._obstacleDropAt != null && now >= c._obstacleDropAt) {
    c._obstacleDropAt = null;
    if (c._platformId != null) startDrop(c);
  }

  // ── 스턴 만료 ──
  if (c.state === "STUN" && now >= c._stunUntil) {
    c.state = "CRAWL"; c.timer = 0.3;
  }

  if (c.state === "CRAWL" && c.y < effectiveGroundY - 0.5) {
    c.state = "FALL";
    c.vx = 0; c.vy = 0;
  }

  // ── 상태 머신 ──
  if (c.state === "FIGHT") {
    c.vx = 0;
    if (c.y < effectiveGroundY - 0.5) {
      // 발밑이 비었으면 낙하로 전환
      c.state = "FALL";
    } else {
      c.y = effectiveGroundY; c.vy = 0;
      // FIGHT는 전투 틱이 해제할 때까지 그 자리에서 마주보고 유지한다.
    }
  }

  else if (c.state === "CRAWL") {
    c.y = effectiveGroundY; c.vy = 0;
    const spd = crawlSpeed(c);
    c.vx = c.dir * spd;
    // 벽 반전
    if ((c.x <= 2 && c.dir < 0) || (c.x >= TANK_W - c.w - 2 && c.dir > 0)) {
      c.dir *= -1; c.vx = c.dir * spd;
    }
    // 수평 블록 충돌: 진행 방향 앞 블록 → 반전 (가시 측면·블랙홀 측면 기믹 포함)
    // 세로 겹침은 몸통(상단 투명 여백 제외) 기준 → 1칸 통로를 걸어서 통과 가능
    const hb = getCharHitbox(c);
    const hbLeft = hb.x, hbRight = hb.x + hb.w;
    const bodyTop = getCharBodyTop(c);
    let droppedForObstacle = false;
    for (const plat of platforms) {
      if (plat.id === c._platformId) continue;
      if (!isTangiblePlatform(plat, blockPowered)) continue;
      if (c.y + c.h <= plat.y || bodyTop >= plat.y + PLATFORM_H) continue;
      const MARGIN = 1;
      const step = Math.abs(c.vx) * simDt + MARGIN;
      const hbCenter = (hbLeft + hbRight) / 2;
      const platCenter = plat.x + PLATFORM_W / 2;
      // 블록 경계를 이번 프레임에 넘는 경우뿐 아니라, 좁은 격자에서 몸통이 이미
      // 살짝 겹친 경우도 진행 방향 앞의 장애물로 처리한다.
      const hitRight = c.dir > 0 && platCenter > hbCenter
        && hbLeft < plat.x + PLATFORM_W && hbRight + step > plat.x;
      const hitLeft = c.dir < 0 && platCenter < hbCenter
        && hbRight > plat.x && hbLeft - step < plat.x + PLATFORM_W;
      if (!hitRight && !hitLeft) continue;
      if (tryWarp(c, plat, platforms, now)) break;
      const spikeDir = plat.blockType === "spike_block" ? getSpikeDir(plat.rotation ?? 0) : null;
      if ((hitRight && spikeDir === "left") || (hitLeft && spikeDir === "right")) {
        triggerSpike(c, now); break;
      }
      if (c.side === "human" && c._platformId != null) {
        if (c._obstacleDropAt == null) {
          c._obstacleDropAt = now + HOLY_OBSTACLE_DROP_DELAY_MS;
        }
        c.dir *= -1;
        c.vx = c.dir * spd;
        droppedForObstacle = true;
        break;
      }
      c.dir *= -1; c.vx = c.dir * spd;
      c._blockBounces = (c._blockBounces || 0) + 1;
      c._blockBounceDecay = 0;
      break;
    }
    // 튕김 감쇠 / 4회 이상 연속 튕기면 점프 탈출 (Shrimprium 동작)
    if (!droppedForObstacle && c._blockBounces > 0) {
      c._blockBounceDecay = (c._blockBounceDecay || 0) + simDt;
      if (c._blockBounceDecay > 1.2) { c._blockBounces = 0; c._blockBounceDecay = 0; }
    }
    if (!droppedForObstacle && (c._blockBounces || 0) >= 4) {
      c._blockBounces = 0; c._blockBounceDecay = 0;
      if (c.side !== "human") startJump(c, rng, 40, 20);
    } else if (!droppedForObstacle && c.timer <= 0) {
      defaultMoveDecide(c, ctx, rng);
    } else if (!droppedForObstacle && c.side !== "human" && c._platformId != null
      && aboutToLeavePlatformEdge(c, onPlat, platforms, blockPowered, simDt)) {
      // 플랫폼 가장자리: 좁은 발판(20px)은 CRAWL 타이머가 끝나기 전에 걸어 나가
      // 버려 defaultMoveDecide(도약 판단)가 실행되지 않는다. 바닥에서처럼 도약
      // 기회를 주기 위해 가장자리에 닿는 프레임에 한 번 판단하게 한다.
      defaultMoveDecide(c, ctx, rng);
    }
  }

  else if (c.state === "JUMP") {
    if (c.vy >= 0 && c._jumpApexY == null) c._jumpApexY = c.y;
    const inLastFifth = c._jumpApexY != null && c.y >= GROUND_Y + 0.2 * (c._jumpApexY - GROUND_Y);
    c.vy += (inLastFifth ? PX_GRAVITY_JUMP_LAND : PX_GRAVITY_JUMP) * simDt;
    if (!tryLand(c, ctx, simDt)) landOnFloor(c, ctx);
  }

  else if (c.state === "DASH") {
    // Vamp Shrimp 패시브 돌진: 중력·지형 전부 무시하고 직선 비행.
    // 조향(vx/vy)은 ai.tickAggro가 매 프레임 대상 방향으로 갱신한다 — 여기선 적분만.
  }

  else if (c.state === "FALL" || c.state === "STUN") {
    if (c.state === "STUN" && onPlat) {
      c.y = effectiveGroundY;
      c.vx = 0;
      c.vy = 0;
    } else {
      c.vy += PX_GRAVITY * simDt;
    }
    if (c.state === "STUN" && onPlat) {
      // 스턴이 끝날 때까지 착지한 플랫폼 위에 머문다.
    } else if (now < (c._spikeIgnoreUntil ?? 0)) {
      // 가시 낙하는 기존대로 플랫폼을 무시하고 바닥까지 떨어진다.
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

const MIN_JUMP_RISE = ((JUMP_SPEED_MIN * Math.sin(JUMP_MIN_DEG * Math.PI / 180)) ** 2)
  / (2 * PX_GRAVITY_JUMP);

function lowestJumpTarget(c, platforms, blockPowered) {
  const feetY = c.y + c.h;
  const centerX = c.x + c.w / 2;
  let best = null;
  for (const p of platforms) {
    if (!isTangiblePlatform(p, blockPowered)) continue;
    if (p.blockType === "spring_block" || p.blockType === "black_hole_block") continue;
    if (p.blockType === "spike_block" && getSpikeDir(p.rotation ?? 0) === "up") continue;
    const rise = feetY - p.y;
    if (rise <= 2 || rise > MIN_JUMP_RISE - 3) continue;
    const dx = p.x + PLATFORM_W / 2 - centerX;
    if (!best || p.y > best.platform.y || (p.y === best.platform.y && Math.abs(dx) < Math.abs(best.dx))) {
      best = { platform: p, dx };
    }
  }
  return best;
}

/**
 * 이번 프레임 걷기 이동으로 밟고 있던 플랫폼의 가장자리를 벗어나는지
 * (이어서 밟을 같은 높이의 인접 발판도 없는지) 판정한다. 벗어나는 프레임에
 * 도약 판단을 걸어 바닥에서와 동일한 점프 기회를 준다.
 */
function aboutToLeavePlatformEdge(c, onPlat, platforms, blockPowered, simDt) {
  if (!onPlat) return false;
  const nextX = c.x + c.dir * crawlSpeed(c) * simDt;
  const hb = getCharHitbox({ x: nextX, w: c.w });
  const overlaps = (p) => hb.x + hb.w > p.x && hb.x < p.x + PLATFORM_W;
  if (overlaps(onPlat)) return false; // 아직 현재 발판 위
  for (const p of platforms) {
    if (p.id === onPlat.id || p.y !== onPlat.y) continue; // 같은 높이로 이어지는 발판만
    if (isTangiblePlatform(p, blockPowered) && overlaps(p)) return false; // 옆 발판으로 계속 걸어감
  }
  return true;
}

/** 멈춤 없는 기본 이동: Holy Shrimp는 걷고, 다른 새우 진영은 주기적으로 위 플랫폼을 향해 도약한다. */
export function defaultMoveDecide(c, ctx, rng = Math.random) {
  c.state = "CRAWL";
  if (c.side === "human") {
    c.timer = 1.5;
    return;
  }

  const target = lowestJumpTarget(c, ctx.platforms, ctx.blockPowered);
  if (target) {
    c.dir = target.dx >= 0 ? 1 : -1;
    if (Math.abs(target.dx) <= 175) {
      startJump(c, rng);
      return;
    }
    c.timer = 0.45;
    return;
  }

  if (rng() < 0.32) {
    // 위로 도달할 발판이 없을 때의 세로 이동. 발판 위라면 점프와 같은 빈도로
    // 아래 발판으로 드롭스루하고(반반), 그 외에는 제자리 도약한다.
    if (c._platformId != null && rng() < 0.5) startDrop(c);
    else startJump(c, rng);
    return;
  }
  c.timer = 1.1 + rng() * 1.8;
  if (c.x < 40) c.dir = 1;
  else if (c.x > TANK_W - 72) c.dir = -1;
  else if (c.dir !== 1 && c.dir !== -1) c.dir = rng() > 0.5 ? 1 : -1;
}

// ── 같은 편 군중 분리(separation) ──
// 같은 방향으로 같은 속도(CRAWL_SPD)로 걷는 새우들은 간격이 0으로 수렴해 한 마리처럼
// 겹쳐 보인다. 멈춰 세우지 않고(= stop-start 떨림 없이) 겹친 만큼만 수평으로 약하게
// 밀어내 부채꼴로 퍼지게 한다. 걷는(CRAWL) 유닛에만 적용 — 돌진·점프·낙하·교전 물리는
// 건드리지 않는다.
const SEPARATION_STATE = "CRAWL";
const SEPARATION_GAP_FACTOR = 0.15; // 원하는 중심 간격 = (w_a + w_b) × 이 값
const SEPARATION_PUSH_SPD = 150;    // 프레임당 최대 밀어내기 속도 px/s

export function tickSeparation(chars, simDt) {
  const walkers = chars.filter((c) => !c.dead && c.state === SEPARATION_STATE);
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i];
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j];
      if (b.side !== a.side) continue;
      // 같은 방향을 보고 걷는(줄줄이 따라가는) 쌍만 분리한다. 마주보는(dir 반대)
      // 쌍까지 밀면 서로 힘겨루기하듯 밀치락달치락하므로 제외한다.
      if (a.dir !== b.dir) continue;
      const bcy = b.y + b.h / 2;
      // 세로로 같은 줄(발판 높이)일 때만 — 위아래로 겹친 건 밀지 않는다.
      if (Math.abs(acy - bcy) > Math.min(a.h, b.h) * 0.5) continue;
      const bcx = b.x + b.w / 2;
      const dx = bcx - acx;
      const dist = Math.abs(dx);
      const minGap = (a.w + b.w) * SEPARATION_GAP_FACTOR;
      if (dist >= minGap) continue;
      const overlap = minGap - dist;
      // 완전히 포개졌으면 id로 좌우를 정해 대칭을 깬다.
      const dir = dist > 0.01 ? Math.sign(dx) : (a.id < b.id ? 1 : -1);
      const push = Math.min(overlap * 0.5, SEPARATION_PUSH_SPD * simDt);
      a.x = Math.max(0, Math.min(TANK_W - a.w, a.x - dir * push));
      b.x = Math.max(0, Math.min(TANK_W - b.w, b.x + dir * push));
    }
  }
}
