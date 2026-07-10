// src/ui/tankView.js
// 수조 DOM 렌더링: 블록(신호 상태·애니메이션 반영)·캐릭터(스프라이트/HP바)·플로팅 텍스트.

import {
  getPlatformBlockSpritePath, isLogicLayerBlock, STEALTH_BLOCK_TYPES,
  RGB_BLOCK_TINTS, CONVEYOR_ANIM_FRAMES, HOLE_ANIM_FRAMES,
} from "../platform/platformBlockRenderer.js";
import {
  TANK_W, TANK_H, CHAR_SPRITE, CHAR_SIZE, CHAR_SHEET_FRAMES, DETECT_RANGE,
} from "../constants.js";

const blockEls = new Map(); // platId → { el, img, lastSrc, lastRot }
const charEls = new Map();  // charId → { el, sprite, hpFill, lastSide }

let layerLogic, layerPlatform, layerChars, layerFx, rgbTintEl, tankEl, wrapperEl;
let tankScale = 1;

export function initTankView() {
  tankEl = document.getElementById("tank");
  wrapperEl = document.getElementById("tankWrapper");
  layerLogic = document.getElementById("layerLogic");
  layerPlatform = document.getElementById("layerPlatform");
  layerChars = document.getElementById("layerChars");
  layerFx = document.getElementById("layerFx");
  rgbTintEl = document.getElementById("rgbTint");
  resizeTank();
  window.addEventListener("resize", resizeTank);
}

/** 뷰포트에 맞춰 수조 스케일 조정 — 모든 UI가 수조 내 오버레이라 화면을 꽉 채운다 */
export function resizeTank() {
  const root = document.querySelector(".game-root");
  if (!root || !tankEl || !wrapperEl) return;
  const availW = root.clientWidth;
  const availH = root.clientHeight;
  tankScale = Math.min(availW / TANK_W, availH / TANK_H);
  wrapperEl.style.width = `${TANK_W * tankScale}px`;
  wrapperEl.style.height = `${TANK_H * tankScale}px`;
  tankEl.style.transform = `scale(${tankScale})`;
}

/** 스크린 좌표 → 수조 논리 좌표 */
export function toTankLocal(clientX, clientY) {
  const rect = wrapperEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / tankScale,
    y: (clientY - rect.top) / tankScale,
  };
}

export function getTankEl() { return tankEl; }

/** 분리 십자(bridge) powered 비트마스크: 비트0=가로, 비트1=세로 */
function bridgeMask(poweredDirs, id) {
  const dirs = poweredDirs?.get(id);
  if (!dirs) return 0;
  return (dirs.has("left") || dirs.has("right") ? 1 : 0)
       | (dirs.has("up") || dirs.has("down") ? 2 : 0);
}

/**
 * 블록 렌더 (id 기준 reconcile).
 * @param {object} state
 * @param {{powered:Map, poweredDirs:Map}} signals
 * @param {number} animFrame 컨베이어/소용돌이 애니 프레임 카운터
 * @param {{decorateMode:boolean, selectedBlockId:number|null}} ui
 */
export function renderBlocks(state, signals, animFrame, ui) {
  const items = state.platforms.items;
  const seen = new Set();
  for (const p of items) {
    seen.add(p.id);
    let entry = blockEls.get(p.id);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "plat-block";
      el.dataset.platId = String(p.id);
      const img = document.createElement("img");
      img.draggable = false;
      el.appendChild(img);
      (isLogicLayerBlock(p.blockType) ? layerLogic : layerPlatform).appendChild(el);
      entry = { el, img, lastSrc: "", lastRot: null };
      blockEls.set(p.id, entry);
      if (p.blockType === "recall_block") el.classList.add("recall-tint");
    }
    const powered = p.blockType === "redstone_bridge_block"
      ? bridgeMask(signals.poweredDirs, p.id)
      : !!signals.powered.get(p.id);
    const frame = (p.blockType === "conveyor_block")
      ? animFrame % CONVEYOR_ANIM_FRAMES
      : animFrame % HOLE_ANIM_FRAMES;
    // 스텔스: 숨김 설정 시 신호 OFF면 안 보이고, ON이면 배선만 드러남 (꾸미기 모드에선 항상 표시)
    const stealthSet = !!p.transparentWhenInactive && STEALTH_BLOCK_TYPES.has(p.blockType);
    const stealthActive = stealthSet && !!powered && !ui.decorateMode;
    const visible = ui.decorateMode || !stealthSet || !!powered;
    const src = getPlatformBlockSpritePath(p.blockType, powered, frame, stealthActive);
    if (entry.lastSrc !== src) { entry.img.src = src; entry.lastSrc = src; }
    const rot = Number(p.rotation) || 0;
    if (entry.lastRot !== rot) {
      entry.el.style.transform = rot ? `rotate(${rot}deg)` : "";
      entry.lastRot = rot;
    }
    entry.el.style.left = `${p.x}px`;
    entry.el.style.top = `${p.y}px`;
    entry.el.style.opacity = visible ? (stealthSet && ui.decorateMode ? "0.55" : "1") : "0";
    entry.el.classList.toggle("selected", ui.decorateMode && ui.selectedBlockId === p.id);
  }
  // 제거된 블록 정리
  for (const [id, entry] of blockEls) {
    if (!seen.has(id)) { entry.el.remove(); blockEls.delete(id); }
  }
  renderRgbTint(items, signals);
}

/** RGB 블록: powered인 것들의 색을 섞어 화면 틴트 */
function renderRgbTint(items, signals) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const p of items) {
    const tint = RGB_BLOCK_TINTS[p.blockType];
    if (!tint || !signals.powered.get(p.id)) continue;
    r += tint[0]; g += tint[1]; b += tint[2]; n++;
  }
  if (n === 0) { rgbTintEl.style.opacity = "0"; return; }
  rgbTintEl.style.backgroundColor = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  rgbTintEl.style.opacity = "0.22";
}

/**
 * 캐릭터 렌더.
 * @param {object} state
 * @param {number} nowMs 걷기 애니메이션용
 * @param {{selectedCharId:number|null}} ui
 */
export function renderChars(state, nowMs, ui) {
  const seen = new Set();
  for (const c of state.chars.items) {
    if (c.dead) continue;
    seen.add(c.id);
    let entry = charEls.get(c.id);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "char";
      el.dataset.charId = String(c.id);
      const detect = document.createElement("div"); // 감지 범위 원 (스프라이트 뒤)
      detect.className = "char-detect";
      const sprite = document.createElement("div");
      sprite.className = "char-sprite";
      const hpbar = document.createElement("div");
      hpbar.className = "char-hpbar";
      const hpFill = document.createElement("i");
      hpbar.appendChild(hpFill);
      el.appendChild(detect);
      el.appendChild(sprite);
      el.appendChild(hpbar);
      layerChars.appendChild(el);
      entry = { el, detect, sprite, hpFill, lastSide: null, lastFrame: -1 };
      charEls.set(c.id, entry);
    }
    if (entry.lastSide !== c.side) {
      entry.sprite.style.backgroundImage = `url('${CHAR_SPRITE[c.side]}')`;
      entry.sprite.style.backgroundSize = `${CHAR_SIZE * CHAR_SHEET_FRAMES}px ${CHAR_SIZE}px`;
      entry.el.className = `char side-${c.side}`;
      entry.lastSide = c.side;
      entry.lastFrame = -1;
      // 감지 원: 캐릭터 중심 기준 반경 (진영별, 노예는 작음)
      const r = DETECT_RANGE[c.side] ?? 0;
      entry.detect.style.width = `${r * 2}px`;
      entry.detect.style.height = `${r * 2}px`;
      entry.detect.style.left = `${c.w / 2 - r}px`;
      entry.detect.style.top = `${c.h / 2 - r}px`;
    }
    // FIGHT는 제자리지만 몸싸움 느낌이 나도록 빠르게 프레임을 돌린다
    const moving = Math.abs(c.vx) > 1 || c.state === "CRAWL" || c.state === "JUMP" || c.state === "FIGHT";
    const frame = moving ? Math.floor(nowMs / (c.state === "FIGHT" ? 60 : 90)) % CHAR_SHEET_FRAMES : 0;
    if (entry.lastFrame !== frame) {
      entry.sprite.style.backgroundPosition = `${-frame * CHAR_SIZE}px 0`;
      entry.lastFrame = frame;
    }
    entry.el.style.left = `${c.x}px`;
    entry.el.style.top = `${c.y}px`;
    // 스프라이트 기본 방향: 왼쪽 → 오른쪽 이동 시 좌우 반전
    entry.sprite.style.transform = c.dir > 0 ? "scaleX(-1)" : "";
    entry.el.classList.toggle("stunned", c.state === "STUN");
    entry.el.classList.toggle("selected", ui.selectedCharId === c.id);
    entry.hpFill.style.width = `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%`;
  }
  for (const [id, entry] of charEls) {
    if (!seen.has(id)) { entry.el.remove(); charEls.delete(id); }
  }
}

// ── 핑 마커 (테스트용): 추적당하는 대상 머리 위 ▼, 추적자 진영 색 ──
const pingEls = new Map(); // `${targetId}:${side}` → el

export function renderPings(state) {
  const seen = new Set();
  const byId = new Map(state.chars.items.map((c) => [c.id, c]));
  for (const c of state.chars.items) {
    if (c.dead || !c._ping) continue;
    const t = byId.get(c._ping.targetId);
    if (!t || t.dead) continue;
    const key = `${t.id}:${c.side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let el = pingEls.get(key);
    if (!el) {
      el = document.createElement("span");
      el.className = `ping-mark ping-${c.side}`;
      el.textContent = "▼";
      layerFx.appendChild(el);
      pingEls.set(key, el);
    }
    // 같은 대상에 여러 진영 핑이 찍히면 좌우로 살짝 벌린다
    const offset = c.side === "human" ? 5 : c.side === "slave" ? -5 : 0;
    el.style.left = `${t.x + t.w / 2 - 4 + offset}px`;
    el.style.top = `${t.y - 2}px`;
  }
  for (const [key, el] of pingEls) {
    if (!seen.has(key)) { el.remove(); pingEls.delete(key); }
  }
}

/** 전투 이벤트 → 플로팅 텍스트 */
export function spawnFloatText(x, y, text, cls = "") {
  const span = document.createElement("span");
  span.className = `fx-float ${cls}`;
  span.textContent = text;
  span.style.left = `${x}px`;
  span.style.top = `${y}px`;
  layerFx.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

export function renderCombatEvents(events) {
  for (const ev of events) {
    if (ev.type === "hit") {
      spawnFloatText(ev.target.x + ev.target.w / 2 - 6, ev.target.y - 8, `-${ev.dmg}`);
    } else if (ev.type === "levelup") {
      spawnFloatText(ev.char.x, ev.char.y - 12, "LEVEL UP!", "fx-levelup");
    } else if (ev.type === "infect") {
      spawnFloatText(ev.char.x - 2, ev.char.y - 12, "전염!", "fx-infect");
    }
  }
}

/** 토스트 */
export function showToast(text, ms = 2200) {
  const layer = document.getElementById("toast-layer");
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = text;
  layer.appendChild(div);
  setTimeout(() => {
    div.classList.add("out");
    setTimeout(() => div.remove(), 450);
  }, ms);
}
