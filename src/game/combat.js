// src/game/combat.js
// 교전형 전투·전염·경험치.
// 적끼리 우연히 만나(근접 + 비슷한 높이 + 지상 상태) 마주치면 서로 마주보고 멈춰서(FIGHT)
// 공격 쿨다운마다 타격을 주고받는다. 대상이 죽거나 멀어지면 교전이 풀린다.

import {
  ENGAGE_RANGE, FIGHT_BREAK_RANGE, ENGAGE_MAX_DY, ATTACK_COOLDOWN_S, isEnemySide,
  expToNext, expForKill, LEVELUP_HP_GAIN, LEVELUP_ATK_GAIN, KILL_BLOOD_REWARD,
  CHAR_SPRITES,
} from "../constants.js";

const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
const dist = (a, b) => {
  const ac = center(a), bc = center(b);
  return Math.hypot(bc.x - ac.x, bc.y - ac.y);
};
const dy = (a, b) => Math.abs((a.y + a.h / 2) - (b.y + b.h / 2));

/** 교전을 시작할 수 있는(지상에 서 있는) 상태 */
const GROUND_STATES = new Set(["IDLE", "CRAWL", "STAY", "FIGHT"]);

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
    c.maxHp += LEVELUP_HP_GAIN;
    c.atk += LEVELUP_ATK_GAIN;
    c.hp = c.maxHp;
    events?.push({ type: "levelup", char: c });
  }
}

/** 인간 → 노예 전염 (스프라이트 크기가 다르면 발 위치를 유지하며 박스 교체) */
export function infectToSlave(c) {
  c.side = "slave";
  const size = CHAR_SPRITES.slave?.size ?? c.h;
  c.y += c.h - size; // 발(y+h) 고정
  c.w = size;
  c.h = size;
  c.hp = c.maxHp;
  c.dead = false;
  c.state = "IDLE";
  c.timer = 0.5;
  c.vx = 0; c.vy = 0;
  c._fightTargetId = null;
  c._ping = null;
}

/** 교전 진입: 멈춰서 대상을 마주본다 (핑 추적 종료) */
function engage(c, target) {
  c.state = "FIGHT";
  c._fightTargetId = target.id;
  c._ping = null;
  c.vx = 0;
  c.dir = target.x + target.w / 2 >= c.x + c.w / 2 ? 1 : -1;
}

/** 교전 해제 → 잠시 후 배회 복귀 */
function disengage(c) {
  if (c.state === "FIGHT") { c.state = "IDLE"; c.timer = 0.3; }
  c._fightTargetId = null;
}

/**
 * 전투 틱.
 * 1) 교전 시작: 지상 상태의 적이 ENGAGE_RANGE 안에 오면 양쪽 모두 FIGHT로 마주본다.
 * 2) 교전 유지: 대상이 죽거나 FIGHT_BREAK_RANGE 밖으로 벗어나면 해제.
 *    유지 중에는 쿨다운마다 공격.
 * 3) 처치: 인간이 뱀파이어 진영에게 죽으면 그 자리에서 노예로 전염.
 *    뱀파이어는 dead 마크(부활 대상), 노예는 제거.
 * @returns {Array<object>} events — engage/hit/kill/infect/levelup (연출·보상용)
 */
export function tickCombat(state, simDt) {
  const events = [];
  const chars = aliveChars(state);
  const byId = new Map(chars.map((c) => [c.id, c]));

  // 쿨다운은 항상 진행
  for (const c of chars) c._atkCd -= simDt;

  // 1) 교전 시작
  for (const c of chars) {
    if (c.dead || c.state === "FIGHT" || !GROUND_STATES.has(c.state)) continue;
    const found = findNearestEnemy(c, chars);
    if (!found || found.dist > ENGAGE_RANGE) continue;
    const t = found.char;
    if (!GROUND_STATES.has(t.state)) continue;
    if (dy(c, t) > ENGAGE_MAX_DY) continue;
    engage(c, t);
    if (t.state !== "FIGHT") engage(t, c); // 상대도 하던 일을 멈추고 맞선다
    events.push({ type: "engage", a: c, b: t });
  }

  // 2) 교전 유지·공격
  for (const c of chars) {
    if (c.dead || c.state !== "FIGHT") continue;
    const t = byId.get(c._fightTargetId);
    const valid = t && !t.dead && isEnemySide(c.side, t.side)
      && dist(c, t) <= FIGHT_BREAK_RANGE && dy(c, t) <= ENGAGE_MAX_DY + 8;
    if (!valid) { disengage(c); continue; }
    // 항상 대상을 마주본다
    c.dir = t.x + t.w / 2 >= c.x + c.w / 2 ? 1 : -1;
    if (c._atkCd > 0) continue;
    c._atkCd = ATTACK_COOLDOWN_S;
    t.hp -= c.atk;
    events.push({ type: "hit", attacker: c, target: t, dmg: c.atk });
    if (t.hp > 0) continue;

    // ── 처치 ──
    t.hp = 0;
    grantExp(c, expForKill(t.level), events);
    disengage(c);
    if (t.side === "human") {
      state.blood += KILL_BLOOD_REWARD;
      events.push({ type: "kill", target: t });
      infectToSlave(t);
      events.push({ type: "infect", char: t });
    } else {
      t.dead = true;
      t.state = "DEAD";
      t._fightTargetId = null;
      events.push({ type: "kill", target: t });
    }
  }

  // 노예/인간 시체는 제거 (뱀파이어 시체는 부활 대상으로 보존)
  state.chars.items = state.chars.items.filter((c) => !c.dead || c.side === "vampire");
  return events;
}
