import {
  SKILL_BY_ID, SKILL_TREE, normalizeSkillProgress,
} from "../skills/skillTree.js";
import {
  DASH_COLOR_HEX, dashGhostCount, investDashColor, investDetect, investDashCdMana,
  normalizeDashPoints, resetDashColors, effectiveDetectRange,
  revengeAttackMult, dashDistanceMult, pathDamageMult, multiHitChance,
  explosionDamageMult, shieldHpMult, stunSeconds, detectRangeMult, dashCdManaMult,
} from "../skills/dashColors.js";
import {
  investZombieHp, investZombieTrait, zombieHpPoints, ZOMBIE_TRAIT_COST,
} from "../skills/zombieSkills.js";
import { t } from "../i18n/index.js";

const skillName = (skill) => t(skill.nameKey, skill.nameVars ?? {});
const skillEffect = (skill) => t((skill.dash ?? skill.zombie)?.effectKey ?? "");

function dashInvested(char, dash) {
  if (!dash) return 0;
  if (dash.kind === "detect") return char.detectPoints || 0;
  if (dash.kind === "passive") return char.dashCdManaPoints || 0;
  return char.dashColors[dash.key] || 0;
}

function skillUpgradeCost(skill) {
  return skill?.zombie?.trait ? ZOMBIE_TRAIT_COST : 1;
}

export function canUpgradeSkill(char, skill) {
  const points = Math.max(0, Math.floor(Number(char?.skillPoints) || 0));
  if (!char || !skill || points < skillUpgradeCost(skill)) return false;
  if (skill.dash || skill.zombie?.key === "zombie-hp") return true;
  if (skill.zombie?.trait) return !!skill.zombie.implemented && !char.zombieTrait;
  return false;
}

export function upgradeSkill(char, skill, chars = []) {
  if (!canUpgradeSkill(char, skill)) return false;
  if (skill.dash?.kind === "detect") return investDetect(char);
  if (skill.dash?.kind === "passive") return investDashCdMana(char);
  if (skill.dash) return investDashColor(char, skill.dash.key);
  if (skill.zombie?.key === "zombie-hp") return investZombieHp(char, chars);
  if (skill.zombie?.trait) return investZombieTrait(char, skill.zombie.key);
  return false;
}

function dashEffectAt(char, dash, invested) {
  const colors = { ...char.dashColors, [dash.key]: invested };
  if (dash.key === "red") return `x${revengeAttackMult(colors).toFixed(1)}`;
  if (dash.key === "orange") return `x${dashDistanceMult(colors).toFixed(1)}`;
  if (dash.key === "yellow") return `x${pathDamageMult(colors).toFixed(1)}`;
  if (dash.key === "green") return `${Math.round(multiHitChance(colors) * 100)}%`;
  if (dash.key === "blue") return `x${explosionDamageMult(colors).toFixed(1)}`;
  if (dash.key === "purple") return `x${shieldHpMult(colors).toFixed(1)} HP`;
  if (dash.key === "white") return `${stunSeconds(colors).toFixed(1)}s`;
  if (dash.kind === "detect") {
    const range = effectiveDetectRange({ ...char, detectPoints: invested });
    return `x${detectRangeMult(invested).toFixed(1)} (${Math.round(range)}px)`;
  }
  if (dash.kind === "passive") return `x${dashCdManaMult(invested).toFixed(1)}`;
  return "-";
}

function appendDetailText(row, text, className = "") {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  row.appendChild(span);
}

function appendHighlightedValue(row, value, className) {
  const valueText = String(value);
  const matches = [...valueText.matchAll(/[+−-]?\d+(?:\.\d+)?%?|x\d+(?:\.\d+)?|×\d+(?:\.\d+)?|\b(?:SP|HP|px|s)\b/gi)];
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) appendDetailText(row, valueText.slice(cursor, match.index));
    appendDetailText(row, match[0], className);
    cursor = match.index + match[0].length;
  }
  if (cursor < valueText.length) appendDetailText(row, valueText.slice(cursor));
}

function renderDetailLine(line, index) {
  const row = document.createElement("span");
  row.className = "skill-tree-detail-line";
  if (index === 0) {
    row.classList.add("skill-tree-detail-title");
    const [name, level] = String(line).split(" | ");
    appendDetailText(row, name);
    if (level) {
      appendDetailText(row, " | ", "skill-tree-detail-separator");
      appendHighlightedValue(row, level, "skill-tree-detail-value");
    }
    return row;
  }

  const text = String(line);
  const colon = text.indexOf(":");
  const label = colon >= 0 ? text.slice(0, colon) : "";
  const currentLabel = t("skillTree.current");
  const nextLabel = t("skillTree.next");
  const costLabel = t("skillTree.cost", { cost: "" }).split(":")[0];
  if ([currentLabel, nextLabel, costLabel].includes(label)) {
    const isNext = label === nextLabel;
    const isCost = label === costLabel;
    appendDetailText(row, `${label}: `, isNext ? "skill-tree-detail-label next" : "skill-tree-detail-label");
    appendHighlightedValue(
      row,
      text.slice(colon + 1).trimStart(),
      isNext ? "skill-tree-detail-value next" : isCost ? "skill-tree-detail-value cost" : "skill-tree-detail-value",
    );
    return row;
  }

  appendHighlightedValue(row, text, "skill-tree-detail-value");
  return row;
}

function renderSkillDetail(detail, lines) {
  detail.replaceChildren(...lines.map(renderDetailLine));
}

function skillDetailLines(char, skill) {
  if (skill.dash) {
    const current = dashInvested(char, skill.dash);
    return [
      `${skillName(skill)} | ${t("skillTree.level")} ${current}`,
      `${t("skillTree.current")}: ${dashEffectAt(char, skill.dash, current)}`,
      `${t("skillTree.next")}: ${dashEffectAt(char, skill.dash, current + 1)}`,
      skillEffect(skill),
      t("skillTree.cost", { cost: 1 }),
    ];
  }
  if (skill.zombie?.key === "zombie-hp") {
    const current = zombieHpPoints(char);
    return [
      `${skillName(skill)} | ${t("skillTree.level")} ${current}`,
      `${t("skillTree.current")}: +${current} HP`,
      `${t("skillTree.next")}: +${current + 1} HP`,
      skillEffect(skill),
      t("skillTree.cost", { cost: 1 }),
    ];
  }
  if (skill.zombie?.trait) {
    const learned = char.zombieTrait === skill.zombie.key;
    const locked = !!char.zombieTrait && !learned;
    const next = learned ? t("skillTree.maxed")
      : locked ? t("skillTree.choiceLocked")
        : skill.zombie.implemented ? t("skillTree.learn") : t("skillTree.unavailable");
    return [
      `${skillName(skill)} | ${t("skillTree.level")} ${learned ? 1 : 0}`,
      `${t("skillTree.current")}: ${learned ? t("skillTree.learned") : t("skillTree.notLearned")}`,
      `${t("skillTree.next")}: ${next}`,
      skillEffect(skill),
      t("skillTree.cost", { cost: ZOMBIE_TRAIT_COST }),
    ];
  }
  if (skill.zombie) {
    return [
      skillName(skill),
      `${t("skillTree.current")}: ${t("skillTree.unavailable")}`,
      `${t("skillTree.next")}: ${t("skillTree.unavailable")}`,
      skillEffect(skill),
    ];
  }
  return [t("skillTree.emptySlot")];
}

export function initSkillTreePanel({ getCharacter, getCharacters, onChange, onOpenChange } = {}) {
  const panel = document.getElementById("skillTreePanel");
  const owner = document.getElementById("skillTreeOwner");
  const level = document.getElementById("skillTreeLevel");
  const points = document.getElementById("skillTreePoints");
  const nodes = document.getElementById("skillTreeNodes");
  const detail = document.getElementById("skillTreeDetail");
  const closeButton = document.getElementById("btnSkillTreeClose");
  const levelUpButton = document.getElementById("btnSkillTreeLevelUp");
  const dashGhostN = document.getElementById("dashGhostN");
  const dashResetBtn = document.getElementById("btnDashReset");
  const nodeEls = new Map();
  let selectedSkillId = SKILL_TREE.find((skill) => skill.dash)?.id ?? SKILL_TREE[0].id;

  dashResetBtn?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (!char) return;
    resetDashColors(char);
    onChange?.(char);
    render();
  });

  levelUpButton?.addEventListener("click", () => {
    const char = getCharacter?.();
    const selected = SKILL_BY_ID.get(selectedSkillId);
    if (!upgradeSkill(char, selected, getCharacters?.() ?? [])) return;
    onChange?.(char);
    render();
  });

  for (const skill of SKILL_TREE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-tree-node";
    button.dataset.skillId = skill.id;
    button.style.left = `${skill.x}%`;
    button.style.top = `${skill.y}%`;
    if (skill.dash) {
      button.classList.add("dash-node", `dash-node-${skill.dash.kind}`);
      if (skill.dash.kind === "color") button.style.setProperty("--dash-color", DASH_COLOR_HEX[skill.dash.key]);
      const icon = skill.dash.icon ? `<img class="skill-node-icon" src="${skill.dash.icon}" alt="" draggable="false">` : "";
      button.innerHTML = `${icon}<span class="skill-node-count">0</span>`;
    } else if (skill.zombie) {
      button.classList.add("zombie-node");
      const icon = skill.zombie.icon ? `<img class="skill-node-icon" src="${skill.zombie.icon}" alt="" draggable="false">` : "";
      button.innerHTML = `${icon}<span class="skill-node-count">0</span>`;
    } else {
      button.classList.add("empty-node");
    }
    button.addEventListener("click", () => {
      selectedSkillId = skill.id;
      render();
    });
    nodes.appendChild(button);
    nodeEls.set(skill.id, button);
  }

  function render() {
    if (panel.classList.contains("hidden")) return;
    const char = getCharacter?.();
    if (!char) {
      owner.textContent = t("skillTree.noShrimp");
      level.textContent = "-";
      points.textContent = "0";
      renderSkillDetail(detail, [t("skillTree.unavailable")]);
      if (dashGhostN) dashGhostN.textContent = "0";
      if (dashResetBtn) dashResetBtn.disabled = true;
      if (levelUpButton) levelUpButton.disabled = true;
      for (const button of nodeEls.values()) button.disabled = true;
      return;
    }

    normalizeSkillProgress(char);
    normalizeDashPoints(char);
    const order = Number.isFinite(char.vampireOrder)
      ? t("skillTree.shrimpNumber", { number: char.vampireOrder }) : t("skillTree.shrimp");
    owner.textContent = order;
    level.textContent = String(char.level);
    points.textContent = String(char.skillPoints);
    if (dashGhostN) dashGhostN.textContent = String(dashGhostCount(char.dashColors, effectiveDetectRange(char)));
    if (dashResetBtn) dashResetBtn.disabled = false;

    for (const skill of SKILL_TREE) {
      const button = nodeEls.get(skill.id);
      button.classList.toggle("selected", selectedSkillId === skill.id);
      button.classList.toggle("available", canUpgradeSkill(char, skill));
      if (skill.dash) {
        const current = dashInvested(char, skill.dash);
        const countEl = button.querySelector(".skill-node-count");
        if (countEl) countEl.textContent = String(current);
        button.classList.toggle("invested", current > 0);
        button.classList.remove("locked");
        button.disabled = false;
        button.title = `${skillName(skill)} | ${current}p | ${skillEffect(skill)}`;
        button.setAttribute("aria-label", button.title);
      } else if (skill.zombie) {
        const hpSkill = skill.zombie.key === "zombie-hp";
        const trait = !!skill.zombie.trait;
        const learnedTrait = trait && char.zombieTrait === skill.zombie.key;
        const current = hpSkill ? zombieHpPoints(char) : learnedTrait ? 1 : 0;
        const countEl = button.querySelector(".skill-node-count");
        if (countEl) countEl.textContent = String(current);
        button.disabled = false;
        button.classList.toggle("invested", current > 0);
        button.classList.toggle("locked", (trait && !!char.zombieTrait && !learnedTrait) || (trait && !skill.zombie.implemented));
        const cost = trait ? ` | ${t("skillTree.choiceCost", { cost: ZOMBIE_TRAIT_COST })}` : "";
        button.title = `${skillName(skill)} | ${current}p${cost} | ${skillEffect(skill)}`;
        button.setAttribute("aria-label", button.title);
      } else {
        button.disabled = true;
        button.classList.remove("available", "invested", "locked");
        button.title = t("skillTree.emptySlot");
      }
    }

    const selected = SKILL_BY_ID.get(selectedSkillId) ?? SKILL_TREE[0];
    const canUpgrade = canUpgradeSkill(char, selected);
    renderSkillDetail(detail, skillDetailLines(char, selected));
    if (levelUpButton) {
      levelUpButton.disabled = !canUpgrade;
      levelUpButton.title = canUpgrade ? t("controls.skillLevelUp") : t("skillTree.cannotUpgrade");
    }
  }

  function open() {
    if (!getCharacter?.()) return false;
    panel.classList.remove("hidden");
    onOpenChange?.(true);
    render();
    closeButton.focus({ preventScroll: true });
    return true;
  }

  function close() {
    if (panel.classList.contains("hidden")) return;
    panel.classList.add("hidden");
    onOpenChange?.(false);
  }

  function toggle() {
    return panel.classList.contains("hidden") ? open() : close();
  }

  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return { open, close, toggle, render, isOpen: () => !panel.classList.contains("hidden") };
}
