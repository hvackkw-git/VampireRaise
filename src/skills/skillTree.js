// Placeholder skill-tree graph. Slots intentionally carry only progression data;
// real skill effects and artwork can be attached later without changing the UI.

const COLUMN_X = [8, 29, 50, 71, 92];
const ROW_Y = [8, 25, 42, 59, 76, 93];
const REQUIRED_LEVELS = [2, 4, 6, 8, 10, 12];

const PARENTS = [
  [], [], [], [], [],
  ["skill-01"], ["skill-01"], [], ["skill-04"], ["skill-05"],
  ["skill-06"], ["skill-06", "skill-07"], ["skill-08"], ["skill-09"], ["skill-10"],
  ["skill-11"], ["skill-12"], [], ["skill-14"], ["skill-14", "skill-15"],
  ["skill-16"], ["skill-16", "skill-17"], ["skill-18"], ["skill-19"], ["skill-20"],
  ["skill-21"], ["skill-22"], ["skill-23"], ["skill-24", "skill-25"], [],
];

export const SKILL_TREE = Object.freeze(
  Array.from({ length: 30 }, (_, index) => {
    const row = Math.floor(index / 5);
    const col = index % 5;
    return Object.freeze({
      id: `skill-${String(index + 1).padStart(2, "0")}`,
      name: `빈 스킬 ${String(index + 1).padStart(2, "0")}`,
      requiredLevel: REQUIRED_LEVELS[row],
      parents: Object.freeze(PARENTS[index]),
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

export function skillStatus(char, skillId) {
  const skill = SKILL_BY_ID.get(skillId);
  if (!char || !skill) return { state: "invalid", skill };
  normalizeSkillProgress(char);
  const learned = new Set(char.learnedSkills);
  if (learned.has(skillId)) return { state: "learned", skill };
  if ((char.level ?? 1) < skill.requiredLevel) return { state: "level", skill };
  const missingParents = skill.parents.filter((id) => !learned.has(id));
  if (missingParents.length) return { state: "prerequisite", skill, missingParents };
  if (char.skillPoints < 1) return { state: "points", skill };
  return { state: "available", skill };
}

export function learnSkill(char, skillId) {
  const status = skillStatus(char, skillId);
  if (status.state !== "available") return status;
  char.skillPoints -= 1;
  char.learnedSkills.push(skillId);
  return { state: "learned", skill: status.skill, learnedNow: true };
}
