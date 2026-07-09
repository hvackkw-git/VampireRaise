// src/constants.js
// 수조(전장)·캐릭터·전투·웨이브 상수

/** 수조 논리 해상도 (Shrimprium과 동일) */
export const TANK_W = 320;
export const TANK_H = 640;

/** 바닥(지면) Y 좌표 — 캐릭터 발이 닿는 선 */
export const FLOOR_Y = 624;

/** 캐릭터 표시 크기(px). 스프라이트 32×32 */
export const CHAR_SIZE = 32;
/** 걷기 스프라이트 시트 프레임 수 (shrimp-4frame: 32×32 × 8프레임) */
export const CHAR_SHEET_FRAMES = 8;

/** 진영별 임시 스프라이트 (Shrimprium 새우 재활용) */
export const CHAR_SPRITE = {
  vampire: "assets/shrimp_variants/shrimp-4frame-cherry_red.png",
  human:   "assets/shrimp_variants/shrimp-4frame-blue_velvet.png",
  slave:   "assets/shrimp_variants/shrimp-4frame-black_king.png",
};

// ── 이동 물리 (Shrimprium 새우 물리 이식값) ──
export const CRAWL_SPD = 72;          // 걷기 속도 px/s
export const PX_GRAVITY = 300;        // 일반 낙하 중력
export const PX_GRAVITY_JUMP = 140;   // 점프 상승~하강 중력 (마지막 1/5 구간은 260)
export const PX_GRAVITY_JUMP_LAND = 260;
export const STUN_DURATION_MS = 5000; // 스턴 블록 효과 지속
export const CONVEYOR_PUSH_SPD = 40;  // 컨베이어가 미는 속도 px/s
export const SLIDE_SPD = 70;          // 미끄럼 블록 슬라이드 속도 px/s
export const WARP_COOLDOWN_MS = 1000; // 블랙홀 워프 재사용 대기

// ── 전투 (교전형: 만나면 마주보고 멈춰서 싸운다) ──
export const ENGAGE_RANGE = 34;       // 교전 시작 거리 (중심 간 px)
export const FIGHT_BREAK_RANGE = 48;  // 이 거리보다 멀어지면 교전 해제
export const ENGAGE_MAX_DY = 26;      // 교전 가능한 최대 높이 차 (중심 기준)
export const ATTACK_COOLDOWN_S = 1.0; // 공격 주기(초)

/** 진영이 서로 적대적인지 */
export function isEnemySide(a, b) {
  const vampSide = (s) => s === "vampire" || s === "slave";
  return vampSide(a) !== vampSide(b);
}

// ── 성장 ──
/** 레벨업에 필요한 경험치 */
export function expToNext(level) {
  return 20 * level;
}
/** 처치 시 획득 경험치 */
export function expForKill(victimLevel) {
  return 8 + 2 * victimLevel;
}
export const LEVELUP_HP_GAIN = 10;
export const LEVELUP_ATK_GAIN = 2;

/** 뱀파이어 초기 스탯 */
export const VAMPIRE_BASE = { maxHp: 60, atk: 8 };

// ── 웨이브 ──
/** 웨이브 N의 인간 수 */
export function humanCountForWave(n) {
  return Math.min(12, 2 + Math.floor(n / 2));
}
/** 웨이브 N 인간 스탯 */
export function humanStatsForWave(n) {
  return {
    level: n,
    maxHp: Math.round(24 * Math.pow(1.15, n - 1)),
    atk: Math.round(4 * Math.pow(1.12, n - 1)),
  };
}
/** 웨이브 N 클리어 보상 (피) */
export function waveReward(n) {
  return 10 + 6 * n;
}
export const HUMAN_SPAWN_INTERVAL_S = 0.8; // 인간 순차 스폰 간격
export const AUTO_WAVE_DELAY_S = 3;        // 자동 웨이브 딜레이
export const KILL_BLOOD_REWARD = 2;        // 인간 처치당 피

/** 뱀파이어 소환 비용 (현재 뱀파이어 수 기준) */
export function summonCost(vampireCount) {
  return 50 + 75 * Math.max(0, vampireCount - 2);
}

export const INITIAL_VAMPIRE_COUNT = 2;
