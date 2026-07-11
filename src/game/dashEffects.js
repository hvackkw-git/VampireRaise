// 혈귀 돌진(Dash) 색상 스킬 효과 — 경로 피해(노랑)·도착 폭발(파랑)·실드(보라)·스턴(하양).
// 피해는 state._dashHits 큐에 실어 combat.tickCombat이 처치·경험치·전염까지 일괄 처리하게 한다.
// 각 함수는 화려한 연출을 위한 "시각 이벤트" 배열을 dashEvents로 받아 채운다.

import { isEnemySide } from "../constants.js";
import {
  pathDamageMult, explosionDamageMult, shieldHpMult, stunSeconds,
} from "../skills/dashColors.js";

/** 경로 피해 판정 반경(중심 간 px) */
export const PATH_HIT_RADIUS = 20;
/** 도착 폭발 반경(px) */
export const EXPLOSION_RADIUS = 46;
/** 보라 실드 지속(초) */
export const SHIELD_SECONDS = 5;

const centerOf = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

function queueDashHit(state, attacker, target, dmg) {
  if (!(dmg > 0)) return;
  if (!Array.isArray(state._dashHits)) state._dashHits = [];
  state._dashHits.push({ attacker, target, dmg });
}

/** 돌진 시작 시 이번 돌진의 효과 상태 초기화 */
export function resetDashEffects(c) {
  c._dashHitIds = new Set();
}

/**
 * 노랑 · 경로 데미지 — 비행 중 스친 적에게 1회씩 피해. (돌진 틱마다 호출)
 * @returns {void} 시각 이벤트는 dashEvents에 push
 */
export function applyDashPathDamage(c, chars, state, dashEvents) {
  const mult = pathDamageMult(c.dashColors);
  if (mult <= 0) return;
  if (!c._dashHitIds) c._dashHitIds = new Set();
  const a = centerOf(c);
  for (const e of chars) {
    if (e.dead || e === c || !isEnemySide(c.side, e.side)) continue;
    if (c._dashHitIds.has(e.id)) continue;
    const b = centerOf(e);
    if (Math.hypot(b.x - a.x, b.y - a.y) > PATH_HIT_RADIUS + (e.w + c.w) / 4) continue;
    c._dashHitIds.add(e.id);
    const dmg = Math.max(1, Math.round(c.atk * mult));
    queueDashHit(state, c, e, dmg);
    dashEvents.push({ type: "dashZap", x: b.x, y: b.y, target: e });
  }
}

/**
 * 도착 후 효과 — 파랑 폭발 / 보라 실드 / 하양 스턴. (arrived로 endDash될 때 호출)
 * @param {object} c 돌진 Vamp Shrimp
 * @param {object[]} chars 전체 캐릭터
 * @param {object|null} target 돌진 대상(스턴 판정용)
 * @param {object} state
 * @param {number} nowMs 스턴 만료 계산용 절대 시각(ms)
 * @param {object[]} dashEvents 시각 이벤트 sink
 */
export function applyDashArrivalEffects(c, chars, target, state, nowMs, dashEvents) {
  const points = c.dashColors || {};
  const center = centerOf(c);

  // 파랑 · 폭발
  const exMult = explosionDamageMult(points);
  if (exMult > 0) {
    let hitCount = 0;
    for (const e of chars) {
      if (e.dead || e === c || !isEnemySide(c.side, e.side)) continue;
      const b = centerOf(e);
      if (Math.hypot(b.x - center.x, b.y - center.y) > EXPLOSION_RADIUS) continue;
      queueDashHit(state, c, e, Math.max(1, Math.round(c.atk * exMult)));
      hitCount++;
    }
    dashEvents.push({
      type: "dashExplosion", x: center.x, y: center.y,
      radius: EXPLOSION_RADIUS, hits: hitCount, char: c,
    });
  }

  // 보라 · 실드
  const shMult = shieldHpMult(points);
  if (shMult > 0) {
    const amount = Math.max(1, Math.round(c.maxHp * shMult));
    c._shieldHp = amount;
    c._shieldMax = amount;
    c._shieldT = SHIELD_SECONDS;
    dashEvents.push({ type: "dashShield", char: c, amount });
  }

  // 하양 · 스턴(대상 Holy Shrimp)
  const stunS = stunSeconds(points);
  const canStun = target && nowMs >= (Number(target._stunImmuneUntil) || 0)
    && target.state !== "STUN";
  if (stunS > 0 && canStun && !target.dead && target.side === "human") {
    target._dropThroughId = target._platformId;
    target.state = "STUN";
    target.vx = 0;
    target.vy = Math.max(0, Number(target.vy) || 0);
    target._platformId = null;
    target._stunUntil = nowMs + stunS * 1000;
    target._stunImmuneUntil = nowMs + stunS * 1000 + 1000;
    dashEvents.push({ type: "dashStun", target, seconds: stunS });
  }
}

/**
 * 실드로 피해를 흡수한다. combat/projectile 피해 적용 직전에 호출.
 * @returns {{ dealt:number, absorbed:number }}
 */
export function absorbWithShield(target, dmg) {
  if (!(target._shieldT > 0) || !(target._shieldHp > 0) || !(dmg > 0)) {
    return { dealt: dmg, absorbed: 0 };
  }
  const absorbed = Math.min(target._shieldHp, dmg);
  target._shieldHp -= absorbed;
  if (target._shieldHp <= 0) { target._shieldHp = 0; target._shieldT = 0; }
  return { dealt: dmg - absorbed, absorbed };
}
