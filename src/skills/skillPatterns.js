// src/skills/skillPatterns.js
// 새우 스킬 4슬롯(패시브·액티브·이동기·오러) → 색상별 패턴 오버레이 매핑.
// Shrimprium의 패턴 오버레이 방식(흰색/회색조 스프라이트 시트)을 그대로 쓰되,
// 색은 미리 굽지 않고 렌더 단계에서 CSS mask + background-color로 자유롭게 입힌다.
// 슬롯 ↔ 시각 레이어 매핑:
//   passive  → SPECKLE (스페클)
//   active   → RILI    (릴리)
//   movement → BACKLINE(백라인)
//   aura     → glow    (drop-shadow)

/** 슬롯 카테고리 → 시각 레이어 키 */
export const SLOT_LAYER = Object.freeze({
  passive: "speckle",
  active: "rili",
  movement: "backline",
  aura: "glow",
});

/** 레이어 키 → 마스크 스프라이트 파일 (glow는 스프라이트 없음) */
export const LAYER_MASK = Object.freeze({
  speckle: "assets/shrimp_variants/SPECKLE.png",
  rili: "assets/shrimp_variants/RILI.png",
  backline: "assets/shrimp_variants/BACKLINE.png",
});

/**
 * 스킬 카탈로그. 각 스킬은 슬롯 카테고리와 표시 색을 가진다.
 * 색은 슬롯이 아니라 "어떤 스킬을 꼈는지"에 따라 달라진다 —
 * 예: 패시브 슬롯에 흰 스페클, 액티브에 노란 릴리, 이동기에 파란 백라인.
 */
export const SKILL_CATALOG = Object.freeze({
  // 패시브 → 스페클
  ironScale: { id: "ironScale", name: "강철 껍질", category: "passive", color: "#ffffff" },
  bloodThirst: { id: "bloodThirst", name: "흡혈 갈망", category: "passive", color: "#ff3b5c" },
  toxicSkin: { id: "toxicSkin", name: "독성 피부", category: "passive", color: "#7ce07c" },

  // 액티브 → 릴리
  frenzy: { id: "frenzy", name: "광폭화", category: "active", color: "#ffd23b" },
  venomShot: { id: "venomShot", name: "맹독 사출", category: "active", color: "#b06bff" },
  crush: { id: "crush", name: "분쇄", category: "active", color: "#ff8a3b" },

  // 이동기 → 백라인
  dash: { id: "dash", name: "혈귀 돌진", category: "movement", color: "#3b7bff" },
  blink: { id: "blink", name: "점멸", category: "movement", color: "#3be0ff" },
  leap: { id: "leap", name: "도약", category: "movement", color: "#c8ff3b" },

  // 오러 → glow
  crimsonAura: { id: "crimsonAura", name: "진홍 오러", category: "aura", color: "#ff2020" },
  frostAura: { id: "frostAura", name: "서리 오러", category: "aura", color: "#40c0ff" },
  goldAura: { id: "goldAura", name: "황금 오러", category: "aura", color: "#ffcf40" },
});

/** 빈 장착 슬롯 (스킬 id 또는 null) */
export function emptyEquip() {
  return { passive: null, active: null, movement: null, aura: null };
}

/**
 * 장착된 스킬로부터 각 시각 레이어의 색을 계산한다.
 * @param {object} char  – equipped 슬롯을 가진 캐릭터
 * @returns {{ speckle: string|null, rili: string|null, backline: string|null, glow: string|null }}
 */
export function getEquippedLayers(char) {
  const layers = { speckle: null, rili: null, backline: null, glow: null };
  const equipped = char?.equipped;
  if (!equipped) return layers;
  for (const category of Object.keys(SLOT_LAYER)) {
    const skill = SKILL_CATALOG[equipped[category]];
    if (skill) layers[SLOT_LAYER[category]] = skill.color;
  }
  return layers;
}
