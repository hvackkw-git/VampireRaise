import {
  SKILL_BY_ID, SKILL_TREE, normalizeSkillProgress,
} from "../skills/skillTree.js";
import {
  DASH_COLOR_HEX, dashGhostCount, investDashColor, investDetect, investDashCdMana,
  normalizeDashPoints, resetDashColors, effectiveDetectRange,
  revengeAttackMult, dashDistanceMult, detectRangeMult, dashCdManaMult,
} from "../skills/dashColors.js";
import {
  investZombieHp, investZombieTrait, zombieHpPoints, ZOMBIE_TRAIT_COST,
} from "../skills/zombieSkills.js";
import { t } from "../i18n/index.js";

const skillName = (skill) => t(skill.nameKey, skill.nameVars ?? {});
const skillEffect = (skill) => t((skill.dash ?? skill.zombie)?.effectKey ?? "");

/** dash 스킬의 현재 투자 포인트 */
function dashInvested(char, dash) {
  if (!dash) return 0;
  if (dash.kind === "detect") return char.detectPoints || 0;
  if (dash.kind === "passive") return char.dashCdManaPoints || 0;
  return char.dashColors[dash.key] || 0;
}

/** dash 스킬의 현재 효과값 문자열(구현된 것만 수치, 나머지는 빈 문자열) */
function dashEffectValue(char, dash) {
  if (!dash) return "";
  if (dash.key === "red") return ` · ${t("skillTree.current")} ×${revengeAttackMult(char.dashColors).toFixed(1)}`;
  if (dash.key === "orange") return ` · ${t("skillTree.current")} ×${dashDistanceMult(char.dashColors).toFixed(1)}`;
  if (dash.kind === "detect") {
    return ` · ${t("skillTree.current")} ×${detectRangeMult(char.detectPoints).toFixed(1)} (${Math.round(effectiveDetectRange(char))}px)`;
  }
  if (dash.kind === "passive") {
    return ` · ${t("skillTree.current")} ×${dashCdManaMult(char.dashCdManaPoints).toFixed(1)}`;
  }
  return "";
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
  let selectedSkillId = SKILL_TREE.find((s) => s.dash)?.id ?? SKILL_TREE[0].id;

  dashResetBtn?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (char) { resetDashColors(char); onChange?.(char); render(); }
  });

  levelUpButton?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (!char || char.level >= 50) return;
    char.level = Math.min(50, Math.max(1, Number(char.level) || 1) + 1);
    onChange?.(char);
    render();
  });

  // 노드 생성: dash 슬롯은 색/개수 표시 + 클릭 투자, Jombie Shrimp 슬롯은 표시용, 빈 슬롯은 비활성.
  for (const skill of SKILL_TREE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-tree-node";
    button.dataset.skillId = skill.id;
    button.style.left = `${skill.x}%`;
    button.style.top = `${skill.y}%`;
    if (skill.dash) {
      button.classList.add("dash-node", `dash-node-${skill.dash.kind}`);
      if (skill.dash.kind === "color") {
        button.style.setProperty("--dash-color", DASH_COLOR_HEX[skill.dash.key]);
      }
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
      const char = getCharacter?.();
      if (char && skill.dash) {
        const ok = skill.dash.kind === "detect" ? investDetect(char)
          : skill.dash.kind === "passive" ? investDashCdMana(char)
          : investDashColor(char, skill.dash.key);
        if (ok) onChange?.(char);
      } else if (char && skill.zombie?.key === "zombie-hp") {
        const ok = investZombieHp(char, getCharacters?.() ?? []);
        if (ok) onChange?.(char);
      } else if (char && skill.zombie?.trait && skill.zombie.implemented) {
        const ok = investZombieTrait(char, skill.zombie.key);
        if (ok) onChange?.(char);
      }
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
      level.textContent = "—";
      points.textContent = "0";
      detail.textContent = t("skillTree.unavailable");
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
    const noPoints = char.skillPoints <= 0;
    if (dashGhostN) dashGhostN.textContent = String(dashGhostCount(char.dashColors, effectiveDetectRange(char)));
    if (dashResetBtn) dashResetBtn.disabled = false;
    if (levelUpButton) levelUpButton.disabled = char.level >= 50;

    for (const skill of SKILL_TREE) {
      const button = nodeEls.get(skill.id);
      button.classList.toggle("selected", selectedSkillId === skill.id);
      if (skill.dash) {
        const cur = dashInvested(char, skill.dash);
        const countEl = button.querySelector(".skill-node-count");
        if (countEl) countEl.textContent = String(cur);
        button.classList.toggle("invested", cur > 0);
        button.disabled = noPoints; // 레벨 제한 없음 — 남은 포인트가 없을 때만 비활성
        button.title = `${skillName(skill)} · ${cur}p · ${skillEffect(skill)}`;
        button.setAttribute("aria-label", button.title);
      } else if (skill.zombie) {
        const hpSkill = skill.zombie.key === "zombie-hp";
        const trait = !!skill.zombie.trait;
        const learnedTrait = trait && char.zombieTrait === skill.zombie.key;
        const cur = hpSkill ? zombieHpPoints(char) : learnedTrait ? 1 : 0;
        const countEl = button.querySelector(".skill-node-count");
        if (countEl) countEl.textContent = String(cur);
        if (hpSkill) button.disabled = char.skillPoints <= 0;
        else if (trait) {
          button.disabled = !skill.zombie.implemented || !!char.zombieTrait
            || char.skillPoints < ZOMBIE_TRAIT_COST;
        } else button.disabled = false;
        button.classList.toggle("invested", cur > 0);
        button.classList.toggle("locked", trait && !!char.zombieTrait && !learnedTrait);
        const cost = trait ? ` · ${t("skillTree.choiceCost", { cost: ZOMBIE_TRAIT_COST })}` : "";
        button.title = `${skillName(skill)} · ${cur}p${cost} · ${skillEffect(skill)}`;
        button.setAttribute("aria-label", button.title);
      } else {
        button.disabled = true;
        button.title = t("skillTree.emptySlot");
      }
    }

    const selected = SKILL_BY_ID.get(selectedSkillId) ?? SKILL_TREE[0];
    if (selected.dash) {
      const cur = dashInvested(char, selected.dash);
      detail.textContent = `${skillName(selected)} · ${cur}p${dashEffectValue(char, selected.dash)} — ${skillEffect(selected)}`;
    } else if (selected.zombie) {
      const hpSkill = selected.zombie.key === "zombie-hp";
      const learned = selected.zombie.trait && char.zombieTrait === selected.zombie.key;
      const cur = hpSkill ? zombieHpPoints(char) : learned ? 1 : 0;
      const cost = selected.zombie.trait ? ` · ${t("skillTree.choice", { cost: ZOMBIE_TRAIT_COST })}` : "";
      detail.textContent = `${skillName(selected)} · ${cur}p${cost} — ${skillEffect(selected)}`;
    } else {
      detail.textContent = t("skillTree.emptySlot");
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
