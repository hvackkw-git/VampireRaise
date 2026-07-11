import {
  SKILL_BY_ID, SKILL_TREE, learnSkill, normalizeSkillProgress, skillStatus,
} from "../skills/skillTree.js";
import {
  DASH_COLORS, DASH_COLOR_HEX, dashGhostCount, investDashColor,
  normalizeDashPoints, resetDashColors, effectiveDetectRange,
  revengeAttackMult, dashDistanceMult, detectRangeMult, investDetect,
} from "../skills/dashColors.js";

const DASH_COLOR_LABEL = {
  red: "빨강 · 복수", orange: "주황 · 거리", yellow: "노랑 · 경로데미지",
  green: "초록 · 연타", blue: "파랑 · 폭발", purple: "보라 · 실드", white: "하양 · 스턴",
};

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
  const dashRows = document.getElementById("dashColorRows");
  const dashGhostN = document.getElementById("dashGhostN");
  const dashPointsLeft = document.getElementById("dashPointsLeft");
  const dashResetBtn = document.getElementById("btnDashReset");
  const dashDetectInfo = document.getElementById("dashDetectInfo");
  const detectPlusBtn = document.getElementById("btnDetectPlus");
  const dashCountEls = new Map(); // color → 개수 표시 span
  const dashLabelEls = new Map(); // color → 라벨 span(효과값 갱신용)
  const nodeEls = new Map();
  const lineEls = [];
  let selectedSkillId = SKILL_TREE[0].id;

  // Dash 색상 투자 행: 색별 스와치 + 개수 + "+" 버튼. 레벨 제한 없이 포인트만 있으면 투자.
  for (const color of DASH_COLORS) {
    const row = document.createElement("div");
    row.className = "dash-alloc-row";
    const swatch = document.createElement("span");
    swatch.className = "dash-swatch";
    swatch.style.background = DASH_COLOR_HEX[color];
    const label = document.createElement("span");
    label.className = "dash-alloc-label";
    label.textContent = DASH_COLOR_LABEL[color] ?? color;
    const count = document.createElement("strong");
    count.className = "dash-alloc-count";
    count.textContent = "0";
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "dash-alloc-plus";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `${DASH_COLOR_LABEL[color] ?? color} 투자`);
    plus.addEventListener("click", () => {
      const char = getCharacter?.();
      if (investDashColor(char, color)) { onChange?.(char); render(); }
    });
    row.append(swatch, label, count, plus);
    dashRows?.appendChild(row);
    dashCountEls.set(color, count);
    dashLabelEls.set(color, label);
  }
  detectPlusBtn?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (investDetect(char)) { onChange?.(char); render(); }
  });
  dashResetBtn?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (char && resetDashColors(char) >= 0) { onChange?.(char); render(); }
  });

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

  function renderDashColors(char) {
    const disabled = !char;
    if (dashResetBtn) dashResetBtn.disabled = disabled;
    if (detectPlusBtn) detectPlusBtn.disabled = disabled;
    if (disabled) {
      if (dashGhostN) dashGhostN.textContent = "0";
      if (dashPointsLeft) dashPointsLeft.textContent = "0";
      if (dashDetectInfo) dashDetectInfo.textContent = "×1.0";
      for (const el of dashCountEls.values()) el.textContent = "0";
      for (const row of dashRows?.children ?? []) row.querySelector(".dash-alloc-plus")?.setAttribute("disabled", "");
      return;
    }
    normalizeDashPoints(char);
    const noPoints = char.dashPoints <= 0;
    // 인식범위: 현재 배율 + 실제 반경(px). 포인트가 없을 때만 + 비활성(레벨 제한 없음)
    if (dashDetectInfo) {
      dashDetectInfo.textContent = `×${detectRangeMult(char.detectPoints).toFixed(1)} · ${Math.round(effectiveDetectRange(char))}px`;
    }
    if (detectPlusBtn) detectPlusBtn.disabled = noPoints;
    if (dashGhostN) dashGhostN.textContent = String(dashGhostCount(char.dashColors, effectiveDetectRange(char)));
    if (dashPointsLeft) dashPointsLeft.textContent = String(char.dashPoints);
    for (const color of DASH_COLORS) {
      dashCountEls.get(color).textContent = String(char.dashColors[color] || 0);
    }
    // 빨강·주황은 실제 스킬 효과값을 라벨에 표기(현재 반영값)
    const redLabel = dashLabelEls.get("red");
    if (redLabel) redLabel.textContent = `빨강 · 복수 ×${revengeAttackMult(char.dashColors).toFixed(1)}`;
    const orangeLabel = dashLabelEls.get("orange");
    if (orangeLabel) orangeLabel.textContent = `주황 · 거리 ×${dashDistanceMult(char.dashColors).toFixed(1)}`;
    for (const row of dashRows?.children ?? []) {
      const plus = row.querySelector(".dash-alloc-plus");
      if (plus) plus.disabled = noPoints; // 레벨 제한 없음 — 포인트가 없을 때만 비활성
    }
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
      renderDashColors(null);
      return;
    }

    normalizeSkillProgress(char);
    renderDashColors(char);
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
