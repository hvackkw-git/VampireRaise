// src/state/gameState.js
// 게임 상태 생성·저장·복원 (localStorage)

import {
  TANK_W, FLOOR_Y, CHAR_SIZE, CHAR_SPRITES, VAMPIRE_BASE, SLAVE_BASE, HUMAN_BASE_MP,
  INITIAL_VAMPIRE_COUNT, VAMPIRE_SPAWN_ZONE, spawnXInZone, BASE_CORE_HP,
} from "../constants.js";
import { defaultDashColors, DEFAULT_DASH_POINTS } from "../skills/dashColors.js";

export const SAVE_KEY = "vampireraise.save.v1";

/** 캐릭터 레코드 생성 */
function nextVampireOrder(state) {
  const orders = state.chars.items
    .filter((c) => c.side === "vampire")
    .map((c) => Number(c.vampireOrder) || 0);
  return (orders.length ? Math.max(...orders) : 0) + 1;
}

function normalizeZombieTrait(value) {
  if (value === "zombie-rili-revive") return "zombie-yellow-revive";
  if (value === "zombie-yellow-poison") return "zombie-red-poison";
  return typeof value === "string" ? value : null;
}

function normalizeZombiePattern(value) {
  if (value === "RILI_RED") return "RILI_YELLOW";
  return typeof value === "string" ? value : null;
}

export function createCharacter(state, side, opts = {}) {
  const id = state.chars.nextId++;
  const size = CHAR_SPRITES[side]?.size ?? CHAR_SIZE;
  const baseStats = side === "slave" ? SLAVE_BASE : VAMPIRE_BASE;
  // Vamp Shrimp는 왼쪽 아래 스폰 존(바닥)에서만 스폰. 그 외(Jombie Shrimp 등)는 기존 무작위 위치.
  const defaultX = side === "vampire"
    ? spawnXInZone(VAMPIRE_SPAWN_ZONE, size)
    : Math.random() * (TANK_W - size);
  const c = {
    id,
    side,                       // 'vampire' | 'human' | 'slave'
    x: opts.x ?? defaultX,
    y: opts.y ?? FLOOR_Y - size,
    w: size, h: size,
    vx: 0, vy: 0,
    dir: Math.random() < 0.5 ? -1 : 1,
    state: opts.state ?? "CRAWL",
    timer: Math.random() * 2,
    _platformId: null,
    _stunUntil: 0,
    _stunImmuneUntil: 0,
    _spikeIgnoreUntil: 0,
    _warpCooldownUntil: 0,
    _blockBounces: 0,
    _blockBounceDecay: 0,
    _fightTargetId: null,       // 교전 대상 (FIGHT 상태)
    _ping: null,                // 추적 핑 { targetId } — 1초마다 갱신
    _pingCd: Math.random(),     // 핑 갱신 시차 분산
    _dashTargetId: null,        // 혈귀 돌진 대상 (Vamp Shrimp 패시브)
    _dashTimeLeft: 0,
    _dashCd: 0,
    _atkCd: Math.random(),      // 첫 공격 타이밍 분산
    _projectileCd: Math.random(), // Holy Shrimp 투사체 첫 발사 타이밍 분산
    // ── 성장 ──
    level: opts.level ?? 1,
    exp: 0,
    maxHp: opts.maxHp ?? baseStats.maxHp,
    hp: opts.hp ?? opts.maxHp ?? baseStats.maxHp,
    maxMp: opts.maxMp ?? baseStats.maxMp ?? HUMAN_BASE_MP,
    mp: opts.mp ?? opts.maxMp ?? baseStats.maxMp ?? HUMAN_BASE_MP,
    atk: opts.atk ?? baseStats.atk,
    job: null,                  // 향후 직업 분류
    skills: side === "vampire" ? ["dash"] : [], // 장착 스킬 (v1: Vamp Shrimp 혈귀 돌진)
    skillPoints: side === "vampire"
      ? Math.max(0, Number(opts.skillPoints ?? ((opts.level ?? 1) - 1)) || 0)
      : 0,
    learnedSkills: side === "vampire" && Array.isArray(opts.learnedSkills)
      ? [...opts.learnedSkills]
      : [],
    // 돌진 잔상 색상 포인트(빨주노초파보하). 기본은 복수(빨강) 1포인트 → 처음엔 전부 빨강
    dashColors: side === "vampire"
      ? (opts.dashColors && typeof opts.dashColors === "object"
          ? { ...opts.dashColors }
          : defaultDashColors())
      : null,
    // 색상 투자용 포인트 풀 — 레벨 제한 없이 듬뿍(자유 배분·재배분). 스킬트리 SP와는 별개.
    dashPoints: side === "vampire"
      ? Math.max(0, Number(opts.dashPoints ?? DEFAULT_DASH_POINTS) || 0)
      : 0,
    // 인식범위 스킬 포인트 — 위 풀에서 투자. 포인트당 인식 범위 ×1.1씩 실제로 커진다.
    detectPoints: side === "vampire" ? Math.max(0, Number(opts.detectPoints ?? 0) || 0) : 0,
    // 대쉬 숙련 포인트 — 위 풀에서 투자. 포인트당 돌진 쿨타임·마나소모 -10%씩.
    dashCdManaPoints: side === "vampire" ? Math.max(0, Number(opts.dashCdManaPoints ?? 0) || 0) : 0,
    // Jombie Shrimp 체력 스킬 — 소유 Jombie Shrimp의 최대 체력에 포인트당 +1.
    zombieHpPoints: side === "vampire" ? Math.max(0, Math.floor(Number(opts.zombieHpPoints) || 0)) : 0,
    zombieTrait: side === "vampire" ? normalizeZombieTrait(opts.zombieTrait) : null,
    zombiePattern: side === "slave" ? normalizeZombiePattern(opts.zombiePattern) : null,
    zombieRevivesLeft: side === "slave" ? Math.max(0, Math.floor(Number(opts.zombieRevivesLeft) || 0)) : 0,
    poisonStacks: Math.max(0, Math.min(5, Math.floor(Number(opts.poisonStacks) || 0))),
    _poisonClock: 0,
    projectileSkill: opts.projectileSkill ?? null, // Holy Shrimp 투사체 성장 훅(count/homing/damage/cooldown/range/speed)
    ownerVampireId: opts.ownerVampireId ?? null, // Jombie Shrimp 소유 Vamp Shrimp id
    vampireOrder: side === "vampire" ? (opts.vampireOrder ?? nextVampireOrder(state)) : null,
    dead: false,
  };
  state.chars.items.push(c);
  return c;
}

/** 새 게임 초기 상태 */
export function createInitialState() {
  const state = {
    version: 1,
    blood: 0,
    account: { level: 1, exp: 0 }, // 계정 성장 (웨이브 클리어로 경험치 획득)
    core: { hp: BASE_CORE_HP, max: BASE_CORE_HP }, // 베이스 코어: Holy Shrimp가 Vamp Shrimp 존에 들어오면 감소, 0이면 게임오버
    wave: {
      current: 1,
      active: false,
      auto: false,
      pendingSpawns: [],  // [{ spawnAt(초, waveClock) }]
      clock: 0,           // 웨이브 경과 시계(초) — 스폰 스케줄용
      nextAutoAt: null,   // 자동 웨이브 예약 시각(clock 기준)
      lastStartError: null,
    },
    prestige: { count: 0 }, // 향후 프리스티지 훅
    platforms: { nextId: 1, items: [] },
    chars: { nextId: 1, items: [] },
    projectiles: { nextId: 1, items: [] },
  };
  for (let i = 0; i < INITIAL_VAMPIRE_COUNT; i++) createCharacter(state, "vampire");
  return state;
}

/** 저장 대상만 추린 직렬화 (일시적 _필드 제외) */
export function serialize(state) {
  return JSON.stringify({
    version: state.version,
    blood: state.blood,
    account: state.account,
    core: state.core,
    wave: {
      current: state.wave.current,
      auto: state.wave.auto,
      // 진행 중 웨이브는 저장하지 않음 — 복원 시 비전투 상태로 시작
    },
    prestige: state.prestige,
    platforms: state.platforms,
    chars: {
      nextId: state.chars.nextId,
      items: state.chars.items
        .filter((c) => c.side !== "human") // Holy Shrimp는 웨이브 소속 — 저장 안 함
        .map((c) => ({
          id: c.id, side: c.side, x: c.x, y: c.y, dir: c.dir,
          level: c.level, exp: c.exp, maxHp: c.maxHp, hp: c.hp,
          maxMp: c.maxMp, mp: c.mp, atk: c.atk,
          ownerVampireId: c.ownerVampireId, vampireOrder: c.vampireOrder,
          job: c.job, skills: c.skills,
          skillPoints: c.skillPoints, learnedSkills: c.learnedSkills,
          dashColors: c.dashColors, dashPoints: c.dashPoints, detectPoints: c.detectPoints,
          dashCdManaPoints: c.dashCdManaPoints,
          zombieHpPoints: c.zombieHpPoints,
          zombieTrait: c.zombieTrait,
          zombiePattern: c.zombiePattern,
          zombieRevivesLeft: c.zombieRevivesLeft,
          dead: c.dead,
        })),
    },
  });
}

/** 처음부터 재시작: 저장 삭제 + 상태를 초기값으로 제자리 교체 (참조 유지) */
export function resetState(state, storage = globalThis.localStorage) {
  try { storage?.removeItem(SAVE_KEY); } catch { /* 무시 */ }
  const fresh = createInitialState();
  state.blood = fresh.blood;
  state.account = fresh.account;
  state.core = fresh.core;
  state.wave = fresh.wave;
  state.prestige = fresh.prestige;
  state.platforms = fresh.platforms;
  state.chars = fresh.chars;
}

export function saveState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(SAVE_KEY, serialize(state)); } catch { /* 저장 실패 무시 */ }
}

/** 저장본 → 상태 복원. 저장본이 없거나 손상 시 null */
export function loadState(storage = globalThis.localStorage) {
  let raw = null;
  try { raw = storage?.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || data.version !== 1) return null;

  const state = createInitialState();
  state.chars.items = [];
  state.blood = Number(data.blood) || 0;
  state.account = {
    level: Math.max(1, Number(data.account?.level) || 1),
    exp: Math.max(0, Number(data.account?.exp) || 0),
  };
  const coreMax = Math.max(1, Number(data.core?.max) || BASE_CORE_HP);
  state.core = {
    max: coreMax,
    hp: Math.max(0, Math.min(coreMax, Number(data.core?.hp ?? coreMax))),
  };
  state.wave.current = Math.max(1, Number(data.wave?.current) || 1);
  state.wave.auto = !!data.wave?.auto;
  state.prestige = data.prestige ?? { count: 0 };
  if (data.platforms?.items) {
    state.platforms.nextId = Number(data.platforms.nextId) || 1;
    state.platforms.items = data.platforms.items;
  }
  state.chars.nextId = Number(data.chars?.nextId) || 1;
  for (const rec of data.chars?.items ?? []) {
    const c = createCharacter(state, rec.side, {
      x: rec.x, y: rec.y, level: rec.level,
      maxHp: rec.maxHp, hp: rec.hp, atk: rec.atk,
      maxMp: rec.maxMp, mp: rec.mp,
      ownerVampireId: rec.ownerVampireId, vampireOrder: rec.vampireOrder,
      skillPoints: rec.skillPoints ?? Math.max(0, (Number(rec.level) || 1) - 1),
      learnedSkills: rec.learnedSkills,
      dashColors: rec.dashColors,
      dashPoints: rec.dashPoints,
      detectPoints: rec.detectPoints,
      dashCdManaPoints: rec.dashCdManaPoints,
      zombieHpPoints: rec.zombieHpPoints,
      zombieTrait: rec.zombieTrait,
      zombiePattern: rec.zombiePattern,
      zombieRevivesLeft: rec.zombieRevivesLeft,
    });
    c.id = rec.id;
    c.dir = rec.dir === -1 ? -1 : 1;
    c.exp = Number(rec.exp) || 0;
    c.job = rec.job ?? null;
    // 구버전 저장본은 skills가 빈 배열 — createCharacter의 기본 장착(dash)을 유지
    if (Array.isArray(rec.skills) && rec.skills.length) c.skills = rec.skills;
    c.skillPoints = Math.max(0, Number(rec.skillPoints ?? c.skillPoints) || 0);
    c.learnedSkills = Array.isArray(rec.learnedSkills) ? [...rec.learnedSkills] : [];
    c.dead = !!rec.dead;
  }
  // createCharacter가 nextId를 증가시키므로 저장본 값으로 재고정
  state.chars.nextId = Math.max(
    Number(data.chars?.nextId) || 1,
    ...state.chars.items.map((c) => c.id + 1),
  );
  return state;
}
