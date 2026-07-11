// 스킬 트리 그래프. MVP: Dash 스킬(7색 + 대쉬 숙련 + 인식범위)을 슬롯에 배치한다.
// 배치 규칙 — 왼쪽 열(col0)에 7색 + 대쉬 숙련을 위→아래로 8칸 꽉 채우고,
// 인식범위는 맨 오른쪽 열의 맨 위(우상단)에 별도 배치한다. 레벨 제한·선행 없음.
// (스프라이트/아트는 아직 굽지 않음. 색·이름·효과 텍스트만.)

const COLUMN_X = [8, 29, 50, 71, 92];
const ROW_Y = [8, 20.14, 32.29, 44.43, 56.57, 68.71, 80.86, 93];
const NUM_COLS = COLUMN_X.length;
const NUM_ROWS = ROW_Y.length;

/** 왼쪽 열(col0)에 위→아래로 채울 Dash 스킬 정의. kind: color=잔상 색, passive=쿨타임/마나 숙련 */
export const DASH_SKILL_DEFS = Object.freeze([
  { key: "red",    kind: "color",   name: "빨강 · 복수",        effect: "피격 시 다음 공격력 ×1.1씩 (구현됨)" },
  { key: "orange", kind: "color",   name: "주황 · 거리",        effect: "돌진 사거리 배율 +0.1씩 (구현됨)" },
  { key: "yellow", kind: "color",   name: "노랑 · 경로 데미지", effect: "경로상 적 피해 (미구현)" },
  { key: "green",  kind: "color",   name: "초록 · 연타",        effect: "연타 확률 (미구현)" },
  { key: "blue",   kind: "color",   name: "파랑 · 폭발",        effect: "도착 후 폭발 (미구현)" },
  { key: "purple", kind: "color",   name: "보라 · 실드",        effect: "도착 후 실드 (미구현)" },
  { key: "white",  kind: "color",   name: "하양 · 스턴",        effect: "도착 후 스턴 (미구현)" },
  { key: "cdmana", kind: "passive", name: "대쉬 숙련",          effect: "돌진 쿨타임 -10%, 마나소모 -10%씩 (구현됨)" },
]);

/** 우상단에 별도 배치하는 인식범위 패시브 */
export const DETECT_SKILL_DEF = Object.freeze(
  { key: "detect", kind: "detect", name: "인식범위", effect: "인식 범위 ×1.1씩 (구현됨)" },
);

const dashByIndex = new Map();
DASH_SKILL_DEFS.forEach((def, row) => dashByIndex.set(row * NUM_COLS, def)); // col0, 위→아래
dashByIndex.set(NUM_COLS - 1, DETECT_SKILL_DEF); // 맨 오른쪽 열, 맨 위(row0) = 우상단

export const SKILL_TREE = Object.freeze(
  Array.from({ length: NUM_COLS * NUM_ROWS }, (_, index) => {
    const row = Math.floor(index / NUM_COLS);
    const col = index % NUM_COLS;
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
