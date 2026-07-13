// src/game/combat.js
// 교전형 전투·전염·경험치.
// 적끼리 우연히 만나(근접 + 비슷한 높이 + 지상 상태) 마주치면 서로 마주보고 멈춰서(FIGHT)
// 공격 쿨다운마다 타격을 주고받는다. 대상이 죽거나 멀어지면 교전이 풀린다.

import {
  ENGAGE_RANGE, FIGHT_BREAK_RANGE, ENGAGE_MAX_DY, ATTACK_COOLDOWN_S,
  ATTACK_RAISE_S, ATTACK_SLAM_S, SLAM_REACH, SLAM_MAX_DY, isEnemySide,
  expToNext, expForKill, LEVELUP_HP_GAIN, LEVELUP_ATK_GAIN, KILL_BLOOD_REWARD,
  CHAR_SPRITES, SLAVE_BASE, vampireReviveCooldown,
  FLOOR_Y, VAMPIRE_SPAWN_ZONE, spawnXInZone,
} from "../constants.js";
import { revengeAttackMult, multiHitChance } from "../skills/dashColors.js";
import { hasZombieTrait, zombieHpBonus } from "../skills/zombieSkills.js";
import { effectiveAttackCooldown, mitigateDamage } from "../stats/characterStats.js";
import { absorbWithShield } from "./dashEffects.js";

export const ZOMBIE_POISON_RADIUS = 46;
export const ZOMBIE_POISON_MAX_STACKS = 5;

const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
const dist = (a, b) => {
  const ac = center(a), bc = center(b);
  return Math.hypot(bc.x - ac.x, bc.y - ac.y);
};
const dy = (a, b) => Math.abs((a.y + a.h / 2) - (b.y + b.h / 2));

export function resetSwing(c) {
  if (!c) return;
  c._swinging = false;
  c._swingT = 0;
  c._slamFired = false;
}

function isInSlamArea(a, t) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
  const dxFront = (tx - ax) * a.dir;
  return dxFront > -a.w / 2 && dxFront <= SLAM_REACH && Math.abs(ty - ay) <= SLAM_MAX_DY;
}

const SLAM_APPROACH_BUFFER = 2;

/** 같은 높이의 대상이 slam 사거리 밖에 있을 때 안전 사거리까지 남은 전진 거리. */
function slamApproachDistance(a, t) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
  const dxFront = (tx - ax) * a.dir;
  if (Math.abs(ty - ay) > SLAM_MAX_DY || dxFront <= SLAM_REACH - SLAM_APPROACH_BUFFER) return 0;
  return dxFront - (SLAM_REACH - SLAM_APPROACH_BUFFER);
}

/** 교전을 시작할 수 있는(지상에 서 있는) 상태 */
const GROUND_STATES = new Set(["CRAWL", "FIGHT"]);
const TARGETABLE_STATES = new Set(["CRAWL", "FIGHT", "STUN"]);

/** 살아있는 캐릭터 목록 */
export function aliveChars(state) {
  return state.chars.items.filter((c) => !c.dead);
}

/** c에서 가장 가까운 적 (사거리 무제한) */
export function findNearestEnemy(c, chars) {
  let best = null, bestD = Infinity;
  for (const o of chars) {
    if (o === c || o.dead || !isEnemySide(c.side, o.side)) continue;
    const d = dist(c, o);
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
    if (c.side === "vampire") {
      c.skillPoints = Math.max(0, Number(c.skillPoints) || 0) + 1;
      c.statPoints = Math.max(0, Number(c.statPoints) || 0) + 1;
    }
    c.maxHp += LEVELUP_HP_GAIN;
    c.atk += LEVELUP_ATK_GAIN;
    c.hp = c.maxHp;
    events?.push({ type: "levelup", char: c });
  }
}

/** Holy Shrimp → Jombie Shrimp 전염 (스프라이트 크기가 다르면 발 위치를 유지하며 박스 교체) */
export function infectToSlave(c, ownerVampire = null, {
  yellowRevive = false, redPoison = false,
} = {}) {
  c.side = "slave";
  c.ownerVampireId = ownerVampire?.id ?? null;
  const size = CHAR_SPRITES.slave?.size ?? c.h;
  c.y += c.h - size; // 발(y+h) 고정
  c.w = size;
  c.h = size;
  c.maxHp = SLAVE_BASE.maxHp + zombieHpBonus(ownerVampire);
  c.hp = c.maxHp;
  c.maxMp = SLAVE_BASE.maxMp;
  c.mp = c.maxMp;
  c.zombiePattern = yellowRevive ? "RILI_YELLOW" : redPoison ? "RILI_RED_POISON" : null;
  c.zombieRevivesLeft = yellowRevive ? 1 : 0;
  c.poisonStacks = 0;
  c._poisonClock = 0;
  c.dead = false;
  c.state = "CRAWL";
  c.timer = 0.5;
  c.vx = 0; c.vy = 0;
  c._fightTargetId = null;
  c._ping = null;
  resetSwing(c);
}

/** 부활 특성 Jombie Shrimp를 한 번 되살리고 소모된 RILI 패턴을 제거한다. */
export function reviveZombieOnce(c, events = []) {
  if (c?.side !== "slave" || !(c.zombieRevivesLeft > 0)) return false;
  c.zombieRevivesLeft -= 1;
  c.zombiePattern = null;
  c.hp = c.maxHp;
  c.dead = false;
  c.state = "CRAWL";
  c.timer = 0.5;
  c.vx = 0;
  c.vy = 0;
  c._fightTargetId = null;
  c._ping = null;
  resetSwing(c);
  events.push({ type: "zombieRevive", char: c });
  return true;
}

/** 붉은 RILI Jombie Shrimp의 최종 사망: 주변 적에게 지속 독을 1중첩한다. */
export function explodeZombiePoison(c, state, events = []) {
  if (c?.side !== "slave" || c.zombiePattern !== "RILI_RED_POISON") return 0;
  const origin = center(c);
  let hits = 0;
  for (const target of state.chars.items) {
    if (target === c || target.dead || !isEnemySide(c.side, target.side)) continue;
    const p = center(target);
    if (Math.hypot(p.x - origin.x, p.y - origin.y) > ZOMBIE_POISON_RADIUS) continue;
    const previousStacks = Math.max(0, Math.floor(Number(target.poisonStacks) || 0));
    target.poisonStacks = Math.min(
      ZOMBIE_POISON_MAX_STACKS,
      previousStacks + 1,
    );
    if (previousStacks === 0) target._poisonClock = 0;
    hits++;
  }
  events.push({ type: "zombiePoisonExplosion", char: c, radius: ZOMBIE_POISON_RADIUS, hits });
  return hits;
}

function tickPoison(state, simDt, events) {
  for (const c of state.chars.items) {
    if (c.dead || !(c.poisonStacks > 0)) continue;
    c._poisonClock = (Number(c._poisonClock) || 0) + simDt;
    while (c._poisonClock >= 1 && c.hp > 0) {
      c._poisonClock -= 1;
      const dmg = c.maxHp * 0.01 * Math.min(ZOMBIE_POISON_MAX_STACKS, c.poisonStacks);
      c.hp -= dmg;
      events.push({ type: "poisonTick", target: c, dmg });
    }
    if (c.hp > 0) continue;
    c.hp = 0;
    c.dead = true;
    c.state = "DEAD";
    c._fightTargetId = null;
    events.push({ type: "kill", target: c, poison: true });
  }
}

function vampireOrder(c) {
  return Number.isFinite(c?.vampireOrder) ? c.vampireOrder : Infinity;
}

function chooseZombieOwner(hitRecords, human) {
  return hitRecords
    .filter((r) => r.target === human && r.attacker.side === "vampire")
    .map((r) => r.attacker)
    .sort((a, b) => vampireOrder(a) - vampireOrder(b) || a.id - b.id)[0] ?? null;
}

function tickSlaveDecay(state, simDt, events) {
  if (!state.wave.active) return;
  for (const c of state.chars.items) {
    if (c.dead || c.side !== "slave") continue;
    c.hp -= SLAVE_BASE.hpDecayPerSecond * simDt;
    if (c.hp > 0) continue;
    c.hp = 0;
    if (reviveZombieOnce(c, events)) continue;
    explodeZombiePoison(c, state, events);
    c.dead = true;
    c.state = "DEAD";
    c._fightTargetId = null;
    events.push({ type: "kill", target: c, decay: true });
  }
}

/** 죽은 Vamp Shrimp 자동 부활: 사망 시 걸어둔 쿨타임(5초+레벨×1초)이 다 되면 왼쪽 아래 스폰 존 바닥에서 되살아난다 */
function tickVampireAutoRevive(state, simDt, events, rng = Math.random) {
  for (const c of state.chars.items) {
    if (c.side !== "vampire" || !c.dead) continue;
    c._reviveCd = Math.max(0, (Number(c._reviveCd) || 0) - simDt);
    if (c._reviveCd > 0) continue;
    c.dead = false;
    c.hp = c.maxHp;
    c.state = "CRAWL";
    c.x = spawnXInZone(VAMPIRE_SPAWN_ZONE, c.w, rng);
    c.y = FLOOR_Y - c.h;
    c.vx = 0; c.vy = 0;
    c._platformId = null;
    c._fightTargetId = null;
    resetSwing(c);
    events.push({ type: "vampireRevive", char: c });
  }
}

/** 교전 진입: 멈춰서 대상을 마주본다 (핑 추적 종료) */
function engage(c, target) {
  resetSwing(c);
  c.state = "FIGHT";
  c._fightTargetId = target.id;
  c._fightClosing = false;
  c._fightAdvanceLeft = 0;
  c._ping = null;
  c.vx = 0;
  c.dir = target.x + target.w / 2 >= c.x + c.w / 2 ? 1 : -1;
}

/** 교전 해제 → 잠시 후 배회 복귀 */
function disengage(c) {
  if (c.state === "FIGHT") { c.state = "CRAWL"; c.timer = 0.3; }
  c._fightTargetId = null;
  c._fightClosing = false;
  c._fightAdvanceLeft = 0;
  resetSwing(c);
}

/**
 * 전투 틱.
 * 1) 교전 시작: 지상 상태의 적이 ENGAGE_RANGE 안에 오면 양쪽 모두 FIGHT로 마주본다.
 * 2) 교전 유지: 대상이 죽거나 FIGHT_BREAK_RANGE 밖으로 벗어나면 해제.
 *    유지 중에는 쿨다운마다 공격.
 * 3) 처치: Holy Shrimp가 Vamp Shrimp 진영에게 죽으면 그 자리에서 Jombie Shrimp로 전염.
 *    Vamp Shrimp는 dead 마크(부활 대상), Jombie Shrimp는 제거.
 * 4) 자동 부활: dead 마크된 Vamp Shrimp는 사망 시 걸린 쿨타임(5초+레벨×1초)이
 *    다 되면 웨이브 중이라도 왼쪽 아래 스폰 존에서 자동으로 되살아난다.
 * @returns {Array<object>} events — engage/hit/kill/infect/levelup/vampireRevive (연출·보상용)
 */
export function tickCombat(state, simDt) {
  const events = [];
  const chars = aliveChars(state);
  const byId = new Map(chars.map((c) => [c.id, c]));

  // 쿨다운·버프 타이머는 항상 진행
  for (const c of chars) {
    c._atkCd -= simDt;
    if (c._shieldT > 0) { // 보라 실드 지속
      c._shieldT -= simDt;
      if (c._shieldT <= 0) { c._shieldT = 0; c._shieldHp = 0; }
    }
  }

  // 1) 교전 시작
  for (const c of chars) {
    if (c.dead || c.state === "FIGHT" || !GROUND_STATES.has(c.state)) continue;
    const found = findNearestEnemy(c, chars);
    if (!found || found.dist > ENGAGE_RANGE) continue;
    const t = found.char;
    if (!TARGETABLE_STATES.has(t.state)) continue;
    if (dy(c, t) > ENGAGE_MAX_DY) continue;
    engage(c, t);
    // 스턴 대상은 적으로 계속 인식하되 행동 불능 상태를 덮어쓰지 않는다.
    if (t.state !== "FIGHT" && t.state !== "STUN") engage(t, c);
    events.push({ type: "engage", a: c, b: t });
  }

  // 2) 교전 유지·공격
  const hitRecords = [];
  for (const c of chars) {
    if (c.dead || c.state !== "FIGHT") continue;
    const t = byId.get(c._fightTargetId);
    const valid = t && !t.dead && isEnemySide(c.side, t.side)
      && dist(c, t) <= FIGHT_BREAK_RANGE && dy(c, t) <= ENGAGE_MAX_DY + 8;
    if (!valid) { disengage(c); continue; }
    // 항상 대상을 마주본다
    c.dir = t.x + t.w / 2 >= c.x + c.w / 2 ? 1 : -1;
    if (c.side === "vampire") {
      if (c._fightClosing && !c._swinging) {
        const advanceLeft = slamApproachDistance(c, t);
        if (advanceLeft > 0) {
          c._fightAdvanceLeft = advanceLeft;
          continue;
        }
        c._fightClosing = false;
        c._fightAdvanceLeft = 0;
      }
      if (c._atkCd <= 0 && !c._swinging) {
        c._swinging = true;
        c._swingT = 0;
        c._slamFired = false;
        c._atkCd = effectiveAttackCooldown(c, ATTACK_COOLDOWN_S);
      }
      if (!c._swinging) continue;
      c._swingT = (Number(c._swingT) || 0) + simDt;
      const slamAt = ATTACK_RAISE_S + ATTACK_SLAM_S;
      if (c._swingT >= slamAt && !c._slamFired) {
        if (isInSlamArea(c, t)) {
          c._fightClosing = false;
          c._fightAdvanceLeft = 0;
          let dmg = c.atk;
          if (c._revengePending) {
            dmg = Math.round(dmg * revengeAttackMult(c.dashColors));
            c._revengePending = false;
          }
          hitRecords.push({ attacker: c, target: t, dmg });
          const p = multiHitChance(c.dashColors);
          if (p > 0 && Math.random() < p) {
            hitRecords.push({ attacker: c, target: t, dmg });
            events.push({ type: "multiHit", attacker: c, target: t });
          }
          events.push({ type: "slam", attacker: c, target: t, hit: true });
        } else {
          const advanceLeft = slamApproachDistance(c, t);
          if (advanceLeft > 0) {
            c._fightClosing = true;
            c._fightAdvanceLeft = advanceLeft;
          }
          events.push({ type: "slam", attacker: c, target: t, hit: false });
        }
        c._slamFired = true;
      }
      if (c._swingT >= slamAt) c._swinging = false;
      continue;
    }
    if (c._atkCd > 0) continue;
    c._atkCd = effectiveAttackCooldown(c, ATTACK_COOLDOWN_S);
    hitRecords.push({ attacker: c, target: t, dmg: c.atk });
  }

  // 돌진 색상 효과(노랑 경로·파랑 폭발)로 예약된 피해를 합류시켜 처치·전염을 일괄 처리
  if (state._dashHits?.length) {
    for (const h of state._dashHits) hitRecords.push(h);
    state._dashHits = [];
  }
  if (state._activeSkillHits?.length) {
    for (const h of state._activeSkillHits) hitRecords.push(h);
    state._activeSkillHits = [];
  }

  const lethalAttackers = new Map();
  for (const r of hitRecords) {
    if (r.attacker.dead || r.target.dead) continue;
    // 보라=실드: 대상이 실드를 두르고 있으면 피해를 먼저 흡수한다.
    const reducedDamage = mitigateDamage(r.target, r.dmg);
    const { dealt, absorbed } = absorbWithShield(r.target, reducedDamage);
    const hpBefore = r.target.hp;
    r.target.hp -= dealt;
    if (dealt > 0 && r.lifestealRate > 0 && !r.attacker.dead) {
      const healBefore = r.attacker.hp;
      r.attacker.hp = Math.min(r.attacker.maxHp, r.attacker.hp + dealt * r.lifestealRate);
      const amount = r.attacker.hp - healBefore;
      if (amount > 0) events.push({ type: "backflipLifesteal", char: r.attacker, amount });
    }
    if (dealt > 0 && r.target.hp > 0 && r.stunUntil > 0
      && r.stunUntil > (Number(r.target._stunUntil) || 0)
      && r.stunStart >= (Number(r.target._stunImmuneUntil) || 0)) {
      r.target._dropThroughId = r.target._platformId;
      r.target.state = "STUN";
      r.target.vx = 0;
      r.target.vy = Math.max(0, Number(r.target.vy) || 0);
      r.target._platformId = null;
      r.target._stunUntil = r.stunUntil;
      r.target._stunImmuneUntil = r.stunUntil + 1000;
      events.push({ type: "backflipStun", target: r.target });
    }
    if (dealt > 0 && hpBefore > 0 && r.target.hp <= 0 && !lethalAttackers.has(r.target)) {
      lethalAttackers.set(r.target, r.attacker);
    }
    if (absorbed > 0) events.push({ type: "shieldBlock", target: r.target, absorbed });
    // 빨강=복수: Vamp Shrimp가 '피격'당하면 다음 공격에 쓸 복수 버프를 예약한다.
    if (r.target.side === "vampire") r.target._revengePending = true;
    if (dealt > 0) events.push({ type: "hit", attacker: r.attacker, target: r.target, dmg: dealt });
  }

  const killed = [...new Set(hitRecords.map((r) => r.target))].filter((t) => !t.dead && t.hp <= 0);
  for (const t of killed) {
    t.hp = 0;
    const lethalAttacker = lethalAttackers.get(t) ?? null;
    const lethalVampire = lethalAttacker?.side === "vampire" ? lethalAttacker : null;
    const owner = t.side === "human"
      ? (lethalVampire ?? chooseZombieOwner(hitRecords, t))
      : null;
    const killer = lethalAttacker ?? owner ?? hitRecords.find((r) => r.target === t)?.attacker;
    if (killer) {
      grantExp(killer, expForKill(t.level), events);
      disengage(killer);
    }
    if (t.side === "human" && owner) {
      state.blood += KILL_BLOOD_REWARD;
      events.push({ type: "kill", target: t });
      const traitFromLastHit = lethalVampire === owner;
      const yellowRevive = traitFromLastHit && hasZombieTrait(owner, "zombie-yellow-revive");
      const redPoison = traitFromLastHit && hasZombieTrait(owner, "zombie-red-poison");
      infectToSlave(t, owner, { yellowRevive, redPoison });
      events.push({ type: "infect", char: t, owner });
    } else {
      if (reviveZombieOnce(t, events)) continue;
      explodeZombiePoison(t, state, events);
      t.dead = true;
      t.state = "DEAD";
      t._fightTargetId = null;
      resetSwing(t);
      if (t.side === "vampire") t._reviveCd = vampireReviveCooldown(t.level);
      events.push({ type: "kill", target: t });
    }
  }

  tickSlaveDecay(state, simDt, events);
  tickPoison(state, simDt, events);
  tickVampireAutoRevive(state, simDt, events);

  // Jombie/Holy Shrimp 시체는 제거 (Vamp Shrimp 시체는 부활 대상으로 보존)
  state.chars.items = state.chars.items.filter((c) => !c.dead || c.side === "vampire");
  return events;
}
