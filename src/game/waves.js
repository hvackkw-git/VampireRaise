// src/game/waves.js
// 웨이브 진행: 인간 스폰 스케줄, 클리어/패배 판정, 자동 웨이브.

import {
  TANK_W, CHAR_SIZE,
  humanCountForWave, humanStatsForWave, waveReward,
  accountExpForWave, accountExpToNext,
  HUMAN_SPAWN_INTERVAL_S, AUTO_WAVE_DELAY_S,
} from "../constants.js";
import { createCharacter } from "../state/gameState.js";

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

/** 웨이브 시작: 인간 스폰 스케줄 등록 */
export function startWave(state) {
  const w = state.wave;
  if (w.active) return false;
  w.active = true;
  w.clock = 0;
  w.nextAutoAt = null;
  const n = w.current;
  const count = humanCountForWave(n);
  w.pendingSpawns = Array.from({ length: count }, (_, i) => ({
    spawnAt: i * HUMAN_SPAWN_INTERVAL_S,
  }));
  return true;
}

/** 죽은 뱀파이어 전원 부활 (풀피, 바닥에서 재시작) */
export function reviveVampires(state, rng = Math.random) {
  for (const c of state.chars.items) {
    if (c.side !== "vampire" || !c.dead) continue;
    c.dead = false;
    c.hp = c.maxHp;
    c.state = "FALL";
    c.x = rng() * (TANK_W - CHAR_SIZE);
    c.y = -CHAR_SIZE;
    c.vx = 0; c.vy = 0;
    c._platformId = null;
  }
}

/**
 * 웨이브 틱.
 * @returns {Array<object>} events — spawn/clear/defeat/autostart
 */
export function tickWaves(state, simDt, rng = Math.random) {
  const events = [];
  const w = state.wave;
  w.clock += simDt;

  if (w.active) {
    // 순차 스폰: 상단에서 낙하
    const stats = humanStatsForWave(w.current);
    while (w.pendingSpawns.length > 0 && w.clock >= w.pendingSpawns[0].spawnAt) {
      w.pendingSpawns.shift();
      const c = createCharacter(state, "human", {
        x: 10 + rng() * (TANK_W - CHAR_SIZE - 20),
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
    if (startWave(state)) events.push({ type: "autostart", wave: w.current });
  }

  return events;
}
