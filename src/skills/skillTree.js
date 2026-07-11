// 스킬 트리 그래프. MVP: Dash 스킬(7색 + 인식범위)을 슬롯에 배치한다.
// 배치 규칙 — 왼쪽 열부터 위→아래로 차례대로, 넘치면 다음 열로. 레벨 제한·선행 없음.
// (스프라이트/아트는 아직 굽지 않음. 색·이름·효과 텍스트만.)

const COLUMN_X = [8, 29, 50, 71, 92];
const ROW_Y = [8, 25, 42, 59, 76, 93];

/** 트리에 올릴 Dash 스킬 정의(배치 순서대로). kind: color=잔상 색, detect=인식범위 */
export const DASH_SKILL_DEFS = Object.freeze([
  { key: "red",    kind: "color",  name: "빨강 · 복수",        effect: "피격 시 다음 공격력 ×1.1씩 (구현됨)" },
  { key: "orange", kind: "color",  name: "주황 · 거리",        effect: "돌진 사거리 배율 +0.1씩 (구현됨)" },
  { key: "yellow", kind: "color",  name: "노랑 · 경로 데미지", effect: "경로상 적 피해 (미구현)" },
  { key: "green",  kind: "color",  name: "초록 · 연타",        effect: "연타 확률 (미구현)" },
  { key: "blue",   kind: "color",  name: "파랑 · 폭발",        effect: "도착 후 폭발 (미구현)" },
  { key: "purple", kind: "color",  name: "보라 · 실드",        effect: "도착 후 실드 (미구현)" },
  { key: "white",  kind: "color",  name: "하양 · 스턴",        effect: "도착 후 스턴 (미구현)" },
  { key: "detect", kind: "detect", name: "인식범위",           effect: "인식 범위 ×1.1씩 (구현됨)" },
]);

// 열 우선(column-major) 슬롯 인덱스: 왼쪽 열(col0) 위→아래, 그다음 col1 …
const SLOT_ORDER = [];
for (let col = 0; col < COLUMN_X.length; col++) {
  for (let row = 0; row < ROW_Y.length; row++) SLOT_ORDER.push(row * COLUMN_X.length + col);
}
const dashByIndex = new Map();
DASH_SKILL_DEFS.forEach((def, i) => dashByIndex.set(SLOT_ORDER[i], def));

export const SKILL_TREE = Object.freeze(
  Array.from({ length: 30 }, (_, index) => {
    const row = Math.floor(index / 5);
    const col = index % 5;
    const dash = dashByIndex.get(index) ?? null;
    return Object.freeze({
      id: `skill-${String(index + 1).padStart(2, "0")}`,
      name: dash ? dash.name : `빈 슬롯 ${String(index + 1).padStart(2, "0")}`,
      dash, // { key, kind, name, effect } | null
      requiredLevel: 1,          // 레벨 제한 없음
      parents: Object.freeze([]), // 선행 없음
      x: COLUMN_X[col],
      y: ROW_Y[row],
    });
  }),
);

export const SKILL_BY_ID = new Map(SKILL_TREE.map((skill) => [skill.id, skill]));

export function normalizeSkillProgress(char) {
  if (!char) return char;
  if (!Number.isFinite(char.skillPoints)) char.skillPoints = Math.max(0, (char.level ?? 1) - 1);
  char.skillPoints = Math.max(0, Math.floor(char.skillPoints));
  if (!Array.isArray(char.learnedSkills)) char.learnedSkills = [];
  char.learnedSkills = [...new Set(char.learnedSkills.filter((id) => SKILL_BY_ID.has(id)))];
  return char;
}
