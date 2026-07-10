// src/ui/infoPanel.js
// 하단 상시 패널 (1행×4열): [HP/MP/EXP 바] [데미지] [장착 스킬 2×2] [핫키 2×3].
// 계정 레벨·경험치 바는 게임 영역 상단(levelBar)에 별도로 표시된다.
// 표시 대상 캐릭터는 index.js가 결정한다 — 직접 탭한 캐릭터가 있으면 그 캐릭터를 보여주고,
// 없으면(선택 해제 상태) renderSquadPanel로 스탯/데미지/장착 스킬 자리에 생존 뱀파이어
// 얼굴 그리드(2행6열)를 대신 보여준다 (핫키는 그대로 유지). 얼굴을 탭하면 그 캐릭터가 선택된다.

import { expToNext, accountExpToNext } from "../constants.js";

const SIDE_ICON = { vampire: "🧛", human: "🙍", slave: "🧟" };

/** 스킬 도감 — 장착 스킬 슬롯에 표시할 이름·스프라이트 */
const SKILL_BOOK = {
  dash: { name: "혈귀 돌진", icon: "assets/skills/skill_dash.png" },
};
const SKILL_SLOT_COUNT = 4;  // 2×2
const FACE_SLOT_COUNT = 12;  // 2×6

let els = null;
let lastSkillKey = null; // 장착 스킬 재구성 최소화용 캐시 키
let onSelectVampireCb = null;

export function initInfoPanel({ onSkillTree, onSelectVampire } = {}) {
  const $ = (id) => document.getElementById(id);
  els = {
    panel: $("info-panel"),
    acctLevel: $("acctLevel"),
    acctExpFill: $("acctExpFill"),
    acctExpNum: $("acctExpNum"),
    statName: $("statName"),
    hpFill: $("pHpFill"), hpNum: $("pHpNum"),
    mpFill: $("pMpFill"), mpNum: $("pMpNum"),
    expFill: $("pExpFill"), expNum: $("pExpNum"),
    atk: $("pAtk"),
    skillGrid: $("skillGrid"),
    skillName: $("skillName"),
    faceGrid: $("faceGrid"),
    btnSkillTree: $("btnSkillTree"),
  };
  onSelectVampireCb = onSelectVampire;

  els.skillSlots = Array.from({ length: SKILL_SLOT_COUNT }, () => {
    const slot = document.createElement("div");
    slot.className = "skill-slot locked";
    els.skillGrid.appendChild(slot);
    return slot;
  });
  els.faceSlots = Array.from({ length: FACE_SLOT_COUNT }, () => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "face-slot empty";
    slot.disabled = true;
    els.faceGrid.appendChild(slot);
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

function updateLevelBar(account) {
  if (!account) return;
  const need = accountExpToNext(account.level);
  els.acctLevel.textContent = `Lv.${account.level}`;
  els.acctExpFill.style.width =
    `${Math.max(0, Math.min(100, (account.exp / need) * 100))}%`;
  els.acctExpNum.textContent = `${account.exp} / ${need}`;
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
  updateLevelBar(account);
  els.panel.classList.remove("squad-mode");
  els.panel.classList.toggle("no-char", !char);
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
 * 선택한 캐릭터가 없을 때(탭 해제 상태) 보여주는 화면 — 스탯/데미지/장착 스킬 자리에
 * 생존 뱀파이어 얼굴 그리드(2행6열)를 대신 띄운다. 얼굴을 탭하면 그 캐릭터가 선택된다.
 * @param {object[]} vampires 생존 뱀파이어 목록
 * @param {{level:number, exp:number}|null} account 계정 성장 상태 (상단 levelBar)
 */
export function renderSquadPanel(vampires, account = null) {
  updateLevelBar(account);

  if (!vampires.length) {
    renderInfoPanel(null);
    return;
  }

  els.panel.classList.remove("no-char");
  els.panel.classList.add("squad-mode");

  const sorted = [...vampires].sort(
    (a, b) => (a.vampireOrder ?? Infinity) - (b.vampireOrder ?? Infinity),
  );
  els.faceSlots.forEach((slot, i) => {
    const v = sorted[i];
    slot.classList.toggle("empty", !v);
    slot.disabled = !v;
    if (v) {
      slot.innerHTML = `${SIDE_ICON.vampire}<small>${v.vampireOrder ?? i + 1}</small>`;
      slot.title = `${v.vampireOrder ?? i + 1}번 뱀파이어 Lv.${v.level}`;
      slot.onclick = () => onSelectVampireCb?.(v.id);
    } else {
      slot.innerHTML = "";
      slot.title = "";
      slot.onclick = null;
    }
  });
}
