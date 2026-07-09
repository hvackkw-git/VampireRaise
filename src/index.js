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
import { TANK_W, TANK_H } from "./constants.js";
import { createInitialState, loadState, saveState } from "./state/gameState.js";
import { tickCharacter } from "./engine/physics.js";
import { makeIdleDecider, tickAggro } from "./game/ai.js";
import { tickCombat, aliveChars } from "./game/combat.js";
import { tickWaves } from "./game/waves.js";
import {
  initTankView, renderBlocks, renderChars,
  renderCombatEvents, toTankLocal, showToast, spawnFloatText,
} from "./ui/tankView.js";
import { createDecorateMode } from "./decorate/decorateMode.js";
import { initInfoPanel, renderInfoPanel } from "./ui/infoPanel.js";
import { initHud } from "./ui/hud.js";

const state = loadState() ?? createInitialState();
const ui = { decorateMode: false, selectedBlockId: null, selectedCharId: null };

initTankView();
initInfoPanel({ onClose: () => { ui.selectedCharId = null; } });
preloadStatefulBlockSprites();

const decorate = createDecorateMode(state, ui, {});
const hud = initHud(state, {
  onDecorate: () => {
    if (decorate.active) {
      decorate.exit();
    } else {
      ui.selectedCharId = null;
      renderInfoPanel(null);
      decorate.enter();
    }
  },
});

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
  ui.selectedCharId = hit ? hit.id : null;
  renderInfoPanel(hit);
});

// ── 리콜 블록: 60초마다 뱀파이어 진영 1명을 블록 위로 소환 ──
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
  spawnFloatText(recall.x, recall.y - 10, "리콜!", "fx-infect");
}

// ── 메인 루프 ──
const idleDecider = makeIdleDecider(state);
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

  // 2) 감지(인식 원 안의 적에게 접근) → 캐릭터 물리
  tickAggro(state);
  const ctx = { platforms, blockPowered: signals.powered, now: nowMs, rng: Math.random };
  for (const c of chars) tickCharacter(c, ctx, simDt, idleDecider);

  // 3) 전투·전염 → 4) 웨이브
  const combatEvents = tickCombat(state, simDt);
  renderCombatEvents(combatEvents);
  const waveEvents = tickWaves(state, simDt);
  for (const ev of waveEvents) {
    if (ev.type === "clear") showToast(`✅ 웨이브 클리어! +🩸 ${ev.reward}`);
    else if (ev.type === "defeat") showToast("💀 전멸… 웨이브 1부터 다시 시작합니다");
    else if (ev.type === "autostart") showToast(`🌊 웨이브 ${ev.wave} 시작!`);
  }
  tickRecall(gameClock);

  // 5) 렌더
  animAccum += simDt;
  if (animAccum >= 0.12) { animAccum = 0; animFrame++; }
  renderBlocks(state, signals, animFrame, ui);
  renderChars(state, nowMs, ui);

  uiAccum += simDt;
  if (uiAccum >= 0.25 || combatEvents.length || waveEvents.length) {
    uiAccum = 0;
    hud.render();
    const sel = state.chars.items.find((c) => c.id === ui.selectedCharId && !c.dead) ?? null;
    if (!sel) ui.selectedCharId = null;
    renderInfoPanel(sel);
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
