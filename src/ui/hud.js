// src/ui/hud.js
// 수조 내 오버레이 HUD: 좌상단 상태 칩 + 우상단 핫키(웨이브·자동·재시작·꾸미기).

import { rebirthWaveRequirement, REBIRTH_MAX_VAMPIRES } from "../constants.js";
import { startWave, humansAlive, vampireCount, canRebirth, rebirth } from "../game/waves.js";
import { resetState } from "../state/gameState.js";
import { clearSave } from "../state/saveLoad.js";
import { showToast } from "./tankView.js";
import { t } from "../i18n/index.js";

export function initHud(state, { onDecorate, onReset, getBlockPowered, isDecorating }) {
  const elWave = document.getElementById("hudWave");
  const elHumans = document.getElementById("hudHumans");
  const elBlood = document.getElementById("hudBlood");
  const btnWave = document.getElementById("btnWave");
  const btnAuto = document.getElementById("btnAuto");
  const btnRebirth = document.getElementById("btnRebirth");
  const btnDecorate = document.getElementById("btnDecorate");
  const elRebirthReq = document.getElementById("rebirthReq");

  const showStartFailure = () => {
    if (state.wave.lastStartError === "noPath") showToast(t("hud.noRoute"));
  };

  const tryStartWave = () => {
    if (isDecorating?.()) {
      showToast(t("hud.finishDecorating"));
      return false;
    }
    const started = startWave(state, getBlockPowered?.());
    if (started) showToast(t("hud.waveStart", { wave: state.wave.current }));
    else showStartFailure();
    return started;
  };

  btnWave.addEventListener("click", tryStartWave);

  btnAuto.addEventListener("click", () => {
    if (isDecorating?.()) {
      showToast(t("hud.finishDecoratingAuto"));
      return;
    }
    state.wave.auto = !state.wave.auto;
    if (state.wave.auto && !state.wave.active) {
      // 대기 중이면 즉시 시작
      if (!tryStartWave()) state.wave.auto = false;
    }
  });

  btnRebirth.addEventListener("click", () => {
    if (isDecorating?.()) {
      showToast(t("hud.finishDecorating"));
      return;
    }
    const count = vampireCount(state);
    if (count >= REBIRTH_MAX_VAMPIRES) {
      showToast(t("hud.rebirthMaxed"));
      return;
    }
    if (!canRebirth(state)) {
      showToast(t("hud.rebirthLocked", { wave: rebirthWaveRequirement(count) }));
      return;
    }
    rebirth(state);
    showToast(t("hud.rebirthDone", { count: count + 1 }));
  });

  btnDecorate.addEventListener("click", () => {
    if (state.wave.active) {
      showToast(t("hud.decorateAfterWave"));
      return;
    }
    onDecorate?.();
  });

  // 처음부터 재시작 (테스트용): 두 번 눌러 확정 — 오조작 방지
  const btnReset = document.getElementById("btnReset");
  let resetArmedUntil = 0;
  btnReset.addEventListener("click", () => {
    const now = performance.now();
    if (now > resetArmedUntil) {
      resetArmedUntil = now + 2500;
      showToast(t("hud.resetConfirm"));
      return;
    }
    resetArmedUntil = 0;
    clearSave();
    resetState(state);
    onReset?.();
    render();
    showToast(t("hud.resetDone"));
  });

  /** 저빈도(4Hz) 갱신 */
  function render() {
    elWave.textContent = `🌊 ${state.wave.current}`;
    const humans = humansAlive(state);
    elHumans.textContent = state.wave.active ? `🙍 ${humans}` : "";
    elBlood.textContent = `🩸 ${state.blood}`;
    btnWave.disabled = state.wave.active;
    btnWave.textContent = state.wave.active ? "⏳" : "▶";
    btnAuto.classList.toggle("on", state.wave.auto);
    btnAuto.disabled = !!isDecorating?.();
    btnDecorate.disabled = state.wave.active;
    const count = vampireCount(state);
    const maxed = count >= REBIRTH_MAX_VAMPIRES;
    btnRebirth.disabled = state.wave.active;
    btnRebirth.classList.toggle("ready", !maxed && canRebirth(state));
    elRebirthReq.textContent = maxed ? "" : String(rebirthWaveRequirement(count));
  }
  render();
  return { render };
}
