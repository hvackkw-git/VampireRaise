// src/ui/hud.js
// 수조 내 오버레이 HUD: 좌상단 상태 칩 + 중앙 픽셀 스프라이트 버튼(꾸미기·시작·재시작) + 패널 핫키.
// 중앙 3버튼은 2탭 방식: 1탭 → 색상 강조(armed), 2탭 → 실행/메뉴 진입.

import { rebirthWaveRequirement, REBIRTH_MAX_VAMPIRES } from "../constants.js";
import { startWave, humansAlive, vampireCount, canRebirth, rebirth } from "../game/waves.js";
import { resetState } from "../state/gameState.js";
import { clearSave } from "../state/saveLoad.js";
import { showToast } from "./tankView.js";
import { t } from "../i18n/index.js";
import { SPRITES } from "./sprites.js";

export function initHud(state, { onDecorate, onReset, getBlockPowered, isDecorating }) {
  const elWave = document.getElementById("hudWave");
  const elHumans = document.getElementById("hudHumans");
  const elBlood = document.getElementById("hudBlood");
  const btnWave = document.getElementById("btnWave");
  const btnAuto = document.getElementById("btnAuto");
  const btnRebirth = document.getElementById("btnRebirth");
  const btnDecorate = document.getElementById("btnDecorate");
  const elRebirthReq = document.getElementById("rebirthReq");
  const waveCenterControls = document.getElementById("waveCenterControls");

  // 픽셀 스프라이트 주입 (스프라이트 자체가 버튼). rebirthReq 배지는 유지.
  btnDecorate.insertAdjacentHTML("afterbegin", SPRITES.decorate);
  btnWave.insertAdjacentHTML("afterbegin", SPRITES.wave);
  btnRebirth.insertAdjacentHTML("afterbegin", SPRITES.rebirth);

  // 2탭 상태: 어떤 스프라이트가 armed(색상 강조)인지
  const armTargets = { wave: btnWave, rebirth: btnRebirth, decorate: btnDecorate };
  let armed = null;
  function setArmed(which) {
    armed = which;
    for (const [key, btn] of Object.entries(armTargets)) {
      btn.classList.toggle("armed", key === which);
    }
  }

  const showStartFailure = () => {
    if (state.wave.lastStartError === "noPath") showToast(t("hud.noRoute"));
  };

  const performStartWave = () => {
    const started = startWave(state, getBlockPowered?.());
    if (started) showToast(t("hud.waveStart", { wave: state.wave.current }));
    else showStartFailure();
    return started;
  };

  // 시작(재생/초록): 1탭 armed → 2탭 웨이브 시작
  btnWave.addEventListener("click", () => {
    if (isDecorating?.()) { showToast(t("hud.finishDecorating")); setArmed(null); return; }
    if (armed !== "wave") { setArmed("wave"); return; }
    setArmed(null);
    performStartWave();
  });

  btnAuto.addEventListener("click", () => {
    if (isDecorating?.()) {
      showToast(t("hud.finishDecoratingAuto"));
      return;
    }
    state.wave.auto = !state.wave.auto;
    if (state.wave.auto && !state.wave.active) {
      // 대기 중이면 즉시 시작
      if (!performStartWave()) state.wave.auto = false;
    }
  });

  // 재시작(나비/빨강): 1탭 armed → 2탭 rebirth
  btnRebirth.addEventListener("click", () => {
    if (btnRebirth.disabled) return;
    if (isDecorating?.()) { showToast(t("hud.finishDecorating")); setArmed(null); return; }
    if (armed !== "rebirth") { setArmed("rebirth"); return; }
    setArmed(null);
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

  // 꾸미기(망치/노랑): 1탭 armed → 2탭 꾸미기 메뉴 진입
  btnDecorate.addEventListener("click", () => {
    if (btnDecorate.disabled) return;
    if (state.wave.active) { showToast(t("hud.decorateAfterWave")); return; }
    if (armed !== "decorate") { setArmed("decorate"); return; }
    setArmed(null);
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
    // 중앙 버튼은 웨이브 진행 중·꾸미기 중에는 통째로 숨김
    const clusterHidden = state.wave.active || !!isDecorating?.();
    waveCenterControls.classList.toggle("hidden", clusterHidden);
    btnAuto.classList.toggle("on", state.wave.auto);
    btnAuto.disabled = !!isDecorating?.();
    btnDecorate.disabled = state.wave.active;
    const count = vampireCount(state);
    const maxed = count >= REBIRTH_MAX_VAMPIRES;
    const rebirthReady = !maxed && canRebirth(state);
    // 조건 미충족이면 비활성(회색), 충족되면 활성(흰색)
    btnRebirth.disabled = !rebirthReady;
    // 잠겨 있을 때만 필요한 웨이브 수를 배지로 표시
    elRebirthReq.textContent = (!rebirthReady && !maxed) ? String(rebirthWaveRequirement(count)) : "";
    // 숨겨졌거나 비활성이 된 버튼의 armed 상태는 해제
    if (clusterHidden
      || (armed === "rebirth" && btnRebirth.disabled)
      || (armed === "decorate" && btnDecorate.disabled)) {
      setArmed(null);
    }
  }
  render();
  return { render };
}
