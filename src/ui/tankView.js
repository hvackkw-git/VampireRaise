// src/ui/tankView.js
// 수조 DOM 렌더링: 블록(신호 상태·애니메이션 반영)·캐릭터(스프라이트/HP바)·플로팅 텍스트.

import {
  getPlatformBlockSpritePath, isLogicLayerBlock, STEALTH_BLOCK_TYPES,
  RGB_BLOCK_TINTS, CONVEYOR_ANIM_FRAMES, HOLE_ANIM_FRAMES,
} from "../platform/platformBlockRenderer.js";
import {
  TANK_W, TANK_H, PANEL_H, CHAR_SPRITES, HUMAN_PROJECTILE_RADIUS,
  HUMAN_SPAWN_ZONE, VAMPIRE_SPAWN_ZONE,
  ATTACK_RAISE_S, ATTACK_SLAM_S, ATTACK_RAISE_DEG,
} from "../constants.js";
import { t } from "../i18n/index.js";
import { DASH_COLOR_HEX, effectiveDetectRange } from "../skills/dashColors.js";
import { auraTierForLevel, auraStyleForTier } from "../skills/shrimpAura.js";

const blockEls = new Map(); // platId → { el, img, lastSrc, lastRot }
const charEls = new Map();  // charId → { el, sprite, hpFill, lastSide }
const projectileEls = new Map(); // projectileId → el

/** 논리 캔버스 높이 = 수조(640) + 패널 영역(150) — Shrimprium 320×670 방식 */
const CANVAS_H = TANK_H + PANEL_H;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 논리 32px 박스가 아닌 실제 새우 몸통의 화면 중심/상단. */
function visualBounds(c) {
  const cfg = CHAR_SPRITES[c.side];
  const topPad = cfg?.topPad ?? 0;
  const size = cfg?.size ?? c.h;
  return {
    x: c.x + c.w / 2,
    y: c.y + topPad + (size - topPad) / 2,
    top: c.y + topPad,
  };
}

/** Vamp Shrimp(빨간새우)는 Holy/Jombie Shrimp보다 항상 앞에 보이도록 별도 z 밴드를 쓴다. */
function swingAngle(c) {
  if (c.side !== "vampire" || !c._swinging) return 0;
  const t = Math.max(0, Number(c._swingT) || 0);
  if (t <= ATTACK_RAISE_S) return (t / ATTACK_RAISE_S) * ATTACK_RAISE_DEG;
  const slamT = Math.min(1, (t - ATTACK_RAISE_S) / ATTACK_SLAM_S);
  return (1 - slamT) * ATTACK_RAISE_DEG;
}

function charZIndex(c) {
  const yOrder = Math.max(0, Math.min(9999, Math.round(Number(c?.y) || 0)));
  return (c?.side === "vampire" ? 20000 : 10000) + yOrder;
}

let layerLogic, layerPlatform, layerChars, layerFx, rgbTintEl, tankEl, canvasEl, canvasWrapperEl;
let uiScale = 1;

export function initTankView() {
  tankEl = document.getElementById("tank");
  canvasEl = document.getElementById("gameCanvas");
  canvasWrapperEl = document.getElementById("canvasWrapper");
  layerLogic = document.getElementById("layerLogic");
  layerPlatform = document.getElementById("layerPlatform");
  layerChars = document.getElementById("layerChars");
  layerFx = document.getElementById("layerFx");
  rgbTintEl = document.getElementById("rgbTint");
  renderSpawnZones();
  resizeTank();
  window.addEventListener("resize", resizeTank);
}

/** 테스트용 감지 범위 표시를 수조 전체에서 즉시 토글한다. */
export function setDetectRangesVisible(visible) {
  tankEl?.classList.toggle("detect-ranges-hidden", !visible);
}

let coreCounterEl = null;

/**
 * 스폰 존 표시: 오른쪽 위(Holy Shrimp)·왼쪽 아래(Vamp Shrimp)에 2×2 크기의 하얀 네모를
 * 배경 위·캐릭터 아래 레이어(layerLogic 앞)에 한 번만 그린다. 순수 시각 마커.
 * Vamp Shrimp 존 가운데에는 베이스 코어 숫자를 표시한다.
 */
function renderSpawnZones() {
  const layer = document.createElement("div");
  layer.className = "spawn-zone-layer";
  for (const [zone, side] of [[HUMAN_SPAWN_ZONE, "human"], [VAMPIRE_SPAWN_ZONE, "vampire"]]) {
    const el = document.createElement("div");
    el.className = `spawn-zone spawn-zone-${side}`;
    el.style.left = `${zone.x}px`;
    el.style.top = `${zone.y}px`;
    el.style.width = `${zone.w}px`;
    el.style.height = `${zone.h}px`;
    if (side === "vampire") {
      coreCounterEl = document.createElement("span");
      coreCounterEl.className = "spawn-zone-core";
      el.appendChild(coreCounterEl);
    }
    layer.appendChild(el);
  }
  // tank-bg 바로 뒤에 삽입해 블록/캐릭터가 그 위에 그려지도록 맨 앞쪽(첫 자식 다음)에 둔다.
  tankEl.insertBefore(layer, layerLogic);
}

/** 베이스 코어 숫자 갱신 (Vamp Shrimp 존 가운데). 얼마 안 남으면 위험 색으로 표시. */
export function setCoreCounter(hp) {
  if (!coreCounterEl) return;
  const v = String(Math.max(0, Math.round(hp)));
  if (coreCounterEl.textContent !== v) coreCounterEl.textContent = v;
  coreCounterEl.classList.toggle("low", hp <= 5);
}

/** 뷰포트에 맞춰 논리 캔버스(수조+패널) 전체를 한 스케일로 조정 */
export function resizeTank() {
  const root = document.querySelector(".game-root");
  if (!root || !canvasEl || !canvasWrapperEl) return;
  const availW = root.clientWidth;
  const availH = root.clientHeight;
  uiScale = Math.min(availW / TANK_W, availH / CANVAS_H);
  canvasWrapperEl.style.width = `${TANK_W * uiScale}px`;
  canvasWrapperEl.style.height = `${CANVAS_H * uiScale}px`;
  canvasEl.style.transform = `scale(${uiScale})`;
}

/** 스크린 좌표 → 수조 논리 좌표 */
export function toTankLocal(clientX, clientY) {
  const rect = tankEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / uiScale,
    y: (clientY - rect.top) / uiScale,
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
      const aura = document.createElement("div"); // 레벨 오러 (스프라이트 뒤, 맨 뒤)
      aura.className = "char-aura";
      const detect = document.createElement("div"); // 감지 범위 원 (스프라이트 뒤)
      detect.className = "char-detect";
      const sprite = document.createElement("div");
      sprite.className = "char-sprite";
      const pattern = document.createElement("div");
      pattern.className = "char-pattern";
      pattern.hidden = true;
      const hpbar = document.createElement("div");
      hpbar.className = "char-hpbar";
      const hpFill = document.createElement("i");
      hpbar.appendChild(hpFill);
      const shield = document.createElement("div"); // 보라 실드 오라 (지속 중 표시)
      shield.className = "char-shield";
      el.appendChild(aura);
      el.appendChild(detect);
      el.appendChild(shield);
      el.appendChild(sprite);
      el.appendChild(pattern);
      el.appendChild(hpbar);
      layerChars.appendChild(el);
      entry = {
        el, aura, detect, sprite, pattern, hpFill, shield,
        lastSide: null, lastFrame: -1, lastPattern: undefined,
        shieldOn: false, lastAuraTier: -1,
      };
      charEls.set(c.id, entry);
    }
    const cfg = CHAR_SPRITES[c.side];
    if (entry.lastSide !== c.side) {
      entry.el.style.width = `${cfg.size}px`;
      entry.el.style.height = `${cfg.size}px`;
      entry.sprite.style.top = `${cfg.topPad}px`;
      entry.sprite.style.height = `${cfg.size - cfg.topPad}px`;
      entry.sprite.style.backgroundImage = `url('${cfg.src}')`;
      entry.sprite.style.backgroundSize = `${cfg.size * cfg.frames}px ${cfg.size}px`;
      entry.pattern.style.top = `${cfg.topPad}px`;
      entry.pattern.style.height = `${cfg.size - cfg.topPad}px`;
      entry.pattern.style.backgroundSize = `${cfg.size * cfg.frames}px ${cfg.size}px`;
      entry.el.className = `char side-${c.side}`;
      entry.lastSide = c.side;
      entry.lastFrame = -1;
      entry.lastDetectR = -1; // 진영 바뀌면 감지 원 갱신 강제
    }
    const poisonStacks = Math.max(0, Math.min(5, Math.floor(Number(c.poisonStacks) || 0)));
    let patternFile = "";
    let patternOpacity = 1;
    if (poisonStacks > 0) {
      patternFile = "assets/shrimp_variants/zombie-speckle.png";
      patternOpacity = 0.5 + poisonStacks * 0.1;
    } else if (c.side === "slave") {
      if (c.zombiePattern === "RILI_YELLOW") {
        patternFile = "assets/shrimp_variants/zombie-rili-yellow.png";
      } else if (c.zombiePattern === "RILI_RED_POISON") {
        patternFile = "assets/shrimp_variants/zombie-rili.png";
      } else if (c.zombiePattern === "RILI_BLACK") {
        patternFile = "assets/shrimp_variants/zombie-rili-black.png";
      }
    }
    const patternKey = `${patternFile}:${patternOpacity}`;
    if (entry.lastPattern !== patternKey) {
      entry.lastPattern = patternKey;
      entry.pattern.hidden = !patternFile;
      entry.pattern.style.backgroundImage = patternFile ? `url('${patternFile}')` : "";
      entry.pattern.style.opacity = String(patternOpacity);
    }
    // 감지 원: 캐릭터 중심 기준 반경. Vamp Shrimp는 인식범위 스킬로 커지므로 변할 때마다 갱신.
    const r = effectiveDetectRange(c);
    if (entry.lastDetectR !== r) {
      entry.lastDetectR = r;
      entry.detect.style.width = `${r * 2}px`;
      entry.detect.style.height = `${r * 2}px`;
      entry.detect.style.left = `${cfg.size / 2 - r}px`;
      entry.detect.style.top = `${cfg.size / 2 - r}px`;
    }
    entry.detect.hidden = ui.showDetectRanges === false;
    // 레벨 오러는 Vamp Shrimp 전용. Holy/Jombie Shrimp는 표시와 애니메이션을 모두 끈다.
    const auraEnabled = c.side === "vampire";
    entry.aura.hidden = !auraEnabled;
    if (auraEnabled) {
      const auraTier = auraTierForLevel(c.level);
      if (entry.lastAuraTier !== auraTier) {
        entry.lastAuraTier = auraTier;
        const a = auraStyleForTier(auraTier);
        const st = entry.aura.style;
        st.setProperty("--aura-row", `${-a.row * 64}px`);
        st.setProperty("--aura-duration", `${a.duration}s`);
      }
    }
    // FIGHT/DASH는 빠르게 프레임을 돌려 몸싸움·질주 느낌을 낸다
    const moving = Math.abs(c.vx) > 1 || c.state === "CRAWL" || c.state === "JUMP"
      || c.state === "FIGHT" || c.state === "DASH";
    const fast = c.state === "FIGHT" || c.state === "DASH";
    // 캐릭터별 걷기 위상 오프셋: 겹쳐 있어도 다리 프레임이 서로 어긋나 "여러 마리"로
    // 읽히게 한다(전원 같은 프레임이면 겹쳤을 때 한 마리처럼 보임). c.id로 고정.
    const phase = ((c.id % cfg.frames) + cfg.frames) % cfg.frames;
    const frame = moving ? (Math.floor(nowMs / (fast ? 60 : 90)) + phase) % cfg.frames : 0;
    if (entry.lastFrame !== frame) {
      const framePosition = `${-frame * cfg.size}px ${-cfg.topPad}px`;
      entry.sprite.style.backgroundPosition = framePosition;
      entry.pattern.style.backgroundPosition = framePosition;
      entry.lastFrame = frame;
    }
    entry.el.style.left = `${c.x}px`;
    entry.el.style.top = `${c.y}px`;
    entry.el.style.zIndex = String(charZIndex(c));
    // 스프라이트 기본 방향: 왼쪽 → 오른쪽 이동 시 좌우 반전. Vamp Shrimp는 slam 스윙 회전을 합성한다.
    const ang = swingAngle(c);
    const flip = c.dir > 0 ? "scaleX(-1) " : "";
    const signedAng = c.dir > 0 ? -ang : ang;
    entry.sprite.style.transform = `${flip}rotate(${signedAng}deg)`.trim();
    entry.pattern.style.transform = entry.sprite.style.transform;
    entry.el.classList.toggle("stunned", c.state === "STUN");
    // 보라 실드 오라: 지속(_shieldT>0) 동안 표시, 남은 흡수량을 세기로 반영
    const shieldOn = (c._shieldT ?? 0) > 0 && (c._shieldHp ?? 0) > 0;
    if (shieldOn !== entry.shieldOn) {
      entry.shield.classList.toggle("on", shieldOn);
      entry.shieldOn = shieldOn;
    }
    if (shieldOn && c._shieldMax) {
      entry.shield.style.opacity = String(0.35 + 0.5 * (c._shieldHp / c._shieldMax));
    }
    // 자동 패널 대상에는 선택 표시를 띄우지 않고, 직접 탭한 캐릭터만 표시한다.
    entry.el.classList.remove("focused");
    entry.el.classList.toggle("selected", ui.selectedCharId === c.id);
    entry.hpFill.style.width = `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%`;
    // 돌진 잔상: 45ms 간격으로 고스트를 남긴다. 색은 이번 돌진의 사이클을 스폰 순서대로
    // 반복해 칠한다(k번째 잔상 = cycle[k % len]) — 예) 빨6·노3 → [빨,빨,노] → 빨빨노빨빨노….
    // 새 돌진마다 사이클 처음(빨강)부터 다시 돈다.
    const dashing = c.state === "DASH";
    if (dashing && !entry.wasDashing) entry.ghostIdx = 0; // 새 돌진 시작 → 사이클 처음부터
    entry.wasDashing = dashing;
    if (dashing && nowMs - (entry.lastGhostAt ?? 0) > 45) {
      entry.lastGhostAt = nowMs;
      const cyc = c._dashCycle?.length ? c._dashCycle : ["red"];
      const colorKey = cyc[(entry.ghostIdx ?? 0) % cyc.length];
      entry.ghostIdx = (entry.ghostIdx ?? 0) + 1;
      spawnDashGhost(c, entry, DASH_COLOR_HEX[colorKey] ?? DASH_COLOR_HEX.red);
    }
  }
  for (const [id, entry] of charEls) {
    if (!seen.has(id)) { entry.el.remove(); charEls.delete(id); }
  }
}

/**
 * 돌진 잔상: 현재 스프라이트 실루엣을 지정 색으로 칠해 페이드아웃.
 * background-image 대신 CSS mask(스프라이트 프레임) + background-color로 임의 색을 낸다.
 */
function spawnDashGhost(c, entry, color) {
  const g = document.createElement("div");
  g.className = "char-ghost";
  g.style.width = `${c.w}px`;
  g.style.height = `${c.h}px`;
  const cfg = CHAR_SPRITES[c.side];
  const img = entry.sprite.style.backgroundImage;
  const size = entry.sprite.style.backgroundSize;
  // 본체는 실제 14px 높이로 잘라 그리지만 잔상은 변경 전과 같은 32px 원본 마스크를
  // 사용한다. 본체의 -topPad 위치를 복사하면 잔상이 c.y보다 18px 위로 올라간다.
  const pos = `${-(entry.lastFrame ?? 0) * cfg.size}px 0px`;
  g.style.backgroundColor = color;
  g.style.webkitMaskImage = img;
  g.style.maskImage = img;
  g.style.webkitMaskSize = size;
  g.style.maskSize = size;
  g.style.webkitMaskPosition = pos;
  g.style.maskPosition = pos;
  g.style.webkitMaskRepeat = "no-repeat";
  g.style.maskRepeat = "no-repeat";
  g.style.transform = entry.sprite.style.transform;
  g.style.left = `${c.x}px`;
  g.style.top = `${c.y}px`;
  layerFx.appendChild(g);
  g.addEventListener("animationend", () => g.remove());
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
    // 대상이 수조 밖(예: 상단에서 낙하 중인 Holy Shrimp, y<0)이거나 가장자리에 있어도
    // 핑이 잘려 사라지지 않도록 화면 안으로 클램프한다.
    // 상단 여백 4px는 ping-bob 애니메이션(-3px)까지 감안한 값.
    const PING_W = 8, PING_H = 8;
    const left = clamp(t.x + t.w / 2 - 4 + offset, 0, TANK_W - PING_W);
    const top = clamp(visualBounds(t).top - PING_H, 4, TANK_H - PING_H);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  for (const [key, el] of pingEls) {
    if (!seen.has(key)) { el.remove(); pingEls.delete(key); }
  }
}


export function renderProjectiles(state) {
  const items = state.projectiles?.items ?? [];
  const seen = new Set();
  for (const p of items) {
    seen.add(p.id);
    let el = projectileEls.get(p.id);
    if (!el) {
      el = document.createElement("span");
      el.className = `projectile projectile-${p.side}`;
      layerFx.appendChild(el);
      projectileEls.set(p.id, el);
    }
    const r = HUMAN_PROJECTILE_RADIUS;
    el.style.width = `${r * 2}px`;
    el.style.height = `${r * 2}px`;
    el.style.left = `${p.x - r}px`;
    el.style.top = `${p.y - r}px`;
  }
  for (const [id, el] of projectileEls) {
    if (!seen.has(id)) { el.remove(); projectileEls.delete(id); }
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
    if (ev.type === "hit" || ev.type === "projectileHit") {
      const v = visualBounds(ev.target);
      spawnFloatText(v.x - 6, v.top - 8, `-${ev.dmg}`);
    } else if (ev.type === "levelup") {
      const v = visualBounds(ev.char);
      spawnFloatText(ev.char.x, v.top - 12, "LEVEL UP!", "fx-levelup");
    } else if (ev.type === "infect") {
      const v = visualBounds(ev.char);
      spawnFloatText(ev.char.x - 2, v.top - 12, t("events.infect"), "fx-infect");
    } else if (ev.type === "slam") {
      const c = ev.attacker;
      const cx = c.x + (c.dir > 0 ? c.w : 0);
      const cy = c.y + c.h / 2;
      spawnDashFx(cx, cy, ev.hit ? "fx-slam" : "fx-slam-miss");
    } else if (ev.type === "dashZap") {
      const v = ev.target ? visualBounds(ev.target) : { x: ev.x, y: ev.y };
      spawnDashFx(v.x, v.y, "fx-zap", "⚡");
    } else if (ev.type === "dashExplosion") {
      const v = ev.char ? visualBounds(ev.char) : { x: ev.x, y: ev.y };
      spawnExplosion(v.x, v.y, ev.radius);
    } else if (ev.type === "dashShield") {
      const v = visualBounds(ev.char);
      spawnDashFx(v.x, v.y, "fx-shieldcast");
      spawnFloatText(ev.char.x - 4, v.top - 14, `🛡 +${ev.amount}`, "fx-shield");
    } else if (ev.type === "dashStun") {
      const v = visualBounds(ev.target);
      spawnDashFx(v.x, v.y, "fx-stunburst", "✦");
      spawnFloatText(ev.target.x, v.top - 16, "STUN!", "fx-stun");
    } else if (ev.type === "multiHit") {
      const v = visualBounds(ev.target);
      spawnFloatText(v.x - 8, v.top - 18, t("events.multiHit"), "fx-multihit");
    } else if (ev.type === "shieldBlock") {
      const v = visualBounds(ev.target);
      spawnFloatText(v.x - 6, v.top - 8, `🛡${ev.absorbed}`, "fx-shieldblock");
    } else if (ev.type === "zombieRevive" || ev.type === "vampireRevive") {
      const v = visualBounds(ev.char);
      spawnFloatText(ev.char.x, v.top - 14, t("events.revive"), "fx-infect");
    } else if (ev.type === "zombiePoisonExplosion") {
      const v = visualBounds(ev.char);
      spawnDashFx(v.x, v.y, "fx-poisonburst", "✦");
      spawnFloatText(ev.char.x, v.top - 14, t("events.poison"), "fx-poison");
    } else if (ev.type === "poisonTick") {
      const v = visualBounds(ev.target);
      spawnFloatText(v.x - 6, v.top - 8, `-${ev.dmg.toFixed(1)}`, "fx-poison");
    }
  }
}

/** 중심 좌표에 잠깐 나타났다 사라지는 화려한 FX 조각 */
function spawnDashFx(cx, cy, cls, glyph = "") {
  const s = document.createElement("span");
  s.className = `fx-burst ${cls}`;
  if (glyph) s.textContent = glyph;
  s.style.left = `${cx}px`;
  s.style.top = `${cy}px`;
  layerFx.appendChild(s);
  s.addEventListener("animationend", () => s.remove());
}

/** 파랑 폭발: 충격파 링 + 중심 플래시 + 스파크 파편 */
function spawnExplosion(cx, cy, radius) {
  const wrap = document.createElement("div");
  wrap.className = "fx-explosion";
  wrap.style.left = `${cx}px`;
  wrap.style.top = `${cy}px`;
  wrap.style.setProperty("--ex-r", `${radius}px`);
  const ring = document.createElement("span"); ring.className = "fx-ex-ring";
  const flash = document.createElement("span"); flash.className = "fx-ex-flash";
  wrap.append(ring, flash);
  for (let i = 0; i < 8; i++) {
    const sp = document.createElement("i");
    sp.className = "fx-ex-spark";
    sp.style.setProperty("--a", `${i * 45}deg`);
    wrap.appendChild(sp);
  }
  layerFx.appendChild(wrap);
  let done = 0;
  wrap.addEventListener("animationend", () => { if (++done >= 1) wrap.remove(); });
  setTimeout(() => wrap.remove(), 900); // 안전 제거
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
