// src/decorate/decorateMode.js
// 꾸미기 모드 UI — Shrimprium과 동일 조작:
// 팔레트 선택 → 그리드 오버레이 표시 → 탭/드래그로 연속 배치 (같은 레이어 점유 시 빨간 플래시).
// 팔레트 미선택 상태에서 배치된 블록 탭 → 선택 → 드래그 이동(그리드 스냅·같은 레이어 스왑),
// 회전/투명화/센서 조절/회수 버튼. 블랙홀은 화이트홀과 쌍 배치·쌍 회수.

import {
  PLATFORM_BLOCK_TYPES, PLATFORM_W, PLATFORM_STEP,
  getPlatformBlockSpritePath, getPlatformYRange, isLogicLayerBlock,
  STEALTH_BLOCK_TYPES, SENSOR_METRICS, PAIRED_BLOCK_PARTNER,
} from "../platform/platformBlockRenderer.js";
import {
  snapToGrid, placeBlock, moveBlock, rotateBlock, removeBlock, blocksAtCell,
} from "./placementRules.js";
import { TANK_W, TANK_H } from "../constants.js";
import { toTankLocal, showToast } from "../ui/tankView.js";

const FAIL_MSG = {
  noPairSpace: "화이트홀을 놓을 공간이 없습니다",
  recallExists: "리콜 블록은 수조당 1개만 놓을 수 있습니다",
};

export function createDecorateMode(state, ui, { onExit } = {}) {
  let selectedPaletteType = null; // 팔레트에서 고른 블록 타입
  let logicLayerMode = false;     // ⚡ 논리 레이어 편집 우선
  let painting = false;           // 드래그 연속 배치 중
  let lastPaintCell = null;
  let drag = null;                // 선택 블록 드래그 { platId, originX, originY, startX, startY, moved }

  const overlay = document.getElementById("platform-grid-overlay");
  const paletteEl = document.getElementById("decoratePalette");
  const bar = document.getElementById("decorate-bar");
  const btnLogic = document.getElementById("btnLogicLayer");
  const selInfo = document.getElementById("decoSelInfo");
  const btnRotate = document.getElementById("btnRotate");
  const btnStealth = document.getElementById("btnStealth");
  const btnSensorOp = document.getElementById("btnSensorOp");
  const btnSensorMinus = document.getElementById("btnSensorMinus");
  const btnSensorPlus = document.getElementById("btnSensorPlus");
  const btnRetrieve = document.getElementById("btnRetrieve");
  const btnDone = document.getElementById("btnDecoDone");

  // ── 그리드 오버레이 (배치 가능 영역 전체) ──
  function buildGrid() {
    if (overlay.childElementCount > 0) return;
    const { minY, maxY } = getPlatformYRange(TANK_H);
    for (let y = minY; y <= maxY; y += PLATFORM_STEP) {
      for (let x = 0; x + PLATFORM_W <= TANK_W; x += PLATFORM_STEP) {
        const cell = document.createElement("div");
        cell.className = "platform-grid-cell";
        cell.style.left = `${x}px`;
        cell.style.top = `${y}px`;
        overlay.appendChild(cell);
      }
    }
  }

  function flashBadCell(point) {
    if (!point) return;
    const cells = overlay.querySelectorAll(".platform-grid-cell");
    for (const cell of cells) {
      if (cell.style.left === `${point.x}px` && cell.style.top === `${point.y}px`) {
        cell.classList.add("platform-grid-cell-bad");
        setTimeout(() => cell.classList.remove("platform-grid-cell-bad"), 200);
        break;
      }
    }
    globalThis.navigator?.vibrate?.(15);
  }

  function updateOverlayVisibility() {
    const show = ui.decorateMode && (selectedPaletteType != null || drag != null);
    overlay.classList.toggle("hidden", !show);
  }

  // ── 팔레트 (화이트홀 제외 — 블랙홀과 쌍 자동 생성) ──
  function buildPalette() {
    paletteEl.innerHTML = "";
    const placeable = PLATFORM_BLOCK_TYPES.filter((t) => t !== PAIRED_BLOCK_PARTNER);
    const platformTypes = placeable.filter((t) => !isLogicLayerBlock(t));
    const logicTypes = placeable.filter((t) => isLogicLayerBlock(t));
    const addItem = (type) => {
      const btn = document.createElement("button");
      btn.className = "palette-item";
      btn.dataset.blockType = type;
      btn.title = type;
      const img = document.createElement("img");
      img.src = getPlatformBlockSpritePath(type, false, 0);
      img.draggable = false;
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        selectedPaletteType = selectedPaletteType === type ? null : type;
        // Shrimprium과 동일: 고른 블록의 레이어에 맞춰 ⚡ 자동 토글
        if (selectedPaletteType) logicLayerMode = isLogicLayerBlock(type);
        setSelectedBlock(null);
        syncBar();
      });
      paletteEl.appendChild(btn);
    };
    platformTypes.forEach(addItem);
    const sep = document.createElement("div");
    sep.className = "palette-sep";
    paletteEl.appendChild(sep);
    logicTypes.forEach(addItem);
  }

  function setSelectedBlock(platId) {
    ui.selectedBlockId = platId;
    syncBar();
  }

  function getSelectedBlock() {
    return state.platforms.items.find((p) => p.id === ui.selectedBlockId) ?? null;
  }

  function syncBar() {
    btnLogic.classList.toggle("on", logicLayerMode);
    for (const item of paletteEl.querySelectorAll(".palette-item")) {
      item.classList.toggle("selected", item.dataset.blockType === selectedPaletteType);
    }
    const sel = getSelectedBlock();
    btnRotate.classList.toggle("hidden", !sel);
    btnRetrieve.classList.toggle("hidden", !sel);
    btnStealth.classList.toggle("hidden", !(sel && STEALTH_BLOCK_TYPES.has(sel.blockType)));
    const sensorCfg = sel ? SENSOR_METRICS[sel.blockType] : null;
    btnSensorOp.classList.toggle("hidden", !sensorCfg);
    btnSensorMinus.classList.toggle("hidden", !sensorCfg);
    btnSensorPlus.classList.toggle("hidden", !sensorCfg);
    if (sel) {
      let label = sel.blockType;
      if (sensorCfg) {
        const ss = sel.sensorState ?? { op: sensorCfg.defOp, threshold: sensorCfg.defThreshold };
        label = `${sensorCfg.icon} ${ss.op === "lte" ? "≤" : "≥"} ${ss.threshold}${sensorCfg.unit}`;
        btnSensorOp.textContent = ss.op === "lte" ? "≤" : "≥";
      }
      if (sel.transparentWhenInactive) label += " (투명)";
      selInfo.textContent = label;
      btnStealth.classList.toggle("on", !!sel.transparentWhenInactive);
    } else {
      selInfo.textContent = selectedPaletteType ? `배치: ${selectedPaletteType}` : "블록을 탭해 선택하거나 팔레트에서 고르세요";
    }
    updateOverlayVisibility();
  }

  function ensureSensorState(plat) {
    const cfg = SENSOR_METRICS[plat?.blockType];
    if (!cfg) return null;
    if (!plat.sensorState) {
      plat.sensorState = { op: cfg.defOp, threshold: cfg.defThreshold, outputOn: false };
    }
    return cfg;
  }

  // ── 배치/선택/드래그 포인터 처리 ──
  function tryPlaceAt(localX, localY) {
    const point = snapToGrid(localX, localY);
    if (!point) return;
    if (lastPaintCell && lastPaintCell.x === point.x && lastPaintCell.y === point.y) return;
    const res = placeBlock(state, point.x, point.y, selectedPaletteType);
    if (res.ok) {
      lastPaintCell = point;
    } else if (res.reason !== "range") {
      flashBadCell(point);
      if (FAIL_MSG[res.reason]) showToast(FAIL_MSG[res.reason]);
      lastPaintCell = point; // 같은 칸 반복 실패 플래시 방지
    }
  }

  /** 탭 위치의 블록 선택 (논리 레이어 모드에 따라 우선순위) */
  function pickBlockAt(localX, localY) {
    const point = snapToGrid(localX, localY);
    if (!point) return null;
    const cellBlocks = blocksAtCell(state, point.x, point.y);
    if (cellBlocks.length === 0) return null;
    const preferLogic = logicLayerMode;
    const sorted = [...cellBlocks].sort((a, b) => {
      const aLogic = isLogicLayerBlock(a.blockType) ? 1 : 0;
      const bLogic = isLogicLayerBlock(b.blockType) ? 1 : 0;
      return preferLogic ? bLogic - aLogic : aLogic - bLogic;
    });
    return sorted[0];
  }

  function onPointerDown(ev) {
    if (!ui.decorateMode) return;
    const local = toTankLocal(ev.clientX, ev.clientY);
    if (selectedPaletteType) {
      painting = true;
      lastPaintCell = null;
      tryPlaceAt(local.x, local.y);
      ev.preventDefault();
      return;
    }
    const hit = pickBlockAt(local.x, local.y);
    if (hit) {
      setSelectedBlock(hit.id);
      drag = {
        platId: hit.id,
        originX: hit.x, originY: hit.y,
        startX: local.x, startY: local.y,
      };
      updateOverlayVisibility();
      ev.preventDefault();
    } else {
      setSelectedBlock(null);
    }
  }

  function onPointerMove(ev) {
    if (!ui.decorateMode) return;
    const local = toTankLocal(ev.clientX, ev.clientY);
    if (painting && selectedPaletteType) {
      tryPlaceAt(local.x, local.y);
      return;
    }
    if (drag) {
      const plat = state.platforms.items.find((p) => p.id === drag.platId);
      if (!plat) { drag = null; return; }
      const { minY, maxY } = getPlatformYRange(TANK_H);
      const targetX = Math.max(0, Math.min(TANK_W - PLATFORM_W,
        drag.originX + Math.round((local.x - drag.startX) / PLATFORM_STEP) * PLATFORM_STEP));
      const targetY = Math.max(minY, Math.min(maxY,
        drag.originY + Math.round((local.y - drag.startY) / PLATFORM_STEP) * PLATFORM_STEP));
      if (targetX !== plat.x || targetY !== plat.y) {
        moveBlock(state, plat.id, targetX - plat.x, targetY - plat.y);
      }
    }
  }

  function onPointerUp() {
    painting = false;
    lastPaintCell = null;
    if (drag) { drag = null; updateOverlayVisibility(); }
  }

  // ── 버튼 ──
  btnLogic.addEventListener("click", () => {
    logicLayerMode = !logicLayerMode;
    syncBar();
  });
  btnRotate.addEventListener("click", () => {
    const sel = getSelectedBlock();
    if (sel) { rotateBlock(state, sel.id); syncBar(); }
  });
  btnStealth.addEventListener("click", () => {
    const sel = getSelectedBlock();
    if (sel && STEALTH_BLOCK_TYPES.has(sel.blockType)) {
      sel.transparentWhenInactive = !sel.transparentWhenInactive;
      syncBar();
    }
  });
  btnSensorOp.addEventListener("click", () => {
    const sel = getSelectedBlock();
    if (!sel || !ensureSensorState(sel)) return;
    sel.sensorState.op = sel.sensorState.op === "lte" ? "gte" : "lte";
    syncBar();
  });
  const adjustSensor = (dir) => {
    const sel = getSelectedBlock();
    const cfg = sel ? ensureSensorState(sel) : null;
    if (!cfg) return;
    const next = Number(sel.sensorState.threshold) + cfg.step * dir;
    const clamped = Math.min(cfg.max, Math.max(cfg.min, next));
    sel.sensorState.threshold = Math.round(clamped / cfg.step) * cfg.step;
    syncBar();
  };
  btnSensorMinus.addEventListener("click", () => adjustSensor(-1));
  btnSensorPlus.addEventListener("click", () => adjustSensor(1));
  btnRetrieve.addEventListener("click", () => {
    const sel = getSelectedBlock();
    if (sel) {
      removeBlock(state, sel.id);
      setSelectedBlock(null);
    }
  });
  btnDone.addEventListener("click", () => api.exit());

  const tankEl = document.getElementById("tank");
  tankEl.addEventListener("pointerdown", onPointerDown);
  tankEl.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  buildGrid();
  buildPalette();

  const api = {
    enter() {
      ui.decorateMode = true;
      bar.classList.remove("hidden");
      selectedPaletteType = null;
      setSelectedBlock(null);
    },
    exit() {
      ui.decorateMode = false;
      selectedPaletteType = null;
      painting = false;
      drag = null;
      setSelectedBlock(null);
      bar.classList.add("hidden");
      overlay.classList.add("hidden");
      onExit?.();
    },
    get active() { return ui.decorateMode; },
  };
  return api;
}
