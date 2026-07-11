// 새우 오러: 레벨 1~50을 5레벨 구간(10단계)으로 나눠, 단계가 오를수록 점점 화려해지는
// 빨강 계열 오러를 새우 뒤에 애니메이션으로 붙인다. opacity는 단계가 오를수록 진해진다.
// 순수 함수/데이터만 두어 테스트하기 쉽게 한다(뷰·상태 의존 없음). 뷰(tankView)는
// auraStyleForTier()가 돌려주는 값을 CSS 변수로 그대로 꽂아 그린다.

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
 * 단계(0~9)별 오러 스타일 파라미터. 단계가 오를수록:
 * - size  : 오러 지름(px)이 커진다(새우 32px보다 크게, 34→64).
 * - opacity: 전체 불투명도가 진해진다(0.22→0.97).
 * - core/edge: 빨강 계열 색이 안쪽부터 더 뜨겁게(빨강→주홍·금빛) 달아오른다.
 * - ringOpacity : 회전하는 소용돌이 링이 2단계부터 등장해 또렷해진다.
 * - sparkOpacity: 반대로 도는 스파크 링이 4단계부터 등장해 또렷해진다.
 * - spin  : 링 1회전 시간(초)이 짧아진다(8→3.2, 더 빠르게 돈다).
 * @param {number} tier 0~9
 */
export function auraStyleForTier(tier) {
  const t = Math.max(0, Math.min(AURA_TIER_COUNT - 1, Math.floor(Number(tier) || 0)));
  const f = t / (AURA_TIER_COUNT - 1); // 0..1
  // 안쪽 코어: 빨강(255,60,80)에서 주홍·금빛(255,200,120)으로 달아오른다.
  const core = `rgb(255, ${Math.round(lerp(60, 200, f))}, ${Math.round(lerp(80, 120, f))})`;
  // 바깥 테두리: 진한 핏빛 → 밝은 선홍으로.
  const edge = `rgb(${Math.round(lerp(178, 255, f))}, ${Math.round(lerp(24, 70, f))}, ${Math.round(lerp(40, 60, f))})`;
  return {
    tier: t,
    size: Math.round(lerp(34, 64, f)),
    opacity: round2(lerp(0.22, 0.97, f)),
    core,
    edge,
    ringOpacity: t < 2 ? 0 : round2(lerp(0.15, 1, (t - 2) / 7)),
    sparkOpacity: t < 4 ? 0 : round2(lerp(0.2, 1, (t - 4) / 5)),
    spin: round2(lerp(8, 3.2, f)),
  };
}

/** 미리 펼친 10단계 스타일 표(문서·테스트·참조용) */
export const AURA_TIERS = Array.from({ length: AURA_TIER_COUNT }, (_, i) => auraStyleForTier(i));
