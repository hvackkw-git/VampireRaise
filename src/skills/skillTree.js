// 스킬 트리 그래프. MVP: Dash 스킬(7색 + 대쉬 숙련 + 인식범위)과 Jombie Shrimp 스킬 열을 배치한다.
// 배치 규칙 — 왼쪽 열(col0)에 7색 + 대쉬 숙련을 위→아래로 8칸 꽉 채우고,
// 두 번째 열(col1)은 Jombie Shrimp 스킬이 담당한다. 인식범위는 맨 오른쪽 열의 맨 위(우상단)에 별도 배치한다.
// 레벨 제한·선행 없음.
// (스프라이트/아트는 아직 굽지 않음. 색·이름·효과 텍스트만.)

const COLUMN_X = [8, 29, 50, 71, 92];
const ROW_Y = [8, 20.14, 32.29, 44.43, 56.57, 68.71, 80.86, 93];
const NUM_COLS = COLUMN_X.length;
const NUM_ROWS = ROW_Y.length;

/** 왼쪽 열(col0)에 위→아래로 채울 Dash 스킬 정의. kind: color=잔상 색, passive=쿨타임/마나 숙련 */
export const DASH_SKILL_DEFS = Object.freeze([
  { key: "red", kind: "color", nameKey: "skills.redName", effectKey: "skills.redEffect" },
  { key: "orange", kind: "color", nameKey: "skills.orangeName", effectKey: "skills.orangeEffect" },
  { key: "yellow", kind: "color", nameKey: "skills.yellowName", effectKey: "skills.yellowEffect" },
  { key: "green", kind: "color", nameKey: "skills.greenName", effectKey: "skills.greenEffect" },
  { key: "blue", kind: "color", nameKey: "skills.blueName", effectKey: "skills.blueEffect" },
  { key: "purple", kind: "color", nameKey: "skills.purpleName", effectKey: "skills.purpleEffect" },
  { key: "white", kind: "color", nameKey: "skills.whiteName", effectKey: "skills.whiteEffect" },
  { key: "cdmana", kind: "passive", nameKey: "skills.cdmanaName", effectKey: "skills.cdmanaEffect" },
]);

/** 우상단에 별도 배치하는 인식범위 패시브 */
export const DETECT_SKILL_DEF = Object.freeze({
  key: "detect", kind: "detect", nameKey: "skills.detectName", effectKey: "skills.detectEffect",
});

/** 두 번째 열(col1)에 위→아래로 채울 Jombie Shrimp 스킬 정의. */
export const ZOMBIE_SKILL_DEFS = Object.freeze([
  { key: "zombie-hp", nameKey: "skills.zombieHpName", effectKey: "skills.zombieHpEffect" },
  { key: "zombie-yellow-revive", nameKey: "skills.zombieReviveName", effectKey: "skills.zombieReviveEffect", trait: true, cost: 5, implemented: true },
  { key: "zombie-red-poison", nameKey: "skills.zombiePoisonName", effectKey: "skills.zombiePoisonEffect", trait: true, cost: 5, implemented: true },
  { key: "zombie-black", nameKey: "skills.zombieBlackName", effectKey: "skills.zombieBlackEffect", trait: true, cost: 5, implemented: false },
  { key: "zombie-move", nameKey: "skills.zombieMoveName", effectKey: "skills.zombieMoveEffect" },
  { key: "zombie-swarm", nameKey: "skills.zombieSwarmName", effectKey: "skills.zombieSwarmEffect" },
  { key: "zombie-infect", nameKey: "skills.zombieInfectName", effectKey: "skills.zombieInfectEffect" },
  { key: "zombie-mastery", nameKey: "skills.zombieMasteryName", effectKey: "skills.zombieMasteryEffect" },
]);

const dashByIndex = new Map();
DASH_SKILL_DEFS.forEach((def, row) => dashByIndex.set(row * NUM_COLS, def)); // col0, 위→아래
dashByIndex.set(NUM_COLS - 1, DETECT_SKILL_DEF); // 맨 오른쪽 열, 맨 위(row0) = 우상단

const zombieByIndex = new Map();
ZOMBIE_SKILL_DEFS.forEach((def, row) => zombieByIndex.set(row * NUM_COLS + 1, def)); // col1, 위→아래

export const SKILL_TREE = Object.freeze(
  Array.from({ length: NUM_COLS * NUM_ROWS }, (_, index) => {
    const row = Math.floor(index / NUM_COLS);
    const col = index % NUM_COLS;
    const dash = dashByIndex.get(index) ?? null;
    const zombie = zombieByIndex.get(index) ?? null;
    return Object.freeze({
      id: `skill-${String(index + 1).padStart(2, "0")}`,
      nameKey: dash?.nameKey ?? zombie?.nameKey ?? "skills.emptyName",
      nameVars: dash || zombie ? null : { number: String(index + 1).padStart(2, "0") },
      dash, // { key, kind, name, effect } | null
      zombie, // { key, name, effect } | null
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
