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
  movement: "이동기",
  aura: "오러",
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
 * 스킬 카탈로그. 각 스킬은 슬롯 카테고리와 팔레트 색 키(colorKey)를 가진다.
 * 색은 슬롯이 아니라 "어떤 스킬을 꼈는지"에 따라 달라진다 —
 * 예: 패시브 슬롯에 회색 스페클, 액티브에 노란 릴리, 이동기에 파란 백라인.
 * (스킬의 게임플레이 효과는 이후 단계에서 붙인다.)
 */
export const SKILL_CATALOG = Object.freeze({
  // 패시브 → 스페클
  ironScale: { id: "ironScale", name: "강철 껍질", category: "passive", colorKey: "gray" },
  bloodThirst: { id: "bloodThirst", name: "흡혈 갈망", category: "passive", colorKey: "red" },
  toxicSkin: { id: "toxicSkin", name: "독성 피부", category: "passive", colorKey: "green" },

  // 액티브 → 릴리
  frenzy: { id: "frenzy", name: "광폭화", category: "active", colorKey: "yellow" },
  venomShot: { id: "venomShot", name: "맹독 사출", category: "active", colorKey: "purple" },
  crush: { id: "crush", name: "분쇄", category: "active", colorKey: "orange" },

  // 이동기 → 백라인
  dash: { id: "dash", name: "혈귀 돌진", category: "movement", colorKey: "blue" },
  blink: { id: "blink", name: "점멸", category: "movement", colorKey: "teal" },
  leap: { id: "leap", name: "도약", category: "movement", colorKey: "dark_yellow" },

  // 오러 → glow
  crimsonAura: { id: "crimsonAura", name: "진홍 오러", category: "aura", colorKey: "red" },
  frostAura: { id: "frostAura", name: "서리 오러", category: "aura", colorKey: "dark_blue" },
  goldAura: { id: "goldAura", name: "황금 오러", category: "aura", colorKey: "yellow" },
});

/** 빈 장착 슬롯 (스킬 id 또는 null) */
export function emptyEquip() {
  return { passive: null, active: null, movement: null, aura: null };
}

/** 해당 카테고리에 속한 스킬 id 목록 */
export function skillsInCategory(category) {
  return Object.values(SKILL_CATALOG)
    .filter((s) => s.category === category)
    .map((s) => s.id);
}

/**
 * 슬롯에 스킬을 장착한다. skillId가 null이거나 카테고리가 맞지 않으면 슬롯을 비운다.
 * @returns {boolean} 실제로 값이 바뀌었으면 true
 */
export function equipSkill(char, category, skillId) {
  if (!char || !(category in SLOT_LAYER)) return false;
  if (!char.equipped) char.equipped = emptyEquip();
  const skill = SKILL_CATALOG[skillId];
  const next = skill && skill.category === category ? skillId : null;
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
