// src/ui/infoPanel.js
// 캐릭터 정보 패널 (Shrimprium 수질 패널 자리 대체):
// 레벨·직업·경험치·HP·공격력 + 스킬트리 자리(직업 분류 후 개방).

import { expToNext } from "../constants.js";

const SIDE_LABEL = { vampire: "🧛 뱀파이어", human: "🙍 인간", slave: "🧟 노예" };
const SKILL_SLOTS = 5;

let defaultEl, charEl;

export function initInfoPanel() {
  defaultEl = document.getElementById("infoDefault");
  charEl = document.getElementById("infoChar");
}

/**
 * 선택 캐릭터 정보 갱신. char가 null이면 기본 안내.
 * (매 프레임이 아니라 저빈도 호출 — index.js에서 4Hz + 선택 변경 시)
 */
export function renderInfoPanel(char) {
  if (!char || char.dead) {
    defaultEl.classList.remove("hidden");
    charEl.classList.add("hidden");
    return;
  }
  defaultEl.classList.add("hidden");
  charEl.classList.remove("hidden");
  const need = expToNext(char.level);
  const hpPct = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100));
  const expPct = Math.max(0, Math.min(100, (char.exp / need) * 100));
  const skillNodes = Array.from({ length: SKILL_SLOTS }, () => `<div class="skill-node">🔒</div>`).join("");
  charEl.innerHTML = `
    <div class="info-head">
      <span class="info-name">${SIDE_LABEL[char.side] ?? char.side} #${char.id}</span>
      <span class="info-job">Lv.${char.level} · 직업: ${char.job ?? "미분류"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">HP</span>
      <div class="bar bar-hp"><i style="width:${hpPct}%"></i></div>
      <span class="bar-num">${Math.ceil(char.hp)} / ${char.maxHp}</span>
    </div>
    <div class="info-row">
      <span class="info-label">EXP</span>
      <div class="bar bar-exp"><i style="width:${expPct}%"></i></div>
      <span class="bar-num">${char.exp} / ${need}</span>
    </div>
    <div class="info-row">
      <span class="info-label">공격력</span>
      <span>${char.atk}</span>
    </div>
    <div class="info-skill-title">스킬트리</div>
    <div class="skill-tree">${skillNodes}</div>
    <div class="skill-hint">직업 분류 후 개방됩니다</div>
  `;
}
