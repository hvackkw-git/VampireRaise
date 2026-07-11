import {
  SKILL_BY_ID, SKILL_TREE, normalizeSkillProgress,
} from "../skills/skillTree.js";
import {
  DASH_COLOR_HEX, dashGhostCount, investDashColor, investDetect,
  normalizeDashPoints, resetDashColors, effectiveDetectRange,
  revengeAttackMult, dashDistanceMult, detectRangeMult,
} from "../skills/dashColors.js";

/** dash 스킬의 현재 투자 포인트 */
function dashInvested(char, dash) {
  if (!dash) return 0;
  return dash.kind === "detect" ? (char.detectPoints || 0) : (char.dashColors[dash.key] || 0);
}

/** dash 스킬의 현재 효과값 문자열(구현된 것만 수치, 나머지는 빈 문자열) */
function dashEffectValue(char, dash) {
  if (!dash) return "";
  if (dash.key === "red") return ` · 현재 ×${revengeAttackMult(char.dashColors).toFixed(1)}`;
  if (dash.key === "orange") return ` · 현재 ×${dashDistanceMult(char.dashColors).toFixed(1)}`;
  if (dash.kind === "detect") {
    return ` · 현재 ×${detectRangeMult(char.detectPoints).toFixed(1)} (${Math.round(effectiveDetectRange(char))}px)`;
  }
  return "";
}

export function initSkillTreePanel({ getCharacter, onChange, onOpenChange } = {}) {
  const panel = document.getElementById("skillTreePanel");
  const owner = document.getElementById("skillTreeOwner");
  const level = document.getElementById("skillTreeLevel");
  const points = document.getElementById("skillTreePoints");
  const nodes = document.getElementById("skillTreeNodes");
  const detail = document.getElementById("skillTreeDetail");
  const closeButton = document.getElementById("btnSkillTreeClose");
  const dashGhostN = document.getElementById("dashGhostN");
  const dashPointsLeft = document.getElementById("dashPointsLeft");
  const dashResetBtn = document.getElementById("btnDashReset");
  const nodeEls = new Map();
  let selectedSkillId = SKILL_TREE.find((s) => s.dash)?.id ?? SKILL_TREE[0].id;

  dashResetBtn?.addEventListener("click", () => {
    const char = getCharacter?.();
    if (char) { resetDashColors(char); onChange?.(char); render(); }
  });

  // 노드 생성: dash 슬롯은 색/개수 표시 + 클릭 투자, 빈 슬롯은 비활성.
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
      button.innerHTML = '<span class="skill-node-count">0</span>';
    } else {
      button.classList.add("empty-node");
    }
    button.addEventListener("click", () => {
      selectedSkillId = skill.id;
      const char = getCharacter?.();
      if (char && skill.dash) {
        const ok = skill.dash.kind === "detect"
          ? investDetect(char)
          : investDashColor(char, skill.dash.key);
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
      owner.textContent = "선택된 새우 없음";
      level.textContent = "—";
      points.textContent = "0";
      detail.textContent = "스킬 트리 사용 불가";
      if (dashGhostN) dashGhostN.textContent = "0";
      if (dashPointsLeft) dashPointsLeft.textContent = "0";
      if (dashResetBtn) dashResetBtn.disabled = true;
      for (const button of nodeEls.values()) button.disabled = true;
      return;
    }

    normalizeSkillProgress(char);
    normalizeDashPoints(char);
    const order = Number.isFinite(char.vampireOrder) ? `${char.vampireOrder}번 새우` : "새우";
    owner.textContent = order;
    level.textContent = String(char.level);
    points.textContent = String(char.skillPoints);
    const noPoints = char.dashPoints <= 0;
    if (dashGhostN) dashGhostN.textContent = String(dashGhostCount(char.dashColors, effectiveDetectRange(char)));
    if (dashPointsLeft) dashPointsLeft.textContent = String(char.dashPoints);
    if (dashResetBtn) dashResetBtn.disabled = false;

    for (const skill of SKILL_TREE) {
      const button = nodeEls.get(skill.id);
      button.classList.toggle("selected", selectedSkillId === skill.id);
      if (skill.dash) {
        const cur = dashInvested(char, skill.dash);
        const countEl = button.querySelector(".skill-node-count");
        if (countEl) countEl.textContent = String(cur);
        button.classList.toggle("invested", cur > 0);
        button.disabled = noPoints; // 레벨 제한 없음 — 남은 포인트가 없을 때만 비활성
        button.title = `${skill.name} · ${cur}p · ${skill.dash.effect}`;
        button.setAttribute("aria-label", button.title);
      } else {
        button.disabled = true;
        button.title = "빈 슬롯";
      }
    }

    const selected = SKILL_BY_ID.get(selectedSkillId) ?? SKILL_TREE[0];
    if (selected.dash) {
      const cur = dashInvested(char, selected.dash);
      detail.textContent = `${selected.name} · ${cur}p${dashEffectValue(char, selected.dash)} — ${selected.dash.effect}`;
    } else {
      detail.textContent = "빈 슬롯";
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
