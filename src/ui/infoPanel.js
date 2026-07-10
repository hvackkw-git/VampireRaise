// src/ui/infoPanel.js
// 하단 상시 패널 (1행×4열): [HP/MP/EXP 바] [데미지] [장착 스킬 2×2] [핫키 2×3].
// 계정 레벨·경험치 바는 게임 영역 상단(levelBar)에 별도로 표시된다.
// 표시 대상 캐릭터는 index.js가 결정한다 — 직접 탭한 캐릭터가 있으면 그 캐릭터,
// 없으면(선택 해제 상태) renderSquadPanel로 생존 뱀파이어 전체 현황을 보여준다.

import { expToNext, accountExpToNext } from "../constants.js";

const SIDE_ICON = { vampire: "🧛", human: "🙍", slave: "🧟" };

/** 스킬 도감 — 장착 스킬 슬롯에 표시할 이름·스프라이트 */
const SKILL_BOOK = {
  dash: { name: "혈귀 돌진", icon: "assets/skills/skill_dash.png" },
};
const SKILL_SLOT_COUNT = 4;  // 2×2

let els = null;
let lastSkillKey = null; // 장착 스킬 재구성 최소화용 캐시 키

export function initInfoPanel({ onSkillTree } = {}) {
  const $ = (id) => document.getElementById(id);
  els = {
    panel: $("info-panel"),
    acctLevel: $("acctLevel"),
    acctExpFill: $("acctExpFill"),
    acctExpNum: $("acctExpNum"),
    statName: $("statName"),
    statRowExp: $("statRowExp"),
    hpFill: $("pHpFill"), hpNum: $("pHpNum"),
    mpFill: $("pMpFill"), mpNum: $("pMpNum"),
    expFill: $("pExpFill"), expNum: $("pExpNum"),
    atk: $("pAtk"),
    dmgSub: $("dmgSub"),
    skillGrid: $("skillGrid"),
    skillName: $("skillName"),
    btnSkillTree: $("btnSkillTree"),
  };

  els.skillSlots = Array.from({ length: SKILL_SLOT_COUNT }, () => {
    const slot = document.createElement("div");
    slot.className = "skill-slot locked";
    els.skillGrid.appendChild(slot);
    return slot;
  });
  els.btnSkillTree.addEventListener("click", () => onSkillTree?.());
  lastSkillKey = null;
  return {
    setSkillTreeOpen(open) {
      els.btnSkillTree.classList.toggle("on", open);
      els.btnSkillTree.setAttribute("aria-pressed", String(open));
    },
  };
}

function setBar(fill, num, cur, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  fill.style.width = `${pct}%`;
  num.textContent = `${Math.ceil(cur)}/${max}`;
}

function renderSkills(char) {
  const equipped = (char?.skills ?? []).filter((s) => SKILL_BOOK[s]);
  const key = char ? `${char.id}:${equipped.join(",")}` : "none";
  if (key === lastSkillKey) return;
  lastSkillKey = key;
  els.skillSlots.forEach((slot, i) => {
    const skill = SKILL_BOOK[equipped[i]];
    slot.classList.toggle("locked", !skill);
    slot.title = skill ? skill.name : "빈 슬롯";
    slot.innerHTML = skill
      ? `<img src="${skill.icon}" alt="${skill.name}" draggable="false">`
      : "";
  });
  els.skillName.textContent = equipped.length
    ? equipped.map((s) => SKILL_BOOK[s].name).join(" · ")
    : "장착 스킬 없음";
}

/**
 * 패널 갱신 (저빈도 — index.js에서 4Hz + 선택 변경 시).
 * @param {object|null} char 패널에 비출 캐릭터 (null이면 대상 없음 표시)
 * @param {{level:number, exp:number}|null} account 계정 성장 상태 (상단 levelBar)
 */
export function renderInfoPanel(char, account = null) {
  // 상단 levelBar: 계정 레벨·경험치
  if (account) {
    const need = accountExpToNext(account.level);
    els.acctLevel.textContent = `Lv.${account.level}`;
    els.acctExpFill.style.width =
      `${Math.max(0, Math.min(100, (account.exp / need) * 100))}%`;
    els.acctExpNum.textContent = `${account.exp} / ${need}`;
  }

  // 캐릭터 패널
  els.panel.classList.toggle("no-char", !char);
  els.statRowExp.classList.remove("hidden");
  els.dmgSub.textContent = "⚔ 공격력";
  if (!char) {
    els.statName.textContent = "— 뱀파이어 없음 —";
    setBar(els.hpFill, els.hpNum, 0, 0);
    setBar(els.mpFill, els.mpNum, 0, 0);
    setBar(els.expFill, els.expNum, 0, 0);
    els.atk.textContent = "—";
    renderSkills(null);
    return;
  }
  const order = Number.isFinite(char.vampireOrder) ? `${char.vampireOrder}번 ` : "";
  els.statName.textContent =
    `${SIDE_ICON[char.side] ?? ""} ${order}Lv.${char.level}`;
  setBar(els.hpFill, els.hpNum, char.hp, char.maxHp);
  setBar(els.mpFill, els.mpNum, char.mp ?? 0, char.maxMp ?? 0);
  setBar(els.expFill, els.expNum, char.exp, expToNext(char.level));
  els.atk.textContent = String(char.atk);
  renderSkills(char);
}

/**
 * 선택한 캐릭터가 없을 때(탭 해제 상태) 보여주는 뱀파이어 전체 현황 —
 * 스타크래프트에서 여러 유닛을 선택했을 때 나오는 부대 합산 체력·마나 바와 동일한 개념.
 * @param {object[]} vampires 생존 뱀파이어 목록
 * @param {{level:number, exp:number}|null} account 계정 성장 상태 (상단 levelBar)
 */
export function renderSquadPanel(vampires, account = null) {
  if (account) {
    const need = accountExpToNext(account.level);
    els.acctLevel.textContent = `Lv.${account.level}`;
    els.acctExpFill.style.width =
      `${Math.max(0, Math.min(100, (account.exp / need) * 100))}%`;
    els.acctExpNum.textContent = `${account.exp} / ${need}`;
  }

  if (!vampires.length) {
    renderInfoPanel(null);
    return;
  }

  els.panel.classList.remove("no-char");
  els.statRowExp.classList.add("hidden"); // 부대 단위로는 경험치가 무의미
  els.statName.textContent = `🧛 ×${vampires.length}`;
  const sum = (f) => vampires.reduce((s, c) => s + f(c), 0);
  setBar(els.hpFill, els.hpNum, sum((c) => c.hp), sum((c) => c.maxHp));
  setBar(els.mpFill, els.mpNum, sum((c) => c.mp ?? 0), sum((c) => c.maxMp ?? 0));
  els.dmgSub.textContent = "⚔ 총 공격력";
  els.atk.textContent = String(sum((c) => c.atk));
  renderSkills(null);
}
