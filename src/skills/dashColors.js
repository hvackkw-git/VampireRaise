// 혈귀 돌진(Dash) 잔상 색상 로직.
// 스킬포인트 비율에 따라 잔상 색이 바뀐다. 팔레트 순서는 무지개 순(빨→주→노→초→파→보→하).
// 잔상 개수는 "빨강+주황" 포인트와 "인식 범위"로 결정한다(설계 노트 + 후속 확장).
// 순수 함수만 두어 테스트하기 쉽게 한다(뷰/상태 의존 없음).

import { DETECT_RANGE, DASH_ROUTE_MULT } from "../constants.js";

/** 잔상 개수 스케일 기준이 되는 뱀파이어 기본 인식 범위 */
export const BASE_DETECT_RANGE = DETECT_RANGE.vampire;

/**
 * 인식범위 스킬 배율 — 포인트당 +0.1 (0p=×1.0, 1p=×1.1, 2p=×1.2 …).
 * @param {number} detectPoints
 */
export function detectRangeMult(detectPoints = 0) {
  return 1 + 0.1 * Math.max(0, Number(detectPoints) || 0);
}

/**
 * 캐릭터의 실효 인식 범위(px). 뱀파이어는 인식범위 스킬(detectPoints)로 실제로 커진다.
 * c.detectRange를 직접 지정하면 그 값을 우선한다(테스트·특수 케이스용).
 */
export function effectiveDetectRange(char) {
  if (Number.isFinite(char?.detectRange)) return char.detectRange;
  const base = DETECT_RANGE[char?.side] ?? BASE_DETECT_RANGE;
  const pts = char?.side === "vampire" ? (char?.detectPoints || 0) : 0;
  return base * detectRangeMult(pts);
}
//
// ── Dash 색상 스킬 효과 카탈로그 (설계 노트 IMG_7727) ──
//   [O]=구현됨, [ ]=미구현(훅 자리에 TODO 주석).
//   ┌───┬──────┬─────────────────────┬──────────────────────┬───────────────┐
//   │구현│ 색   │ 효과                │ 계산(포인트별)       │ 위치           │
//   ├───┼──────┼─────────────────────┼──────────────────────┼───────────────┤
//   │ O │ 빨강 │ 복수(피격 시 공격력)│ ×1.0 → 1.1 → 1.2     │ combat 피격    │
//   │ O │ 주황 │ 거리(돌진 사거리)   │ ×2 → 2.1 → 2.2       │ ai 돌진 예산   │
//   │ O │ 노랑 │ 경로상 적 데미지    │ dmg×0.1 → 0.2        │ dashEffects/틱 │
//   │ O │ 초록 │ 연타 확률           │ 0% → 10% → 20%       │ combat 공격 롤 │
//   │ O │ 파랑 │ 도착 후 폭발        │ dmg×0.1 → 0.2        │ dashEffects/도착│
//   │ O │ 보라 │ 도착 후 실드(5초)   │ Hp×0.1 → 0.2         │ dashEffects/도착│
//   │ O │ 하양 │ 도착 후 스턴(인간)  │ 1초 → 2초            │ dashEffects/도착│
//   └───┴──────┴─────────────────────┴──────────────────────┴───────────────┘
//   헬퍼: revenge/dashDistance/pathDamage/multiHit/explosionDamage/shieldHp/stunSeconds Mult.
//   포인트 출처: 현재는 char.dashColors 맵(독립). 향후 스킬트리 노드 습득 → dashColors 반영 배선 필요.
//   ─ 색 외 스킬 ─ 인식범위(detectPoints): 포인트당 ×1.1 → detectRangeMult()/effectiveDetectRange().
//     실제 감지·돌진 예산·잔상 개수·감지 원 시각에 모두 반영된다.
//   ─ 대쉬 숙련(dashCdManaPoints): 포인트당 -10% → dashCdManaMult(). 돌진 쿨타임·마나소모에 반영된다(ai.js beginDash/endDash).

/** 팔레트 순서 — 잔상 정렬·무지개 기준 */
export const DASH_COLORS = Object.freeze([
  "red", "orange", "yellow", "green", "blue", "purple", "white",
]);

/** 잔상에 칠할 색(캐릭터 실루엣 채움색) */
export const DASH_COLOR_HEX = Object.freeze({
  red: "#ff4d5e",
  orange: "#ff9a3c",
  yellow: "#ffe14d",
  green: "#5ad860",
  blue: "#4d9fff",
  purple: "#b060e0",
  white: "#f2f2f2",
});

/** 뱀파이어 기본 색상 포인트 — 복수(빨강) 1포인트가 기본 적용 → 처음엔 전부 빨강 */
export function defaultDashColors() {
  return { red: 1 };
}

/** 색상 투자용 기본 포인트 풀 — 레벨 제한 없이 듬뿍(자유 배분·재배분 실험용) */
export const DEFAULT_DASH_POINTS = 30;

/** 색상 키가 유효한지 */
export function isDashColor(color) {
  return DASH_COLORS.includes(color);
}

/** 뱀파이어의 색상 포인트 상태를 안전한 값으로 정규화 */
export function normalizeDashPoints(char) {
  if (!char) return char;
  if (!char.dashColors || typeof char.dashColors !== "object") char.dashColors = defaultDashColors();
  for (const k of Object.keys(char.dashColors)) {
    if (!isDashColor(k) || !(char.dashColors[k] > 0)) delete char.dashColors[k];
    else char.dashColors[k] = Math.floor(char.dashColors[k]);
  }
  if (!Number.isFinite(char.dashPoints)) char.dashPoints = DEFAULT_DASH_POINTS;
  char.dashPoints = Math.max(0, Math.floor(char.dashPoints));
  if (!Number.isFinite(char.detectPoints)) char.detectPoints = 0;
  char.detectPoints = Math.max(0, Math.floor(char.detectPoints));
  if (!Number.isFinite(char.dashCdManaPoints)) char.dashCdManaPoints = 0;
  char.dashCdManaPoints = Math.max(0, Math.floor(char.dashCdManaPoints));
  return char;
}

/**
 * 인식범위에 1포인트 투자. 색상과 같은 풀(dashPoints)을 쓰며 레벨 제한 없음.
 * @returns {boolean} 성공 여부
 */
export function investDetect(char) {
  if (!char) return false;
  normalizeDashPoints(char);
  if (char.dashPoints <= 0) return false;
  char.dashPoints -= 1;
  char.detectPoints += 1;
  return true;
}

/**
 * 대쉬 숙련 배율 — 포인트당 -10% (0p=×1.0, 1p=×0.9, 2p=×0.8 …), 최대 90% 감소.
 * 돌진 쿨타임·마나소모 모두 이 배율을 곱해 적용한다.
 * @param {number} points
 */
export function dashCdManaMult(points = 0) {
  return Math.max(0.1, 1 - 0.1 * Math.max(0, Number(points) || 0));
}

/**
 * 대쉬 숙련(쿨타임·마나소모 감소)에 1포인트 투자. 같은 풀(dashPoints)을 쓰며 레벨 제한 없음.
 * @returns {boolean} 성공 여부
 */
export function investDashCdMana(char) {
  if (!char) return false;
  normalizeDashPoints(char);
  if (char.dashPoints <= 0) return false;
  char.dashPoints -= 1;
  char.dashCdManaPoints += 1;
  return true;
}

/**
 * 색상에 1포인트 투자. 레벨 제한 없음 — 풀(dashPoints)만 있으면 가능.
 * @returns {boolean} 성공 여부
 */
export function investDashColor(char, color) {
  if (!char || !isDashColor(color)) return false;
  normalizeDashPoints(char);
  if (char.dashPoints <= 0) return false;
  char.dashPoints -= 1;
  char.dashColors[color] = (char.dashColors[color] || 0) + 1;
  return true;
}

/**
 * 투자한 색상·인식범위 포인트를 모두 풀로 되돌리고 배분을 비운다(자유 재배분).
 * @returns {number} 되돌린 포인트 수
 */
export function resetDashColors(char) {
  if (!char) return 0;
  normalizeDashPoints(char);
  const refunded = Object.values(char.dashColors).reduce((a, b) => a + b, 0)
    + char.detectPoints + char.dashCdManaPoints;
  char.dashPoints += refunded;
  char.dashColors = {};
  char.detectPoints = 0;
  char.dashCdManaPoints = 0;
  return refunded;
}

// ── 잔상 개수 하드코딩(빨강+주황 포인트 기준) ──
const GHOST_BASE = 6;        // 빨강 1(기본)일 때 기본 개수
const GHOST_PER_RED = 2;     // 빨강 추가 포인트당
const GHOST_PER_ORANGE = 3;  // 주황(거리) 포인트당 — 거리가 늘어 잔상이 더 길게 남는다
const GHOST_MIN = 3;
const GHOST_MAX = 18;

/**
 * 잔상 개수 = (빨강+주황 포인트 하드코딩) × (인식 범위 비율).
 * 인식 범위가 커질수록(향후 성장) 돌진 사거리가 늘어 잔상도 더 길게 남는다.
 * @param {{[color:string]: number}} points 색상별 투자 포인트
 * @param {number} [detectRange] 실효 인식 범위(기본 = 뱀파이어 기본값)
 * @returns {number}
 */
export function dashGhostCount(points = {}, detectRange = BASE_DETECT_RANGE) {
  const red = Math.max(0, Number(points.red) || 0);
  const orange = Math.max(0, Number(points.orange) || 0);
  const byPoints = GHOST_BASE + GHOST_PER_RED * Math.max(0, red - 1) + GHOST_PER_ORANGE * orange;
  const scale = detectRange > 0 ? detectRange / BASE_DETECT_RANGE : 1;
  return Math.max(GHOST_MIN, Math.min(GHOST_MAX, Math.round(byPoints * scale)));
}

// ── 실제 스킬 효과 계산(설계 노트 IMG_7727) ──
/**
 * 빨강 · 복수: 피격 후 다음 공격력 배율. 기본 1포인트는 ×1.0(효과 없음),
 * 이후 포인트당 +0.1 (1.0 → 1.1 → 1.2 …).
 */
export function revengeAttackMult(points = {}) {
  return 1 + 0.1 * Math.max(0, (Number(points.red) || 0) - 1);
}
/**
 * 주황 · 거리: 돌진 경로 예산 배율. 기본(0포인트) = DASH_ROUTE_MULT(2),
 * 포인트당 +0.1 (2 → 2.1 → 2.2 …).
 */
export function dashDistanceMult(points = {}, base = DASH_ROUTE_MULT) {
  return base + 0.1 * Math.max(0, Number(points.orange) || 0);
}
/** 노랑 · 경로 데미지: 돌진 경로에서 스친 적에게 공격력×(0.1·노랑) 피해 */
export function pathDamageMult(points = {}) {
  return 0.1 * Math.max(0, Number(points.yellow) || 0);
}
/** 초록 · 연타: 근접 공격이 한 번 더 나갈 확률 (포인트당 +10%, 최대 100%) */
export function multiHitChance(points = {}) {
  return Math.min(1, 0.1 * Math.max(0, Number(points.green) || 0));
}
/** 파랑 · 폭발: 도착 지점 주변 적에게 공격력×(0.1·파랑) 폭발 피해 */
export function explosionDamageMult(points = {}) {
  return 0.1 * Math.max(0, Number(points.blue) || 0);
}
/** 보라 · 실드: 도착 시 최대 HP×(0.1·보라) 흡수 실드(지속 5초) */
export function shieldHpMult(points = {}) {
  return 0.1 * Math.max(0, Number(points.purple) || 0);
}
/** 하양 · 스턴: 도착 시 대상(인간) 스턴 지속(초) — 포인트당 1초 */
export function stunSeconds(points = {}) {
  return 1.0 * Math.max(0, Number(points.white) || 0);
}

/**
 * 잔상 "한 사이클" 구성. 투자된(0 제외) 색 중 최소 투자량을 1단위로 보고,
 * 각 색의 반복 수 = round(points / min). 팔레트 순서(빨→…→하)로 펼친다.
 * 예) 빨6 주2 → [빨,빨,빨,주] · 빨10 주3 초2 → [빨×5,주×2,초×1] · 빨1주1노1초1 → [빨,주,노,초]
 * @param {{[color:string]: number}} points
 * @returns {string[]} 사이클(최소 길이 1)
 */
export function dashColorCycle(points = {}) {
  const nz = DASH_COLORS
    .map((c) => [c, Math.max(0, Number(points[c]) || 0)])
    .filter(([, v]) => v > 0);
  if (nz.length === 0) return ["red"]; // 안전장치: 투자 없음 → 전부 빨강
  const min = Math.min(...nz.map(([, v]) => v));
  const cycle = [];
  for (const [color, v] of nz) {
    const reps = Math.max(1, Math.round(v / min));
    for (let k = 0; k < reps; k++) cycle.push(color);
  }
  return cycle;
}

/**
 * 잔상 트레일 = dashColorCycle을 돌진 전체(잔상 count개)에 한 번 순서대로 펼친 것.
 * k번째 잔상 = cycle[floor(k / count × len)] — 짧은 돌진이든 긴 돌진이든 투자한 모든 색이
 * 빨→…→하 순서로 비율대로 나온다. 런타임(tankView)은 45ms마다 돌진 진행률
 * (경과 ÷ 예상 비행시간)로 같은 인덱스를 계산해 칠한다. 아래는 그 결과를 미리 펼친 것(문서·테스트용).
 * @param {{[color:string]: number}} points
 * @param {number} count 펼칠 잔상 개수
 * @returns {string[]}
 */
export function dashGhostTrail(points = {}, count = 0) {
  const cycle = dashColorCycle(points);
  const n = Math.max(0, count);
  return Array.from({ length: n }, (_, i) =>
    cycle[Math.min(cycle.length - 1, Math.floor((i / n) * cycle.length))]);
}
