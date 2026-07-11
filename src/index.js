// src/index.js
// 부트스트랩 + 메인 루프.
// 프레임 순서(Shrimprium과 동일): 캐릭터 밟음 → 신호 그래프 → 타이머/리피터/게이트/센서/피스톤
// → 캐릭터 물리 → 전투 → 웨이브 → 렌더.

import {
  computeCharsOnPlatformIds, computeBlockSignals, getPlatformYRange,
  preloadStatefulBlockSprites, PLATFORM_W,
} from "./platform/platformBlockRenderer.js";
import {
  tickTimers, tickRepeaters, tickGates, tickSensors, tickPistons,
} from "./platform/logicBlocks.js";
import { TANK_W, TANK_H, MP_REGEN_PER_S, VAMPIRE_SPAWN_ZONE } from "./constants.js";
import { createInitialState, loadState, saveState } from "./state/gameState.js";
import { tickCharacter } from "./engine/physics.js";
import { tickAggro } from "./game/ai.js";
import { tickCombat, aliveChars } from "./game/combat.js";
import { tickHumanProjectiles } from "./game/projectiles.js";
import { tickWaves } from "./game/waves.js";
import {
  initTankView, renderBlocks, renderChars, renderPings,
  renderCombatEvents, renderProjectiles, toTankLocal, showToast, spawnFloatText,
  setCoreCounter, setDetectRangesVisible,
} from "./ui/tankView.js";
import { createDecorateMode } from "./decorate/decorateMode.js";
import { initInfoPanel, renderInfoPanel, renderSquadPanel } from "./ui/infoPanel.js";
import { initSkillTreePanel } from "./ui/skillTreePanel.js";
import { initHud } from "./ui/hud.js";
import { applyDocumentTranslations, getLocale, setLocale, t } from "./i18n/index.js";

applyDocumentTranslations();

const state = loadState() ?? createInitialState();
const ui = {
  decorateMode: false,
  selectedBlockId: null,
  selectedCharId: null,
  panelCharId: null,
  showDetectRanges: true,
};

/**
 * 패널 2행이 비출 캐릭터.
 * 직접 탭한 캐릭터가 살아있으면 그 캐릭터, 아니면 생존 Vamp Shrimp 중
 * 순서(vampireOrder)가 가장 빠른 캐릭터 (1번 사망 시 2번, 3번… 자동 전환).
 */
function panelChar() {
  const manual = state.chars.items.find((c) => c.id === ui.selectedCharId && !c.dead);
  if (manual) return manual;
  ui.selectedCharId = null;
  let best = null;
  for (const c of state.chars.items) {
    if (c.dead || c.side !== "vampire") continue;
    if (!best || (c.vampireOrder ?? Infinity) < (best.vampireOrder ?? Infinity)) best = c;
  }
  return best;
}

function updatePanel() {
  const focus = panelChar();
  ui.panelCharId = focus?.id ?? null;
  // ui.selectedCharId는 panelChar()가 직접 탭한 캐릭터일 때만 유지하고,
  // 자동 선택(폴백)인 경우 null로 되돌린다 — 이를 이용해 표시 모드를 가른다.
  if (ui.selectedCharId != null) {
    renderInfoPanel(focus, state.account);
  } else {
    const vampires = state.chars.items.filter((c) => !c.dead && c.side === "vampire");
    renderSquadPanel(vampires, state.account);
  }
  skillTreePanel?.render();
}

initTankView();
preloadStatefulBlockSprites();

const btnDetectRanges = document.getElementById("btnDetectRanges");
const btnAllVampireLevelUp = document.getElementById("btnAllVampireLevelUp");
const btnLanguage = document.getElementById("btnLanguage");

function syncLocaleControls() {
  const korean = getLocale() === "ko";
  btnLanguage.textContent = korean ? "EN" : "KO";
  const languageLabel = t(korean ? "controls.switchEnglish" : "controls.switchKorean");
  btnLanguage.title = languageLabel;
  btnLanguage.setAttribute("aria-label", languageLabel);
  const rangeLabel = t(ui.showDetectRanges ? "controls.hideRanges" : "controls.showRanges");
  btnDetectRanges.title = rangeLabel;
  btnDetectRanges.setAttribute("aria-label", rangeLabel);
}

btnDetectRanges.addEventListener("click", () => {
  ui.showDetectRanges = !ui.showDetectRanges;
  setDetectRangesVisible(ui.showDetectRanges);
  btnDetectRanges.classList.toggle("on", ui.showDetectRanges);
  btnDetectRanges.setAttribute("aria-pressed", String(ui.showDetectRanges));
  const label = t(ui.showDetectRanges ? "controls.hideRanges" : "controls.showRanges");
  btnDetectRanges.setAttribute("aria-label", label);
  btnDetectRanges.title = label;
});

btnAllVampireLevelUp.addEventListener("click", () => {
  let changed = 0;
  for (const char of state.chars.items) {
    if (char.side !== "vampire" || char.level >= 50) continue;
    char.level = Math.min(50, Math.max(1, Number(char.level) || 1) + 1);
    changed++;
  }
  if (changed === 0) {
    showToast(t("events.allMaxLevel"));
    return;
  }
  saveState(state);
  updatePanel();
  showToast(t("events.levelAll", { count: changed }));
});

let hud = null;
const decorate = createDecorateMode(state, ui, { onExit: () => hud?.render() });
let skillTreePanel = null;
const infoPanel = initInfoPanel({
  onSkillTree: () => {
    if (decorate.active) decorate.exit();
    skillTreePanel?.toggle();
  },
  onSelectVampire: (id) => {
    ui.selectedCharId = id;
    updatePanel();
  },
});
skillTreePanel = initSkillTreePanel({
  getCharacter: panelChar,
  getCharacters: () => state.chars.items,
  onChange: () => {
    saveState(state);
    updatePanel();
  },
  onOpenChange: (open) => {
    ui.skillTreeOpen = open;
    infoPanel.setSkillTreeOpen(open);
  },
});
hud = initHud(state, {
  onDecorate: () => {
    skillTreePanel.close();
    if (decorate.active) {
      decorate.exit();
    } else {
      if (state.wave.active) {
        showToast(t("hud.decorateAfterWave"));
        return;
      }
      state.wave.auto = false;
      state.wave.nextAutoAt = null;
      ui.selectedCharId = null;
      updatePanel();
      decorate.enter();
    }
    hud?.render();
  },
  onReset: () => {
    skillTreePanel.close();
    if (decorate.active) decorate.exit();
    ui.selectedCharId = null;
    ui.selectedBlockId = null;
    updatePanel();
  },
  getBlockPowered: () => {
    const chars = aliveChars(state);
    const onPlatforms = computeCharsOnPlatformIds(state.platforms.items, chars);
    return computeBlockSignals(state.platforms.items, onPlatforms).powered;
  },
  isDecorating: () => decorate.active,
});

btnLanguage.addEventListener("click", () => {
  setLocale(getLocale() === "en" ? "ko" : "en");
  applyDocumentTranslations();
  syncLocaleControls();
  decorate.refreshLocale();
  hud.render();
  updatePanel();
});
syncLocaleControls();

updatePanel(); // 첫 페인트 — 이후는 4Hz 갱신

// ── 캐릭터 탭 선택 (일반 모드) ──
document.getElementById("tank").addEventListener("pointerdown", (ev) => {
  if (ui.decorateMode) return;
  if (ev.target.closest?.(".ui-overlay")) return; // 오버레이 UI 탭은 수조 입력 아님
  const local = toTankLocal(ev.clientX, ev.clientY);
  let hit = null, hitD = Infinity;
  for (const c of aliveChars(state)) {
    const PAD = 6; // 터치 여유
    if (local.x >= c.x - PAD && local.x <= c.x + c.w + PAD
      && local.y >= c.y - PAD && local.y <= c.y + c.h + PAD) {
      const d = Math.hypot(local.x - (c.x + c.w / 2), local.y - (c.y + c.h / 2));
      if (d < hitD) { hit = c; hitD = d; }
    }
  }
  // 탭한 캐릭터로 패널 전환, 빈 곳 탭이면 기본(1번 Vamp Shrimp)으로 복귀
  ui.selectedCharId = hit ? hit.id : null;
  updatePanel();
});

// ── 리콜 블록: 60초마다 Vamp Shrimp 진영 1명을 블록 위로 소환 ──
let recallNextAt = 60;
function tickRecall(gameClock, rng = Math.random) {
  if (gameClock < recallNextAt) return;
  recallNextAt = gameClock + 60;
  const recall = state.platforms.items.find((p) => p.blockType === "recall_block");
  if (!recall) return;
  const pool = aliveChars(state).filter((c) => c.side !== "human");
  if (pool.length === 0) return;
  const c = pool[Math.floor(rng() * pool.length)];
  c.x = recall.x + PLATFORM_W / 2 - c.w / 2;
  c.y = recall.y - c.h - 2;
  c.vx = 0; c.vy = 0;
  c._platformId = null;
  c.state = "FALL";
  spawnFloatText(recall.x, recall.y - 10, t("events.recall"), "fx-infect");
}

// ── 메인 루프 ──
const yBounds = { ...getPlatformYRange(TANK_H), tankW: TANK_W };
let lastFrameMs = performance.now();
let gameClock = 0;
let uiAccum = 0;      // HUD/패널 저빈도 갱신
let saveAccum = 0;    // 자동 저장
let animAccum = 0;    // 블록 애니 프레임
let animFrame = 0;

function frame(nowMs) {
  const simDt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  gameClock += simDt;

  const platforms = state.platforms.items;
  const chars = aliveChars(state);

  // 1) 밟음 판정 → 신호 그래프 → 로직 블록 상태 갱신
  const charsOn = computeCharsOnPlatformIds(platforms, chars);
  const signals = computeBlockSignals(platforms, charsOn);
  tickTimers(platforms, nowMs);
  tickRepeaters(platforms, signals.repeaterInputs, nowMs);
  tickGates(platforms, signals.gateInputs);
  tickSensors(platforms, {
    vampireCount: chars.filter((c) => c.side === "vampire").length,
  });
  tickPistons(platforms, signals.powered, yBounds);

  // 2) 감지·핑 추적(1초 갱신) → 캐릭터 물리
  const dashEvents = tickAggro(state, simDt, Math.random, signals.powered, nowMs);
  const ctx = { platforms, blockPowered: signals.powered, now: nowMs, rng: Math.random };
  for (const c of chars) {
    tickCharacter(c, ctx, simDt);
    // MP 자연 재생 (돌진 등 스킬 사용으로 소모)
    if (c.maxMp) c.mp = Math.min(c.maxMp, (c.mp ?? c.maxMp) + MP_REGEN_PER_S * simDt);
  }

  // 3) 투사체 → 전투·전염 → 4) 웨이브
  const projectileEvents = tickHumanProjectiles(state, simDt);
  const combatEvents = tickCombat(state, simDt);
  renderCombatEvents([...dashEvents, ...projectileEvents, ...combatEvents]);
  const waveEvents = tickWaves(state, simDt, Math.random, signals.powered);
  for (const ev of waveEvents) {
    if (ev.type === "clear") showToast(t("events.waveClear", { reward: ev.reward }));
    else if (ev.type === "defeat") showToast(t("events.defeat"));
    else if (ev.type === "autostart") showToast(t("hud.waveStart", { wave: ev.wave }));
    else if (ev.type === "acctlevel") showToast(t("events.accountLevel", { level: ev.level }));
    else if (ev.type === "routeblocked") showToast(t("events.routeBlocked"));
    else if (ev.type === "invade") {
      spawnFloatText(VAMPIRE_SPAWN_ZONE.x + VAMPIRE_SPAWN_ZONE.w / 2 - 6,
        VAMPIRE_SPAWN_ZONE.y - 8, `-1`, "fx-infect");
    } else if (ev.type === "gameover") {
      showToast(t("events.gameOver"));
    }
  }
  setCoreCounter(state.core.hp);
  tickRecall(gameClock);

  // 5) 렌더
  animAccum += simDt;
  if (animAccum >= 0.12) { animAccum = 0; animFrame++; }
  renderBlocks(state, signals, animFrame, ui);
  renderChars(state, nowMs, ui);
  renderProjectiles(state);
  renderPings(state);

  uiAccum += simDt;
  if (uiAccum >= 0.25 || projectileEvents.length || combatEvents.length || waveEvents.length) {
    uiAccum = 0;
    hud.render();
    updatePanel();
  }

  saveAccum += simDt;
  if (saveAccum >= 5) { saveAccum = 0; saveState(state); }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 떠날 때 저장
window.addEventListener("beforeunload", () => saveState(state));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveState(state);
});
