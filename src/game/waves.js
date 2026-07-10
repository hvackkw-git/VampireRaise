// src/game/waves.js
// 웨이브 진행: 인간 스폰 스케줄, 클리어/패배 판정, 자동 웨이브.

import {
  CHAR_SIZE, FLOOR_Y,
  humanCountForWave, humanStatsForWave, waveReward,
  accountExpForWave, accountExpToNext,
  HUMAN_SPAWN_INTERVAL_S, AUTO_WAVE_DELAY_S,
  HUMAN_SPAWN_ZONE, VAMPIRE_SPAWN_ZONE, spawnXInZone,
} from "../constants.js";
import { createCharacter } from "../state/gameState.js";
import { findHumanSpawnRoutes } from "./descentNavigation.js";

/** 뱀파이어 진영(뱀파이어+노예) 생존 수 */
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

/** 인간 스폰 존(오른쪽 위) 안에 좌상단 x가 들어오는 하강 경로만 남긴다. */
function routesInHumanZone(routes) {
  const minX = HUMAN_SPAWN_ZONE.x;
  const maxX = HUMAN_SPAWN_ZONE.x + HUMAN_SPAWN_ZONE.w - CHAR_SIZE;
  return routes.filter((r) => r.x >= minX - 0.5 && r.x <= maxX + 0.5);
}

/** 웨이브 시작: 인간 스폰 존에서 바닥까지 내려오는 경로가 있을 때만 인간을 배정한다. */
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

/** 죽은 뱀파이어 전원 부활 (풀피, 왼쪽 아래 스폰 존 바닥에서 재시작) */
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
 * 웨이브 틱.
 * @returns {Array<object>} events — spawn/clear/defeat/autostart
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

    // 패배: 뱀파이어 진영 전멸 → 인간 제거, 웨이브 1로 리셋, 뱀파이어 부활
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

    // 클리어: 스폰 완료 + 인간 전멸
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
