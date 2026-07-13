// src/ui/infoPanel.js
// 하단 상시 패널: 선택 시 [HP/MP/EXP/ATK/ARM/SPD] [장착 스킬] [핫키].
// 계정 레벨·경험치 바는 게임 영역 상단(levelBar)에 별도로 표시된다.
// 표시 대상 캐릭터는 index.js가 결정한다 — 직접 탭한 캐릭터가 있으면 그 캐릭터를 보여주고,
// 없으면(선택 해제 상태) renderSquadPanel로 스탯/데미지/장착 스킬 자리에 생존 Vamp Shrimp
// 얼굴 그리드(5칸)를 대신 보여준다 (핫키는 그대로 유지). 얼굴을 탭하면 그 캐릭터가 선택된다.

import { expToNext, accountExpToNext } from "../constants.js";
import { getLocale, t } from "../i18n/index.js";
import { effectiveArmor, effectiveMoveSpeed } from "../stats/characterStats.js";
import {
  BACKFLIP_ICON, BACKFLIP_SKILL_KEY, backflipCooldown,
  canActivateBackflip, hasBackflipSkill,
} from "../skills/backflip.js";

const SIDE_NAME_KEY = { vampire: "info.vampShrimp", human: "info.holyShrimp", slave: "info.jombieShrimp" };
const FACE_PORTRAIT_SRC = "assets/ui/vampire-shrimp-portrait.png";

/** 스킬 도감 — 장착 스킬 슬롯에 표시할 이름·스프라이트 */
const SKILL_BOOK = {
  dash: { nameKey: "info.dash", icon: "assets/skills/skill_dash.png" },
  [BACKFLIP_SKILL_KEY]: { nameKey: "info.backflip", icon: BACKFLIP_ICON, active: true },
};
const SKILL_SLOT_COUNT = 4;  // 2×2
const FACE_SLOT_COUNT = 5;

const THERMAL_STOPS = [
  { at: 0, hot: [57, 53, 120], core: [22, 23, 61], shadow: [8, 10, 31], rim: [80, 63, 139] },
  { at: 0.2, hot: [107, 73, 166], core: [42, 31, 92], shadow: [15, 16, 48], rim: [128, 82, 176] },
  { at: 0.34, hot: [224, 60, 93], core: [102, 25, 66], shadow: [31, 15, 43], rim: [231, 70, 105] },
  { at: 0.68, hot: [248, 102, 70], core: [157, 37, 52], shadow: [48, 18, 39], rim: [250, 112, 72] },
  { at: 1, hot: [255, 228, 112], core: [238, 63, 39], shadow: [70, 24, 39], rim: [255, 184, 66] },
];

let els = null;
let lastSkillKey = null; // 장착 스킬 재구성 최소화용 캐시 키
let onSelectVampireCb = null;
let onActivateSkillCb = null;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mixRgb(from, to, amount) {
  return from.map((channel, i) => Math.round(channel + (to[i] - channel) * amount));
}

function cssRgb(channels) {
  return `rgb(${channels.join(", ")})`;
}

/** HP를 열화상 팔레트로 변환한다. 고체력은 금빛/적색, 저체력은 어두운 남보라다. */
export function faceThermalPalette(hp, maxHp, dead = false) {
  const safeMax = Number(maxHp);
  const ratio = dead || !(safeMax > 0) ? 0 : clamp01((Number(hp) || 0) / safeMax);
  const upperIndex = THERMAL_STOPS.findIndex((stop) => stop.at >= ratio);
  const upper = THERMAL_STOPS[Math.max(0, upperIndex)];
  const lower = THERMAL_STOPS[Math.max(0, upperIndex - 1)] ?? upper;
  const span = upper.at - lower.at;
  const amount = span > 0 ? (ratio - lower.at) / span : 0;
  const hot = mixRgb(lower.hot, upper.hot, amount);
  const core = mixRgb(lower.core, upper.core, amount);
  const shadow = mixRgb(lower.shadow, upper.shadow, amount);
  const rim = mixRgb(lower.rim, upper.rim, amount);

  return {
    ratio,
    hot: cssRgb(hot),
    core: cssRgb(core),
    shadow: cssRgb(shadow),
    rim: cssRgb(rim),
    glow: `rgba(${rim.join(", ")}, 0.38)`,
  };
}

export function initInfoPanel({ onStats, onSkillTree, onSelectVampire, onActivateSkill } = {}) {
  const $ = (id) => document.getElementById(id);
  els = {
    panel: $("info-panel"),
    acctLevel: $("acctLevel"),
    acctExpFill: $("acctExpFill"),
    acctExpNum: $("acctExpNum"),
    statName: $("statName"),
    statLevel: $("statLevel"),
    hpFill: $("pHpFill"), hpNum: $("pHpNum"),
    mpFill: $("pMpFill"), mpNum: $("pMpNum"),
    expFill: $("pExpFill"), expNum: $("pExpNum"),
    atk: $("pAtk"),
    arm: $("pArm"),
    spd: $("pSpd"),
    skillGrid: $("skillGrid"),
    skillName: $("skillName"),
    faceGrid: $("faceGrid"),
    btnStat: $("btnStat"),
    btnSkillTree: $("btnSkillTree"),
  };
  onSelectVampireCb = onSelectVampire;
  onActivateSkillCb = onActivateSkill;

  els.skillSlots = Array.from({ length: SKILL_SLOT_COUNT }, () => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "skill-slot locked";
    slot.disabled = true;
    els.skillGrid.appendChild(slot);
    return slot;
  });
  els.faceSlots = Array.from({ length: FACE_SLOT_COUNT }, () => {
    const slot = document.createElement("div");
    slot.className = "face-slot empty";
    slot.innerHTML =
      `<button class="face-select-button" type="button">` +
        `<span class="face-hp" aria-hidden="true"><i></i></span>` +
        `<span class="face-screen" aria-hidden="true">` +
          `<span class="face-portrait"><img src="${FACE_PORTRAIT_SRC}" alt="" draggable="false"></span>` +
        `</span>` +
        `<span class="revive-cd"></span>` +
      `</button>` +
      `<span class="face-mini-skills">` +
        `<button type="button"></button>` +
        `<button type="button"></button>` +
        `<button type="button"></button>` +
        `<button type="button"></button>` +
      `</span>`;
    slot._selectButton = slot.querySelector(".face-select-button");
    slot._hpFill = slot.querySelector(".face-hp i");
    slot._reviveCd = slot.querySelector(".revive-cd");
    slot._miniSkills = [...slot.querySelectorAll(".face-mini-skills button")];
    els.faceGrid.appendChild(slot);
    return slot;
  });
  els.btnStat.addEventListener("click", () => onStats?.());
  els.btnSkillTree.addEventListener("click", () => onSkillTree?.());
  lastSkillKey = null;
  return {
    setStatsOpen(open) {
      els.btnStat.classList.toggle("on", open);
      els.btnStat.setAttribute("aria-pressed", String(open));
    },
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

function numberStat(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function stat3(...values) {
  return String(Math.max(0, numberStat(...values))).padStart(3, "0");
}

function renderSkills(char) {
  const equipped = (char?.skills ?? []).filter((s) => SKILL_BOOK[s]);
  const dashCd = Math.max(0, Number(char?._dashCd) || 0);
  const dashCdSec = Math.ceil(dashCd);
  const backflipCd = Math.max(0, Number(char?._backflipCd) || 0);
  const backflipCdSec = Math.ceil(backflipCd);
  const key = `${getLocale()}:${char ? `${char.id}:${char.state}:${equipped.join(",")}:${dashCdSec}:${backflipCdSec}` : "none"}`;
  if (key === lastSkillKey) return;
  lastSkillKey = key;
  els.skillSlots.forEach((slot, i) => {
    const skillKey = equipped[i];
    const skill = SKILL_BOOK[skillKey];
    const name = skill ? t(skill.nameKey) : "";
    const cooldownSec = skillKey === "dash" ? dashCdSec
      : skillKey === BACKFLIP_SKILL_KEY ? backflipCdSec : 0;
    const cooling = cooldownSec > 0;
    slot.classList.toggle("locked", !skill);
    slot.classList.toggle("cooldown", cooling);
    slot.disabled = !skill?.active || !canActivateBackflip(char);
    slot.title = skill ? (cooling ? `${name} · ${cooldownSec}s` : name) : t("info.emptySlot");
    slot.innerHTML = skill
      ? `<img src="${skill.icon}" alt="${name}" draggable="false">${cooling ? `<span class="skill-cd">${cooldownSec}</span>` : ""}`
      : "";
    slot.onclick = skill?.active && char
      ? () => onActivateSkillCb?.(char.id, skillKey)
      : null;
  });
  els.skillName.textContent = equipped.length
    ? equipped.map((s) => t(SKILL_BOOK[s].nameKey)).join(" · ")
    : t("info.noEquippedSkills");
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
    els.statName.textContent = t("info.noVampShrimp");
    els.statLevel.textContent = "";
    setBar(els.hpFill, els.hpNum, 0, 0);
    setBar(els.mpFill, els.mpNum, 0, 0);
    setBar(els.expFill, els.expNum, 0, 0);
    els.atk.textContent = "—";
    els.arm.textContent = "—";
    els.spd.textContent = "—";
    renderSkills(null);
    return;
  }
  const order = Number.isFinite(char.vampireOrder) ? `#${char.vampireOrder} ` : "";
  els.statName.textContent = `${order}${t(SIDE_NAME_KEY[char.side] ?? "info.vampShrimp")}`;
  els.statLevel.textContent = `Lv.${char.level}`;
  setBar(els.hpFill, els.hpNum, char.hp, char.maxHp);
  setBar(els.mpFill, els.mpNum, char.mp ?? 0, char.maxMp ?? 0);
  setBar(els.expFill, els.expNum, char.exp, expToNext(char.level));
  els.atk.textContent = stat3(char.atk);
  els.arm.textContent = stat3(effectiveArmor(char));
  els.spd.textContent = stat3(effectiveMoveSpeed(char));
  renderSkills(char);
}

/**
 * 선택한 캐릭터가 없을 때(탭 해제 상태) 보여주는 화면 — 스탯/데미지/장착 스킬 자리에
 * Vamp Shrimp 얼굴 그리드(5칸)를 대신 띄운다. 얼굴을 탭하면 그 캐릭터가 선택된다.
 * 사망한 Vamp Shrimp도 자기 순서 칸에 그대로 남아, 얼굴 위에 부활까지 남은 초를
 * 카운트다운으로 겹쳐 보여준다(탭 불가). 전멸해도 이 그리드로 부활 시점을 알린다.
 * @param {object[]} vampires Vamp Shrimp 목록(생존·사망 모두)
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
    slot.classList.toggle("dead", !!v && !!v.dead);
    slot._selectButton.disabled = !v || !!v.dead;
    if (v) {
      const order = v.vampireOrder ?? i + 1;
      const palette = faceThermalPalette(v.hp, v.maxHp, v.dead);
      slot.style.setProperty("--face-hot", palette.hot);
      slot.style.setProperty("--face-core", palette.core);
      slot.style.setProperty("--face-shadow", palette.shadow);
      slot.style.setProperty("--face-rim", palette.rim);
      slot.style.setProperty("--face-glow", palette.glow);
      slot._hpFill.style.width = `${palette.ratio * 100}%`;
      const backflipLearned = hasBackflipSkill(v);
      const backflipCd = Math.max(0, Number(v._backflipCd) || 0);
      const backflipCdSec = Math.ceil(backflipCd);
      const backflipButton = slot._miniSkills[0];
      backflipButton.classList.toggle("equipped", backflipLearned);
      backflipButton.classList.toggle("cooldown", backflipLearned && backflipCd > 0);
      backflipButton.disabled = !backflipLearned || !canActivateBackflip(v);
      backflipButton.style.setProperty(
        "--skill-cd",
        `${Math.min(100, (backflipCd / backflipCooldown(v)) * 100)}%`,
      );
      backflipButton.innerHTML = backflipLearned
        ? `<img src="${BACKFLIP_ICON}" alt=""><span>${backflipCdSec > 0 ? backflipCdSec : ""}</span>`
        : "";
      backflipButton.title = backflipLearned
        ? (backflipCdSec > 0 ? `${t("info.backflip")} · ${backflipCdSec}s` : t("info.backflip"))
        : t("info.emptySlot");
      backflipButton.setAttribute("aria-label", backflipButton.title);
      backflipButton.onclick = backflipLearned
        ? (event) => {
            event.stopPropagation();
            onActivateSkillCb?.(v.id, BACKFLIP_SKILL_KEY);
          }
        : null;
      for (const miniSkill of slot._miniSkills.slice(1)) {
        miniSkill.classList.remove("equipped", "cooldown");
        miniSkill.disabled = true;
        miniSkill.innerHTML = "";
        miniSkill.title = t("info.emptySlot");
        miniSkill.setAttribute("aria-label", miniSkill.title);
        miniSkill.onclick = null;
      }
      if (v.dead) {
        const secs = Math.max(0, Math.ceil(Number(v._reviveCd) || 0));
        slot._reviveCd.textContent = secs;
        slot.title = t("info.reviveIn", { number: order, secs });
        slot._selectButton.setAttribute("aria-label", slot.title);
        slot._selectButton.onclick = null;
      } else {
        slot._reviveCd.textContent = "";
        slot.title = `${t("info.numberedVamp", { number: order })} Lv.${v.level}`;
        slot._selectButton.setAttribute(
          "aria-label",
          `${slot.title}, HP ${Math.ceil(Number(v.hp) || 0)}/${Math.ceil(Number(v.maxHp) || 0)}`,
        );
        slot._selectButton.onclick = () => onSelectVampireCb?.(v.id);
      }
    } else {
      slot._hpFill.style.width = "0%";
      slot._reviveCd.textContent = "";
      slot.title = "";
      slot._selectButton.removeAttribute("aria-label");
      slot._selectButton.onclick = null;
      slot._miniSkills.forEach((miniSkill) => {
        miniSkill.classList.remove("equipped", "cooldown");
        miniSkill.disabled = true;
        miniSkill.innerHTML = "";
        miniSkill.title = t("info.emptySlot");
        miniSkill.setAttribute("aria-label", miniSkill.title);
        miniSkill.onclick = null;
      });
    }
  });
}
