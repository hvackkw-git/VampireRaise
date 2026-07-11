// 새우 오러: 레벨 1~50을 5레벨 구간(10단계)으로 나눠, 단계가 오를수록 점점 화려해지는
// 빨강·보라 픽셀 오러를 새우 뒤에 붙인다. 1~5레벨은 오러가 없고 이후 단계가
// 오를수록 진하고 빠른 스프라이트 행을 사용한다. 크기와 투명도는 PNG에 구워 두고
// 뷰(tankView)는 단일 비트맵의 행과 background-position만 움직인다.

/** 구간 수 — 5레벨마다 잘라 10개의 오러 */
export const AURA_TIER_COUNT = 10;
/** 한 구간 길이(레벨) */
export const AURA_TIER_SPAN = 5;
export const AURA_MIN_LEVEL = 1;
export const AURA_MAX_LEVEL = 50;

/**
 * 레벨 → 오러 단계(0~9). 1~5→0, 6~10→1, …, 46~50→9.
 * 범위 밖 값은 1~50으로 클램프한다.
 * @param {number} level
 * @returns {number}
 */
export function auraTierForLevel(level) {
  const L = Math.max(
    AURA_MIN_LEVEL,
    Math.min(AURA_MAX_LEVEL, Math.floor(Number(level) || AURA_MIN_LEVEL)),
  );
  return Math.min(AURA_TIER_COUNT - 1, Math.floor((L - AURA_MIN_LEVEL) / AURA_TIER_SPAN));
}

const lerp = (a, b, t) => a + (b - a) * t;
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * 단계(0~9)별 오러 스타일 파라미터.
 * - 0단계(레벨 1~5)는 표시하지 않는다.
 * - 나머지 9단계는 밀도가 다른 전용 스프라이트 행을 각각 사용한다.
 * - 크기와 opacity(최대 0.7)는 스프라이트 알파에 직접 포함한다.
 * @param {number} tier 0~9
 */
export function auraStyleForTier(tier) {
  const t = Math.max(0, Math.min(AURA_TIER_COUNT - 1, Math.floor(Number(tier) || 0)));
  if (t === 0) {
    return { tier: 0, row: 0, duration: 1.15 };
  }
  const f = (t - 1) / 8;
  return {
    tier: t,
    row: t,
    duration: round2(lerp(1.15, 0.55, f)),
  };
}

/** 미리 펼친 10단계 스타일 표(문서·테스트·참조용) */
export const AURA_TIERS = Array.from({ length: AURA_TIER_COUNT }, (_, i) => auraStyleForTier(i));
