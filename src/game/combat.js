// src/game/combat.js
// 전투·전염·경험치. 이동과 분리된 틱 — 사거리 내 적을 주기적으로 공격한다.

import {
  ATTACK_RANGE, ATTACK_COOLDOWN_S, isEnemySide,
  expToNext, expForKill, LEVELUP_HP_GAIN, LEVELUP_ATK_GAIN, KILL_BLOOD_REWARD,
} from "../constants.js";

const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

/** 살아있는 캐릭터 목록 */
export function aliveChars(state) {
  return state.chars.items.filter((c) => !c.dead);
}

/** c에서 가장 가까운 적 (사거리 무제한) */
export function findNearestEnemy(c, chars) {
  let best = null, bestD = Infinity;
  const cc = center(c);
  for (const o of chars) {
    if (o === c || o.dead || !isEnemySide(c.side, o.side)) continue;
    const oc = center(o);
    const d = Math.hypot(oc.x - cc.x, oc.y - cc.y);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best ? { char: best, dist: bestD } : null;
}

/** 경험치 지급 + 레벨업 처리. 레벨업 시 events에 기록 */
export function grantExp(c, amount, events) {
  c.exp += amount;
  while (c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level += 1;
    c.maxHp += LEVELUP_HP_GAIN;
    c.atk += LEVELUP_ATK_GAIN;
    c.hp = c.maxHp;
    events?.push({ type: "levelup", char: c });
  }
}

/** 인간 → 노예 전염 */
export function infectToSlave(c) {
  c.side = "slave";
  c.hp = c.maxHp;
  c.dead = false;
  c.state = "IDLE";
  c.timer = 0.5;
  c.vx = 0; c.vy = 0;
}

/**
 * 전투 틱. 사거리 내 최근접 적을 공격 쿨다운마다 타격.
 * - 인간이 뱀파이어 진영에게 죽으면 그 자리에서 노예로 전염.
 * - 뱀파이어는 dead 마크(부활 대상), 노예·인간은 사망 시 제거 대상.
 * @returns {Array<object>} events — hit/kill/infect/levelup (연출·보상용)
 */
export function tickCombat(state, simDt) {
  const events = [];
  const chars = aliveChars(state);
  for (const c of chars) {
    if (c.dead || c.state === "STUN") continue;
    c._atkCd -= simDt;
    if (c._atkCd > 0) continue;
    const found = findNearestEnemy(c, chars);
    if (!found || found.dist > ATTACK_RANGE) continue;
    const target = found.char;
    if (target.dead) continue;
    c._atkCd = ATTACK_COOLDOWN_S;
    target.hp -= c.atk;
    // 공격 방향 바라보기
    c.dir = target.x + target.w / 2 >= c.x + c.w / 2 ? 1 : -1;
    events.push({ type: "hit", attacker: c, target, dmg: c.atk });
    if (target.hp > 0) continue;

    // ── 처치 ──
    target.hp = 0;
    grantExp(c, expForKill(target.level), events);
    if (target.side === "human") {
      state.blood += KILL_BLOOD_REWARD;
      events.push({ type: "kill", target });
      infectToSlave(target);
      events.push({ type: "infect", char: target });
    } else {
      target.dead = true;
      target.state = "DEAD";
      events.push({ type: "kill", target });
    }
  }
  // 노예/인간 시체는 제거 (뱀파이어 시체는 부활 대상으로 보존)
  state.chars.items = state.chars.items.filter((c) => !c.dead || c.side === "vampire");
  return events;
}
