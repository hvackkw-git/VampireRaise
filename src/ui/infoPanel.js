// src/ui/infoPanel.js
// 하단 상시 패널 (2행×4열).
// 1행: 계정 레벨·경험치 바 + 유저 ID (전체 폭).
// 2행: [HP/MP/EXP 바] [데미지] [장착 스킬 2×2] [핫키 슬롯].
// 표시 대상 캐릭터는 index.js가 결정한다 — 기본은 생존 뱀파이어 중 순서(vampireOrder)가
// 가장 빠른 캐릭터, 수조에서 캐릭터를 탭하면 그 캐릭터로 전환.

import { expToNext, accountExpToNext } from "../constants.js";

const SIDE_ICON = { vampire: "🧛", human: "🙍", slave: "🧟" };

/** 스킬 도감 — 장착 스킬 슬롯에 표시할 이름·스프라이트 */
const SKILL_BOOK = {
  dash: { name: "혈귀 돌진", icon: "assets/skills/skill_dash.png" },
};
const SKILL_SLOT_COUNT = 4;  // 2×2
const HOTKEY_SLOT_COUNT = 6; // 2×3 — 핫키 기능은 추후 배정

const USER_ID_KEY = "vampireraise.userid.v1";

/** 이 브라우저 고유의 유저 ID — 처음 접속 시 생성해 localStorage에 보관 */
function loadUserId(storage = globalThis.localStorage) {
  let id = null;
  try { id = storage?.getItem(USER_ID_KEY); } catch { /* 무시 */ }
  if (!id) {
    id = "VAMP-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    try { storage?.setItem(USER_ID_KEY, id); } catch { /* 무시 */ }
  }
  return id;
}

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
    hpFill: $("pHpFill"), hpNum: $("pHpNum"),
    mpFill: $("pMpFill"), mpNum: $("pMpNum"),
    expFill: $("pExpFill"), expNum: $("pExpNum"),
    atk: $("pAtk"),
    skillGrid: $("skillGrid"),
    skillName: $("skillName"),
    hotkeyGrid: $("hotkeyGrid"),
  };
  $("acctUserId").textContent = loadUserId();

  els.skillSlots = Array.from({ length: SKILL_SLOT_COUNT }, () => {
    const slot = document.createElement("div");
    slot.className = "skill-slot locked";
    els.skillGrid.appendChild(slot);
    return slot;
  });
  els.hotkeySlots = Array.from({ length: HOTKEY_SLOT_COUNT }, (_, i) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "hotkey-slot";
    if (i === 0) {
      slot.classList.add("assigned");
      slot.title = "스킬 트리";
      slot.setAttribute("aria-label", "핫키 1: 스킬 트리");
      slot.innerHTML = '<span class="hotkey-glyph">✦</span><small>1</small>';
      slot.addEventListener("click", () => onSkillTree?.());
    } else {
      slot.textContent = String(i + 1);
      slot.title = "빈 핫키";
      slot.disabled = true;
    }
    els.hotkeyGrid.appendChild(slot);
    return slot;
  });
  lastSkillKey = null;
  return {
    setSkillTreeOpen(open) {
      els.hotkeySlots[0].classList.toggle("on", open);
      els.hotkeySlots[0].setAttribute("aria-pressed", String(open));
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
 * @param {object|null} char 2행에 비출 캐릭터 (null이면 대상 없음 표시)
 * @param {{level:number, exp:number}|null} account 계정 성장 상태
 */
export function renderInfoPanel(char, account = null) {
  // 1행: 계정
  if (account) {
    const need = accountExpToNext(account.level);
    els.acctLevel.textContent = `Lv.${account.level}`;
    els.acctExpFill.style.width =
      `${Math.max(0, Math.min(100, (account.exp / need) * 100))}%`;
    els.acctExpNum.textContent = `${account.exp} / ${need}`;
  }

  // 2행: 캐릭터
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
