// src/skills/skillPatterns.js
// 새우 스킬 4슬롯(패시브·액티브·이동기·오러) → 색상별 패턴 오버레이 매핑.
// Shrimprium의 패턴 오버레이 방식(흰색/회색조 스프라이트 시트)을 이식하되,
// 색은 색상별로 미리 구운 스프라이트(assets/shrimp_variants/{PATTERN}-{color}.png)를 쓴다.
// 슬롯 ↔ 시각 레이어 매핑:
//   passive  → SPECKLE (스페클)
//   active   → RILI    (릴리)
//   movement → BACKLINE(백라인)
//   aura     → glow    (drop-shadow, 스프라이트 없음)

/** 슬롯 카테고리 → 시각 레이어 키 */
export const SLOT_LAYER = Object.freeze({
  passive: "speckle",
  active: "rili",
  movement: "backline",
  aura: "glow",
});

/** 슬롯 카테고리 순서 (UI 표시용) */
export const SKILL_CATEGORIES = Object.freeze(["passive", "active", "movement", "aura"]);

/** 카테고리 한글 라벨 */
export const CATEGORY_LABEL = Object.freeze({
  passive: "패시브",
  active: "액티브",
  movement: "이동",
  aura: "오라",
});

/** 레이어 키 → 색상별로 구운 스프라이트 파일명 접두사 */
export const LAYER_SPRITE_PREFIX = Object.freeze({
  speckle: "SPECKLE",
  rili: "RILI",
  backline: "BACKLINE",
});

/**
 * 색상별로 미리 구운 패턴 스프라이트 팔레트 (14색).
 * tools/generate_pattern_colors.py의 COLORS와 동기화할 것.
 * RILI는 회색조 음영을 색 안에 보존하도록 굽는다.
 */
export const PATTERN_COLORS = Object.freeze({
  red:         "#ff4757",
  dark_red:    "#5c0f0f",
  orange:      "#e8850a",
  blue:        "#3f6ff3",
  dark_blue:   "#0f1f5c",
  yellow:      "#f3c83f",
  dark_yellow: "#6e5a16",
  green:       "#3f9a3f",
  dark_green:  "#123d18",
  teal:        "#17a6a6",
  purple:      "#7a3fb3",
  dark_purple: "#3a1a5c",
  black:       "#202020",
  gray:        "#9aa0a8",
});

const VARIANT_DIR = "assets/shrimp_variants";

/**
 * 색상별로 구운 패턴 스프라이트 경로.
 * @param {string} layer     – speckle | rili | backline
 * @param {string} colorKey  – PATTERN_COLORS의 키 (예: "red", "dark_green")
 * @returns {string|null} 스프라이트 경로 (알 수 없는 조합이면 null)
 */
export function bakedPatternPath(layer, colorKey) {
  const prefix = LAYER_SPRITE_PREFIX[layer];
  if (!prefix || !(colorKey in PATTERN_COLORS)) return null;
  return `${VARIANT_DIR}/${prefix}-${colorKey}.png`;
}

/**
 * 진영별 스킬표. category → { colorKey → 스킬 이름 }.
 * 행 색(colorKey)이 곧 그 스킬의 패턴 색이다. 빈 칸(그 색에 스킬 없음)은 생략한다.
 * 색상 계열로 진영을 나눈다 — 뱀파이어는 난색+보라+검정, 인간은 한색 계열(이후 단계).
 * (스킬의 게임플레이 효과는 이후 단계에서 붙인다.)
 */
export const SIDE_SKILLS = Object.freeze({
  vampire: {
    passive:  { red: "소환", dark_red: "먹기", orange: "이속", yellow: "투사속도", dark_yellow: "투사공격", purple: "방어", dark_purple: "회피", black: "공격" },
    active:   { red: "흡혈", dark_red: "강타", orange: "안개", yellow: "투사", dark_yellow: "저격투사", purple: "좀비소환", dark_purple: "회피안개", black: "마비" },
    movement: { red: "대쉬", dark_red: "당겨", orange: "안개속 휩쓸기", yellow: "분신", dark_yellow: "더미", purple: "강력점프", dark_purple: "아군소환", black: "플립" },
    aura:     { red: "흡혈", orange: "이속", yellow: "공격력", purple: "상대 이속방해", black: "상대 살점뜯기" },
  },
  human: {
    passive: {}, active: {}, movement: {}, aura: {}, // 인간 스킬은 이후 단계
  },
});

const SIDE_PREFIX = Object.freeze({ vampire: "v", human: "h" });

/**
 * 스킬 카탈로그 (id → 스킬). SIDE_SKILLS 그리드에서 생성한다.
 * id 규칙: `${sidePrefix}_${category}_${colorKey}` (예: v_passive_red).
 * 각 스킬: { id, side, category, colorKey, name }.
 */
export const SKILL_CATALOG = (() => {
  const catalog = {};
  for (const [side, categories] of Object.entries(SIDE_SKILLS)) {
    for (const [category, byColor] of Object.entries(categories)) {
      for (const [colorKey, name] of Object.entries(byColor)) {
        const id = `${SIDE_PREFIX[side]}_${category}_${colorKey}`;
        catalog[id] = { id, side, category, colorKey, name };
      }
    }
  }
  return Object.freeze(catalog);
})();

/** 빈 장착 슬롯 (스킬 id 또는 null) */
export function emptyEquip() {
  return { passive: null, active: null, movement: null, aura: null };
}

/**
 * 데모용 기본 장착 (장착 UI가 붙기 전 패턴을 눈으로 확인하기 위함).
 * 뱀파이어만 표본 세트를 준다.
 */
export function demoEquip(side) {
  if (side === "vampire") {
    return { passive: "v_passive_red", active: "v_active_yellow", movement: "v_movement_purple", aura: "v_aura_red" };
  }
  return emptyEquip();
}

/** 해당 진영·카테고리에 속한 스킬 id 목록 (표 정의 순서 = 팔레트 색 순서) */
export function skillsInCategory(side, category) {
  return Object.values(SKILL_CATALOG)
    .filter((s) => s.side === side && s.category === category)
    .map((s) => s.id);
}

/**
 * 슬롯에 스킬을 장착한다. skillId가 null이거나 카테고리·진영이 맞지 않으면 슬롯을 비운다.
 * @returns {boolean} 실제로 값이 바뀌었으면 true
 */
export function equipSkill(char, category, skillId) {
  if (!char || !(category in SLOT_LAYER)) return false;
  if (!char.equipped) char.equipped = emptyEquip();
  const skill = SKILL_CATALOG[skillId];
  const next = skill && skill.category === category && skill.side === char.side ? skillId : null;
  if (char.equipped[category] === next) return false;
  char.equipped[category] = next;
  return true;
}

/**
 * 장착된 스킬로부터 각 시각 레이어의 색 키를 계산한다.
 * @param {object} char  – equipped 슬롯을 가진 캐릭터
 * @returns {{ speckle: string|null, rili: string|null, backline: string|null, glow: string|null }}
 *          각 값은 PATTERN_COLORS의 색 키 (미장착이면 null)
 */
export function getEquippedLayers(char) {
  const layers = { speckle: null, rili: null, backline: null, glow: null };
  const equipped = char?.equipped;
  if (!equipped) return layers;
  for (const category of Object.keys(SLOT_LAYER)) {
    const skill = SKILL_CATALOG[equipped[category]];
    if (skill) layers[SLOT_LAYER[category]] = skill.colorKey;
  }
  return layers;
}
