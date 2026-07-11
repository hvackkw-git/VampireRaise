// src/game/waves.js
// 웨이브 진행: Holy Shrimp 스폰 스케줄, 클리어/패배 판정, 자동 웨이브.

import {
  CHAR_SIZE, FLOOR_Y,
  humanCountForWave, humanStatsForWave, waveReward,
  accountExpForWave, accountExpToNext,
  HUMAN_SPAWN_INTERVAL_S, AUTO_WAVE_DELAY_S,
  HUMAN_SPAWN_ZONE, VAMPIRE_SPAWN_ZONE, spawnXInZone, BASE_CORE_HP,
  REBIRTH_MAX_VAMPIRES, rebirthWaveRequirement,
} from "../constants.js";
import { createCharacter } from "../state/gameState.js";
import { findHumanSpawnRoutes } from "./descentNavigation.js";

/** Vamp Shrimp 진영(Vamp Shrimp+Jombie Shrimp) 생존 수 */
export function vampireSideAlive(state) {
  return state.chars.items.filter(
    (c) => !c.dead && (c.side === "vampire" || c.side === "slave"),
  ).length;
}

export function humansAlive(state) {
  return state.chars.items.filter((c) => !c.dead && c.side === "human").length;
}

/** 계정 경험치 지급 + 계정 레벨업. 레벨업 시 events에 acctlevel 기록 */
export function grantAccountExp(state, amount, events = []) {
  const acct = state.account;
  if (!acct) return;
  acct.exp += amount;
  while (acct.exp >= accountExpToNext(acct.level)) {
    acct.exp -= accountExpToNext(acct.level);
    acct.level += 1;
    events.push({ type: "acctlevel", level: acct.level });
  }
}

/** Holy Shrimp 스폰 존(오른쪽 위) 안에 좌상단 x가 들어오는 하강 경로만 남긴다. */
function routesInHumanZone(routes) {
  const minX = HUMAN_SPAWN_ZONE.x;
  const maxX = HUMAN_SPAWN_ZONE.x + HUMAN_SPAWN_ZONE.w - CHAR_SIZE;
  return routes.filter((r) => r.x >= minX - 0.5 && r.x <= maxX + 0.5);
}

/** 웨이브 시작: Holy Shrimp 스폰 존에서 바닥까지 내려오는 경로가 있을 때만 Holy Shrimp를 배정한다. */
export function startWave(state, blockPowered = null) {
  const w = state.wave;
  if (w.active) {
    w.lastStartError = "active";
    return false;
  }
  const routes = routesInHumanZone(
    findHumanSpawnRoutes(state.platforms.items, blockPowered),
  );
  if (routes.length === 0) {
    w.lastStartError = "noPath";
    return false;
  }
  w.active = true;
  w.clock = 0;
  w.nextAutoAt = null;
  w.lastStartError = null;
  const n = w.current;
  const count = humanCountForWave(n);
  w.pendingSpawns = Array.from({ length: count }, (_, i) => ({
    spawnAt: i * HUMAN_SPAWN_INTERVAL_S,
    x: routes[Math.min(
      routes.length - 1,
      Math.floor(((i + 1) * routes.length) / (count + 1)),
    )].x,
  }));
  return true;
}

/** 죽은 Vamp Shrimp 전원 부활 (풀피, 왼쪽 아래 스폰 존 바닥에서 재시작) */
export function reviveVampires(state, rng = Math.random) {
  for (const c of state.chars.items) {
    if (c.side !== "vampire" || !c.dead) continue;
    c.dead = false;
    c.hp = c.maxHp;
    // 상단 낙하가 아니라 왼쪽 아래 스폰 존(바닥)에서 바로 걷기 시작
    c.state = "CRAWL";
    c.x = spawnXInZone(VAMPIRE_SPAWN_ZONE, c.w, rng);
    c.y = FLOOR_Y - c.h;
    c.vx = 0; c.vy = 0;
    c._platformId = null;
  }
}

/**
 * Vamp Shrimp 스폰 존(베이스)에 도달한 Holy Shrimp를 처리한다.
 * 존에 들어온 Holy Shrimp는 즉시 제거되고 코어(state.core.hp)가 1 줄어든다.
 * @returns {Array<object>} invade 이벤트 목록
 */
export function tickBaseInvasion(state) {
  const events = [];
  const zone = VAMPIRE_SPAWN_ZONE;
  const reached = (c) =>
    !c.dead && c.side === "human"
    && c.y + c.h >= FLOOR_Y - 2                 // 바닥에 서 있고
    && c.x + c.w / 2 <= zone.x + zone.w;        // 존의 오른쪽 끝까지 도달
  const survivors = [];
  for (const c of state.chars.items) {
    if (reached(c)) {
      state.core.hp = Math.max(0, state.core.hp - 1);
      events.push({ type: "invade", char: c, coreHp: state.core.hp });
    } else {
      survivors.push(c);
    }
  }
  if (events.length) state.chars.items = survivors;
  return events;
}

/** 게임오버(코어 소진): 웨이브 1로 리셋·Holy Shrimp 제거·코어 회복·Vamp Shrimp 부활 */
function triggerGameOver(state, rng) {
  state.chars.items = state.chars.items.filter((c) => c.side !== "human");
  const w = state.wave;
  w.active = false;
  w.pendingSpawns = [];
  w.current = 1;
  w.nextAutoAt = null;
  state.core.hp = state.core.max ?? BASE_CORE_HP;
  reviveVampires(state, rng);
}

/** 현재 Vamp Shrimp 마릿수 (생사 무관 — 죽은 개체도 재시작 시 부활한다) */
export function vampireCount(state) {
  return state.chars.items.filter((c) => c.side === "vampire").length;
}

/** 지금 재시작(웨이브 리셋 + Vamp Shrimp 1마리 증원)이 가능한가 */
export function canRebirth(state) {
  if (state.wave.active) return false;
  const count = vampireCount(state);
  if (count >= REBIRTH_MAX_VAMPIRES) return false;
  return state.wave.current >= rebirthWaveRequirement(count);
}

/**
 * 재시작: 레벨·스킬은 유지한 채 웨이브를 1로 되돌리고 Vamp Shrimp를 1마리 늘린다.
 * (새 Vamp Shrimp는 레벨 1부터 새로 성장한다)
 * @returns {boolean} 실행 여부
 */
export function rebirth(state, rng = Math.random) {
  if (!canRebirth(state)) return false;
  state.chars.items = state.chars.items.filter((c) => c.side !== "human");
  const w = state.wave;
  w.active = false;
  w.pendingSpawns = [];
  w.current = 1;
  w.clock = 0;
  w.nextAutoAt = null;
  w.lastStartError = null;
  state.core.hp = state.core.max ?? BASE_CORE_HP;
  reviveVampires(state, rng);
  createCharacter(state, "vampire");
  return true;
}

/**
 * 웨이브 틱.
 * @returns {Array<object>} events — spawn/invade/gameover/clear/defeat/autostart
 */
export function tickWaves(state, simDt, rng = Math.random, blockPowered = null) {
  const events = [];
  const w = state.wave;
  w.clock += simDt;

  if (w.active) {
    // 순차 스폰: 상단에서 낙하
    const stats = humanStatsForWave(w.current);
    while (w.pendingSpawns.length > 0 && w.clock >= w.pendingSpawns[0].spawnAt) {
      const spawn = w.pendingSpawns.shift();
      const c = createCharacter(state, "human", {
        x: spawn.x,
        y: -CHAR_SIZE,
        state: "FALL",
        level: stats.level,
        maxHp: stats.maxHp,
        atk: stats.atk,
      });
      events.push({ type: "spawn", char: c });
    }

    // 베이스 침입: Vamp Shrimp 존에 도달한 Holy Shrimp 처리 → 코어 감소
    events.push(...tickBaseInvasion(state));
    // 게임오버: 코어 소진 → 웨이브 1로 리셋, 코어 회복, Vamp Shrimp 부활
    if (state.core.hp <= 0) {
      triggerGameOver(state, rng);
      events.push({ type: "gameover" });
      return events;
    }

    // 패배: Vamp Shrimp 진영 전멸 → Holy Shrimp 제거, 웨이브 1로 리셋, Vamp Shrimp 부활
    if (vampireSideAlive(state) === 0) {
      state.chars.items = state.chars.items.filter((c) => c.side !== "human");
      w.active = false;
      w.pendingSpawns = [];
      w.current = 1;
      w.nextAutoAt = null;
      reviveVampires(state, rng);
      events.push({ type: "defeat" });
      return events;
    }

    // 클리어: 스폰 완료 + Holy Shrimp 전멸
    if (w.pendingSpawns.length === 0 && humansAlive(state) === 0) {
      const reward = waveReward(w.current);
      state.blood += reward;
      grantAccountExp(state, accountExpForWave(w.current), events);
      w.active = false;
      w.current += 1;
      reviveVampires(state, rng);
      events.push({ type: "clear", reward, nextWave: w.current });
      if (w.auto) w.nextAutoAt = w.clock + AUTO_WAVE_DELAY_S;
    }
  } else if (w.auto && w.nextAutoAt != null && w.clock >= w.nextAutoAt) {
    // 자동 웨이브
    if (startWave(state, blockPowered)) {
      events.push({ type: "autostart", wave: w.current });
    } else if (w.lastStartError === "noPath") {
      w.auto = false;
      w.nextAutoAt = null;
      events.push({ type: "routeblocked" });
    }
  }

  return events;
}
