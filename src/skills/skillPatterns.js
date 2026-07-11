// src/skills/skillPatterns.js
// 새우 4슬롯(패시브·액티브·이동·오라) → 색상별 패턴 오버레이 시스템.
// 각 슬롯은 14색 팔레트 중 하나를 담고, 그 색으로 구운 스프라이트를 몸통 위에 겹친다.

export const SLOT_LAYER = Object.freeze({
  passive: "speckle",
  active: "rili",
  movement: "backline",
  aura: "glow",
});

export const SKILL_CATEGORIES = Object.freeze(["passive", "active", "movement", "aura"]);

export const CATEGORY_LABEL = Object.freeze({
  passive: "패시브",
  active: "액티브",
  movement: "이동",
  aura: "오라",
});

export const LAYER_SPRITE_PREFIX = Object.freeze({
  speckle: "SPECKLE",
  rili: "RILI",
  backline: "BACKLINE",
});

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

export const COLOR_LABEL = Object.freeze({
  red: "빨강",
  dark_red: "검붉은",
  orange: "주황",
  blue: "파랑",
  dark_blue: "검푸른",
  yellow: "노랑",
  dark_yellow: "검노랑",
  green: "초록",
  dark_green: "검초록",
  teal: "청록",
  purple: "보라",
  dark_purple: "검보라",
  black: "검정",
  gray: "회색",
});

export const COLOR_KEYS = Object.freeze(Object.keys(PATTERN_COLORS));

const VARIANT_DIR = "assets/shrimp_variants";

export function bakedPatternPath(layer, colorKey) {
  const prefix = LAYER_SPRITE_PREFIX[layer];
  if (!prefix || !(colorKey in PATTERN_COLORS)) return null;
  return `${VARIANT_DIR}/${prefix}-${colorKey}.png`;
}

export function emptyEquip() {
  return { passive: null, active: null, movement: null, aura: null };
}

export function demoEquip(side) {
  if (side === "vampire") {
    return { passive: "gray", active: "yellow", movement: "blue", aura: "red" };
  }
  return emptyEquip();
}

/** 슬롯에 색을 지정하거나(유효 colorKey) 비운다(그 외). 값이 바뀌면 true. */
export function equipColor(char, category, colorKey) {
  if (!char || !(category in SLOT_LAYER)) return false;
  if (!char.equipped) char.equipped = emptyEquip();
  const next = colorKey && colorKey in PATTERN_COLORS ? colorKey : null;
  if (char.equipped[category] === next) return false;
  char.equipped[category] = next;
  return true;
}

/** 장착 색 → 각 시각 레이어의 색 키 (미장착·미지 색은 null). */
export function getEquippedLayers(char) {
  const layers = { speckle: null, rili: null, backline: null, glow: null };
  const equipped = char?.equipped;
  if (!equipped) return layers;
  for (const category of SKILL_CATEGORIES) {
    const colorKey = equipped[category];
    if (colorKey && colorKey in PATTERN_COLORS) layers[SLOT_LAYER[category]] = colorKey;
  }
  return layers;
}
