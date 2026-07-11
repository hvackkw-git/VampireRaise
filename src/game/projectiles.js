// src/game/projectiles.js
// Holy Shrimp(파란새우) 원거리 투사체 공격.
// 현재는 비유도 단발 투척만 구현하고, 동시 발사 수/유도/피해/연사력은 캐릭터별
// projectileSkill 필드로 확장할 수 있게 훅을 둔다.

import {
  DETECT_RANGE, HUMAN_PROJECTILE_RANGE, HUMAN_PROJECTILE_SPEED,
  HUMAN_PROJECTILE_COOLDOWN_S, HUMAN_PROJECTILE_DAMAGE, HUMAN_PROJECTILE_HIT_RADIUS,
  HUMAN_PROJECTILE_MAX_S, TANK_W, TANK_H, isEnemySide,
} from "../constants.js";
import { aliveChars, findNearestEnemy } from "./combat.js";
import { requestRangedDash } from "./ai.js";
import { absorbWithShield } from "./dashEffects.js";

const centerOf = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

function projectileSkill(c) {
  return {
    count: 1,
    homing: false,
    damage: HUMAN_PROJECTILE_DAMAGE,
    cooldown: HUMAN_PROJECTILE_COOLDOWN_S,
    speed: HUMAN_PROJECTILE_SPEED,
    ...c.projectileSkill,
  };
}

function ensureProjectiles(state) {
  state.projectiles ??= { nextId: 1, items: [] };
  return state.projectiles;
}

function spawnProjectile(state, attacker, target, skill, spreadIndex = 0, spreadCount = 1) {
  const projectiles = ensureProjectiles(state);
  const from = centerOf(attacker);
  const to = centerOf(target);
  const baseAngle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = (spreadIndex - (spreadCount - 1) / 2) * 0.14;
  const angle = baseAngle + spread;
  projectiles.items.push({
    id: projectiles.nextId++,
    side: attacker.side,
    attackerId: attacker.id,
    targetId: target.id,
    x: from.x,
    y: from.y,
    vx: Math.cos(angle) * skill.speed,
    vy: Math.sin(angle) * skill.speed,
    damage: skill.damage,
    homing: !!skill.homing,
    ttl: HUMAN_PROJECTILE_MAX_S,
  });
}

export function tickHumanProjectiles(state, simDt) {
  const events = [];
  const projectiles = ensureProjectiles(state);
  const chars = aliveChars(state);
  const byId = new Map(chars.map((c) => [c.id, c]));

  // 발사: Holy Shrimp는 인식 범위 안 최근접 적에게 쿨다운마다 투사체를 던진다.
  for (const c of chars) {
    if (c.side !== "human" || c.dead || c.state === "FIGHT") continue;
    c._projectileCd = Math.max(0, (c._projectileCd ?? 0) - simDt);
    if (c._projectileCd > 0) continue;
    const found = findNearestEnemy(c, chars);
    const range = c.projectileSkill?.range ?? HUMAN_PROJECTILE_RANGE ?? DETECT_RANGE.human;
    if (!found || found.dist > range) continue;
    const skill = projectileSkill(c);
    const count = Math.max(1, Math.floor(skill.count));
    for (let i = 0; i < count; i++) spawnProjectile(state, c, found.char, skill, i, count);
    c._projectileCd = skill.cooldown;
    c.dir = found.char.x + found.char.w / 2 >= c.x + c.w / 2 ? 1 : -1;
    events.push({ type: "projectileFire", attacker: c, target: found.char });
  }

  const kept = [];
  for (const p of projectiles.items) {
    p.ttl -= simDt;
    if (p.ttl <= 0) continue;
    const target = byId.get(p.targetId);
    if (p.homing && target && !target.dead) {
      const tc = centerOf(target);
      const d = Math.hypot(tc.x - p.x, tc.y - p.y);
      if (d > 0.001) {
        const speed = Math.hypot(p.vx, p.vy) || HUMAN_PROJECTILE_SPEED;
        p.vx = ((tc.x - p.x) / d) * speed;
        p.vy = ((tc.y - p.y) / d) * speed;
      }
    }
    p.x += p.vx * simDt;
    p.y += p.vy * simDt;
    if (p.x < -20 || p.x > TANK_W + 20 || p.y < -20 || p.y > TANK_H + 20) continue;

    let hit = null;
    for (const c of chars) {
      if (c.dead || !isEnemySide(p.side, c.side)) continue;
      const cc = centerOf(c);
      if (Math.hypot(cc.x - p.x, cc.y - p.y) <= HUMAN_PROJECTILE_HIT_RADIUS) { hit = c; break; }
    }
    if (!hit) { kept.push(p); continue; }
    // 보라=실드: 원거리 피해도 실드가 먼저 흡수한다.
    const { dealt, absorbed } = absorbWithShield(hit, p.damage);
    hit.hp -= dealt;
    const attacker = byId.get(p.attackerId) ?? null;
    // 빨강=복수: 원거리 피격도 '피격'이므로 복수 버프를 예약한다.
    if (hit.side === "vampire") hit._revengePending = true;
    if (hit.side === "vampire" && attacker) requestRangedDash(hit, attacker.id);
    if (absorbed > 0) events.push({ type: "shieldBlock", target: hit, absorbed });
    if (dealt > 0) events.push({ type: "projectileHit", attacker, target: hit, dmg: dealt });
    if (hit.hp <= 0) {
      hit.hp = 0;
      hit.dead = true;
      hit.state = "DEAD";
      hit._fightTargetId = null;
      events.push({ type: "kill", target: hit, projectile: true });
    }
  }
  projectiles.items = kept;
  return events;
}
