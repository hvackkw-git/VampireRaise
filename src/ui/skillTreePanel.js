import {
  SKILL_BY_ID, SKILL_TREE, learnSkill, normalizeSkillProgress, skillStatus,
} from "../skills/skillTree.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function statusLabel(status) {
  if (status.state === "learned") return "습득 완료";
  if (status.state === "available") return "습득 가능 · SP 1";
  if (status.state === "level") return `Lv.${status.skill.requiredLevel} 필요`;
  if (status.state === "prerequisite") return "선행 슬롯 필요";
  if (status.state === "points") return "SP 부족";
  return "사용 불가";
}

export function initSkillTreePanel({ getCharacter, onChange, onOpenChange } = {}) {
  const panel = document.getElementById("skillTreePanel");
  const owner = document.getElementById("skillTreeOwner");
  const level = document.getElementById("skillTreeLevel");
  const points = document.getElementById("skillTreePoints");
  const lines = document.getElementById("skillTreeLines");
  const nodes = document.getElementById("skillTreeNodes");
  const detail = document.getElementById("skillTreeDetail");
  const closeButton = document.getElementById("btnSkillTreeClose");
  const nodeEls = new Map();
  const lineEls = [];
  let selectedSkillId = SKILL_TREE[0].id;

  for (const skill of SKILL_TREE) {
    for (const parentId of skill.parents) {
      const parent = SKILL_BY_ID.get(parentId);
      if (!parent) continue;
      const path = document.createElementNS(SVG_NS, "path");
      const midY = (parent.y + skill.y) / 2;
      path.setAttribute("d", `M ${parent.x} ${parent.y} V ${midY} H ${skill.x} V ${skill.y}`);
      path.dataset.from = parent.id;
      path.dataset.to = skill.id;
      lines.appendChild(path);
      lineEls.push(path);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-tree-node";
    button.dataset.skillId = skill.id;
    button.style.left = `${skill.x}%`;
    button.style.top = `${skill.y}%`;
    button.innerHTML = `<span class="skill-node-level">${skill.requiredLevel}</span><span class="skill-node-check" aria-hidden="true">✓</span>`;
    button.addEventListener("click", () => {
      selectedSkillId = skill.id;
      const char = getCharacter?.();
      const result = learnSkill(char, skill.id);
      if (result.learnedNow) onChange?.(char, skill);
      render();
    });
    nodes.appendChild(button);
    nodeEls.set(skill.id, button);
  }

  function render() {
    if (panel.classList.contains("hidden")) return;
    const char = getCharacter?.();
    if (!char) {
      owner.textContent = "선택된 새우 없음";
      level.textContent = "—";
      points.textContent = "0";
      detail.textContent = "스킬 트리 사용 불가";
      for (const button of nodeEls.values()) button.disabled = true;
      return;
    }

    normalizeSkillProgress(char);
    const order = Number.isFinite(char.vampireOrder) ? `${char.vampireOrder}번 새우` : "새우";
    owner.textContent = order;
    level.textContent = String(char.level);
    points.textContent = String(char.skillPoints);
    const learned = new Set(char.learnedSkills);

    for (const skill of SKILL_TREE) {
      const status = skillStatus(char, skill.id);
      const button = nodeEls.get(skill.id);
      button.disabled = false;
      button.classList.toggle("learned", status.state === "learned");
      button.classList.toggle("available", status.state === "available");
      button.classList.toggle("locked", !["learned", "available"].includes(status.state));
      button.classList.toggle("selected", selectedSkillId === skill.id);
      button.title = `${skill.name} · Lv.${skill.requiredLevel} · ${statusLabel(status)}`;
      button.setAttribute("aria-label", button.title);
    }

    for (const path of lineEls) {
      const sourceLearned = learned.has(path.dataset.from);
      const targetLearned = learned.has(path.dataset.to);
      path.classList.toggle("learned", sourceLearned && targetLearned);
      path.classList.toggle("active", sourceLearned && !targetLearned);
    }

    const selected = SKILL_BY_ID.get(selectedSkillId) ?? SKILL_TREE[0];
    const selectedStatus = skillStatus(char, selected.id);
    detail.textContent = `${selected.name} · Lv.${selected.requiredLevel} · ${statusLabel(selectedStatus)}`;
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
