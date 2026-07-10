// src/constants.js
// 수조(전장)·캐릭터·전투·웨이브 상수

/** 수조 논리 해상도 (Shrimprium과 동일) */
export const TANK_W = 320;
export const TANK_H = 640;

/** 하단 상시 패널 영역 높이 — 논리 캔버스 전체 높이 = TANK_H + PANEL_H */
export const PANEL_H = 94;

/** 바닥(지면) Y 좌표 — 캐릭터 발이 닿는 선 */
export const FLOOR_Y = 624;

/** 기본 캐릭터 크기(px) — 스폰 좌표 계산 등에 사용 */
export const CHAR_SIZE = 32;

// ── 스폰 존 (2×2 플랫폼블록 크기의 하얀 네모, 여기서만 캐릭터가 스폰된다) ──
/** 스폰 존 한 변 길이(px) = 플랫폼블록 2칸(20×2) */
export const SPAWN_ZONE_SIZE = 40;
/** 존을 모서리에서 한 칸(20px) 안쪽으로 들여 UI/가장자리와 겹치지 않게 한다 */
const SPAWN_ZONE_INSET = 20;
/** 인간 스폰 존: 오른쪽 위에서 한 칸 안쪽(왼쪽·아래로 한 칸) */
export const HUMAN_SPAWN_ZONE = {
  x: TANK_W - SPAWN_ZONE_SIZE - SPAWN_ZONE_INSET, // 260
  y: SPAWN_ZONE_INSET,                            // 20
  w: SPAWN_ZONE_SIZE, h: SPAWN_ZONE_SIZE,
};
/** 뱀파이어 스폰 존: 왼쪽 아래에서 한 칸 안쪽(오른쪽·위로 한 칸) */
export const VAMPIRE_SPAWN_ZONE = {
  x: SPAWN_ZONE_INSET,                             // 20
  y: TANK_H - SPAWN_ZONE_SIZE - SPAWN_ZONE_INSET,  // 580
  w: SPAWN_ZONE_SIZE, h: SPAWN_ZONE_SIZE,
};

/** 베이스 코어 초기 수치 — 인간이 뱀파이어 스폰 존에 들어올 때마다 1씩 줄고, 0이면 게임오버 */
export const BASE_CORE_HP = 20;

/**
 * 스폰 존 안에서 캐릭터(size)의 좌상단 x를 무작위로 뽑는다.
 * 캐릭터가 존보다 넓으면 존 왼쪽에 붙여 클램프한다.
 * @param {{x:number, w:number}} zone
 * @param {number} size - 캐릭터 한 변(px)
 * @param {() => number} [rng]
 * @returns {number}
 */
export function spawnXInZone(zone, size, rng = Math.random) {
  const span = Math.max(0, zone.w - size);
  return zone.x + rng() * span;
}

/**
 * 진영별 스프라이트 설정. 어셋 교체 시 여기만 바꾸면 된다.
 * - size: 프레임 한 변(px). 캐릭터 논리 박스(w/h)도 이 값.
 * - frames: 걷기 프레임 수 (가로 스트립).
 * - topPad: 프레임 상단 투명 여백(px) — 세로 충돌은 이 여백을 제외한 "몸통"으로
 *   판정한다 (Shrimprium SHRIMP_SPRITE_TOP_PAD 방식).
 *
 * ★ 어셋 규격: 32×32에 그리되, 충돌 몸통(size - topPad)이 20px 이하가 되도록
 *   topPad ≥ 12를 유지할 것 — 그래야 1칸(20px) 통로를 위아래로 지나갈 수 있다.
 *   (가로는 getCharHitbox가 중앙 14px 몸통으로 자동 캡) 기본 방향은 왼쪽.
 */
export const CHAR_SPRITES = {
  vampire: { src: "assets/shrimp_variants/shrimp-4frame-cherry_red.png", size: 32, frames: 8, topPad: 18 },
  human:   { src: "assets/shrimp_variants/shrimp-4frame-blue_velvet.png", size: 32, frames: 8, topPad: 18 },
  // 인체형 좀비 더미 (tools/generate_zombie_dummy.py) — 몸통 하단 18px(y14~31), 폭 ≤20px
  slave:   { src: "assets/chars/zombie_walk.png", size: 32, frames: 8, topPad: 14 },
};

// ── 이동 물리 (Shrimprium 새우 물리 이식값) ──
export const CRAWL_SPD = 72;          // 걷기 속도 px/s
export const PX_GRAVITY = 300;        // 일반 낙하 중력
export const PX_GRAVITY_JUMP = 140;   // 점프 상승~하강 중력 (마지막 1/5 구간은 260)
export const PX_GRAVITY_JUMP_LAND = 260;
// 점프력을 이전(210/30) 대비 약 0.71배로 낮춰 점프가 오르는 높이를 절반으로 줄였다
// (도약 높이 ∝ 속도², 0.71² ≈ 0.5). 최하단 플랫폼(84px)에는 더 이상 점프로 닿지 않고
// 위·아래 이동은 뱀파이어 돌진(dash)이 담당한다.
export const JUMP_SPEED_MIN = 148;     // 도약 최소 속도 (이전 210의 ~0.71배)
export const JUMP_SPEED_SPAN = 21;
export const JUMP_MIN_DEG = 52;
export const JUMP_SPAN_DEG = 16;
export const STUN_DURATION_MS = 5000; // 스턴 블록 효과 지속
export const CONVEYOR_PUSH_SPD = 40;  // 컨베이어가 미는 속도 px/s
export const SLIDE_SPD = 70;          // 미끄럼 블록 슬라이드 속도 px/s
export const WARP_COOLDOWN_MS = 1000; // 블랙홀 워프 재사용 대기

// ── 감지 (인식 범위: 원 안에 적이 들어오면 인식하고 다가간다) ──
/** 진영별 감지 반경(px). 노예는 감지가 둔하다. (향후 성장 요소로 사용 예정) */
export const DETECT_RANGE = { vampire: 90, human: 120, slave: 55 };
/** 핑(추적 대상) 갱신 주기(초) — 비전투 유닛은 1초마다 가장 가까운 적을 다시 찍는다 */
export const PING_REFRESH_S = 1.0;

// ── 뱀파이어 패시브: 혈귀 돌진 ──
// 돌진은 중력을 무시한다. 감지 원 안에 들어온 적 중 플랫폼 블록을 피해 돌아가는
// BFS 최단 경로의 실제 길이가 감지범위×배율 이내인 가장 짧은 대상에게 돌진한다.
// 너무 돌아가야 하면(예산 초과) 발동하지 않고 기존 핑 추적/배회로 돌아간다.
export const DASH_ROUTE_MULT = 2;       // 기본 발동 조건: BFS 경로 길이 ≤ 감지범위 × 2 (향후 스킬로 확장)
export const DASH_RANGED_ROUTE_MULT = 2.5; // 원거리 피격 반격 기본 예산: 감지범위 × 2.5
export const DASH_RANGED_SKILL_MULT = 1.1; // 원거리 피격 반격 스킬 배율 틀(향후 1.2, 1.3... 성장)
export const DASH_SPD = 260;            // 돌진 속도 px/s
export const DASH_COOLDOWN_S = 2.0;     // 돌진 재사용 대기(초)
export const DASH_ARRIVE_DIST = 26;     // 이 거리까지 접근하면 돌진 종료(낙하 → 교전)
export const DASH_MAX_S = 1.5;          // 돌진 최대 지속(초) — 안전 타임아웃

// ── 전투 (교전형: 만나면 마주보고 멈춰서 싸운다) ──
export const ENGAGE_RANGE = 34;       // 교전 시작 거리 (중심 간 px)
export const FIGHT_BREAK_RANGE = 48;  // 이 거리보다 멀어지면 교전 해제
export const ENGAGE_MAX_DY = 26;      // 교전 가능한 최대 높이 차 (중심 기준)
export const ATTACK_COOLDOWN_S = 1.0; // 공격 주기(초)

// ── 인간 투사체(파란새우 원거리 공격) ──
export const HUMAN_PROJECTILE_RANGE = DETECT_RANGE.human; // 인식 범위 안에 들어온 적에게 투척
/** 원거리 공격 사거리(인식 범위) 안에 적이 들어오면 인간은 자세를 잡느라 이속이 1/4로 준다 */
export const HUMAN_RANGED_BRACE_SPEED_MULT = 0.25;
export const HUMAN_PROJECTILE_SPEED = 170;
export const HUMAN_PROJECTILE_COOLDOWN_S = 1.4;
export const HUMAN_PROJECTILE_DAMAGE = 4;
export const HUMAN_PROJECTILE_RADIUS = 4;
export const HUMAN_PROJECTILE_HIT_RADIUS = 16;
export const HUMAN_PROJECTILE_MAX_S = 2.0;

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
/** MP 초당 자연 재생 */
export const MP_REGEN_PER_S = 4;
/** 혈귀 돌진 MP 소모 — 부족해도 발동은 막지 않는다 (향후 스킬 코스트 훅) */
export const DASH_MP_COST = 10;

// ── 계정 성장 (신규): 웨이브 클리어로 계정 경험치 획득 ──
/** 계정 레벨업에 필요한 경험치 */
export function accountExpToNext(level) {
  return 80 * level;
}
/** 웨이브 N 클리어 시 계정 경험치 */
export function accountExpForWave(n) {
  return 10 + 4 * n;
}
/** 처치 시 획득 경험치 */
export function expForKill(victimLevel) {
  return 8 + 2 * victimLevel;
}
export const LEVELUP_HP_GAIN = 10;
export const LEVELUP_ATK_GAIN = 2;

/** 뱀파이어 초기 스탯 */
export const VAMPIRE_BASE = { maxHp: 60, atk: 8, maxMp: 40 };

/** 좀비(노예) 기본 스탯 — 향후 소유 뱀파이어 스킬트리로 보정 */
export const SLAVE_BASE = { maxHp: 5, hpDecayPerSecond: 1, maxMp: 10 };

/** 인간 기본 MP (직업 미분류 단계) */
export const HUMAN_BASE_MP = 20;

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
