// 혈귀 돌진(Dash) 잔상 색상 로직.
// 스킬포인트 비율에 따라 잔상 색이 바뀐다. 팔레트 순서는 무지개 순(빨→주→노→초→파→보→하).
// 잔상 개수는 노트 설계대로 "빨강+주황" 포인트로 결정하며 여기서 하드코딩한다.
// 순수 함수만 두어 테스트하기 쉽게 한다(뷰/상태 의존 없음).

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

// ── 잔상 개수 하드코딩(빨강+주황 포인트 기준) ──
const GHOST_BASE = 6;        // 빨강 1(기본)일 때 기본 개수
const GHOST_PER_RED = 2;     // 빨강 추가 포인트당
const GHOST_PER_ORANGE = 3;  // 주황(거리) 포인트당 — 거리가 늘어 잔상이 더 길게 남는다
const GHOST_MIN = 3;
const GHOST_MAX = 18;

/**
 * 잔상 개수. 노트: "잔상 갯수는 빨강+주황 스킬에 따라 결정" → 하드코딩.
 * @param {{[color:string]: number}} points 색상별 투자 포인트
 * @returns {number}
 */
export function dashGhostCount(points = {}) {
  const red = Math.max(0, Number(points.red) || 0);
  const orange = Math.max(0, Number(points.orange) || 0);
  const n = GHOST_BASE + GHOST_PER_RED * Math.max(0, red - 1) + GHOST_PER_ORANGE * orange;
  return Math.max(GHOST_MIN, Math.min(GHOST_MAX, Math.round(n)));
}

/**
 * 색상별 잔상 슬롯 개수를 정한다. 합은 정확히 N.
 * - 기대 슬롯 = N · weight/Σweight
 * - 정수부는 확정 배분, 남는 슬롯은 소수부를 가중치로 랜덤 배정(랜덤 라운딩).
 *   → 포인트가 큰 색은 확정으로 나오고, 포인트가 작아 기대치가 1 미만인 색은
 *     "운이 좋아야" 나온다(노트: 작은 포인트 색은 운 나쁘면 안 나올 수도).
 * @param {{[color:string]: number}} points
 * @param {number} N 총 잔상 개수
 * @param {() => number} [rng]
 * @returns {{[color:string]: number}} 색 → 슬롯 개수
 */
export function allocateGhostSlots(points, N, rng = Math.random) {
  const weights = DASH_COLORS.map((c) => Math.max(0, Number(points[c]) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const counts = new Array(DASH_COLORS.length).fill(0);
  if (N <= 0) return {};
  if (total <= 0) {
    counts[0] = N; // 안전장치: 포인트가 전무하면 전부 빨강
    return toColorMap(counts);
  }

  const fracs = [];
  let assigned = 0;
  for (let i = 0; i < weights.length; i++) {
    const exact = (N * weights[i]) / total;
    const base = Math.floor(exact);
    counts[i] = base;
    assigned += base;
    if (weights[i] > 0) fracs.push({ i, frac: exact - base });
  }

  // 남은 슬롯을 소수부 가중치로 무작위 배정(비복원)
  let remaining = N - assigned;
  const pool = fracs.filter((f) => f.frac > 0);
  while (remaining > 0 && pool.length > 0) {
    const sum = pool.reduce((a, f) => a + f.frac, 0);
    let r = rng() * sum;
    let pick = pool.length - 1;
    for (let k = 0; k < pool.length; k++) {
      r -= pool[k].frac;
      if (r <= 0) { pick = k; break; }
    }
    counts[pool[pick].i] += 1;
    pool.splice(pick, 1);
    remaining -= 1;
  }
  // 소수부가 모두 0인데 남으면(정수 비율) 가중치 큰 색부터 채운다
  while (remaining > 0) {
    let best = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
    counts[best] += 1;
    remaining -= 1;
  }
  return toColorMap(counts);
}

function toColorMap(counts) {
  const out = {};
  for (let i = 0; i < DASH_COLORS.length; i++) {
    if (counts[i] > 0) out[DASH_COLORS[i]] = counts[i];
  }
  return out;
}

/**
 * 잔상 색 시퀀스(스폰/진행도 순). index 0 = 새우에서 가장 먼 꼬리 쪽,
 * 마지막 index = 새우에 가장 가까운 앞쪽. 팔레트 앞 색(빨강)을 앞쪽(새우 근처)에 둔다.
 * → 골고루면 무지개, 빨강+주황만 있으면 새우 근처 빨강 / 꼬리 쪽 주황.
 * @param {{[color:string]: number}} points
 * @param {() => number} [rng]
 * @returns {string[]} 길이 N, 각 원소는 색상 키
 */
export function dashGhostColorSequence(points = {}, rng = Math.random) {
  const N = dashGhostCount(points);
  const slots = allocateGhostSlots(points, N, rng);
  // 팔레트 순서(빨→…→하)로 펼친다: [빨,빨,주,주,…]
  const palette = [];
  for (const color of DASH_COLORS) {
    for (let k = 0; k < (slots[color] || 0); k++) palette.push(color);
  }
  // 앞쪽(새우 근처) = 빨강이 되도록 뒤집는다: 마지막 원소가 팔레트 첫 색(빨강)
  palette.reverse();
  return palette;
}

/**
 * 돌진 진행도(0=출발, 1=도착/새우 위치)에 대응하는 잔상 색.
 * @param {string[]} sequence dashGhostColorSequence 결과
 * @param {number} progress 0..1
 * @returns {string} 색상 키(비면 'red')
 */
export function ghostColorAtProgress(sequence, progress) {
  if (!Array.isArray(sequence) || sequence.length === 0) return "red";
  const p = Math.max(0, Math.min(0.999999, Number(progress) || 0));
  return sequence[Math.floor(p * sequence.length)];
}
