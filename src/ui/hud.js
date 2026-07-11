// src/ui/hud.js
// 수조 내 오버레이 HUD: 좌상단 상태 칩 + 우상단 핫키(웨이브·자동·소환·꾸미기).

import { summonCost } from "../constants.js";
import { startWave, humansAlive } from "../game/waves.js";
import { createCharacter, resetState } from "../state/gameState.js";
import { showToast } from "./tankView.js";

export function initHud(state, { onDecorate, onReset, getBlockPowered, isDecorating }) {
  const elWave = document.getElementById("hudWave");
  const elHumans = document.getElementById("hudHumans");
  const elBlood = document.getElementById("hudBlood");
  const btnWave = document.getElementById("btnWave");
  const btnAuto = document.getElementById("btnAuto");
  const btnSummon = document.getElementById("btnSummon");
  const btnDecorate = document.getElementById("btnDecorate");
  const elSummonCost = document.getElementById("summonCost");

  const vampireCount = () =>
    state.chars.items.filter((c) => c.side === "vampire").length;

  const showStartFailure = () => {
    if (state.wave.lastStartError === "noPath") showToast("아래까지 이어지는 Holy Shrimp 이동 경로가 없습니다");
  };

  const tryStartWave = () => {
    if (isDecorating?.()) {
      showToast("꾸미기를 완료한 뒤 웨이브를 시작하세요");
      return false;
    }
    const started = startWave(state, getBlockPowered?.());
    if (started) showToast(`🌊 웨이브 ${state.wave.current} 시작!`);
    else showStartFailure();
    return started;
  };

  btnWave.addEventListener("click", tryStartWave);

  btnAuto.addEventListener("click", () => {
    if (isDecorating?.()) {
      showToast("꾸미기를 완료한 뒤 자동 웨이브를 켜세요");
      return;
    }
    state.wave.auto = !state.wave.auto;
    if (state.wave.auto && !state.wave.active) {
      // 대기 중이면 즉시 시작
      if (!tryStartWave()) state.wave.auto = false;
    }
  });

  btnSummon.addEventListener("click", () => {
    const cost = summonCost(vampireCount());
    if (state.blood < cost) {
      showToast(`피가 부족합니다 (🩸 ${cost} 필요)`);
      return;
    }
    state.blood -= cost;
    // Vamp Shrimp는 상단 낙하가 아니라 맨 아래(바닥)에서 스폰 — createCharacter 기본값이 바닥·CRAWL
    createCharacter(state, "vampire");
    showToast("🦐 새 Vamp Shrimp가 합류했습니다");
  });

  btnDecorate.addEventListener("click", () => {
    if (state.wave.active) {
      showToast("꾸미기는 웨이브 종료 후에만 가능합니다");
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
      showToast("한 번 더 누르면 처음부터 재시작합니다");
      return;
    }
    resetArmedUntil = 0;
    resetState(state);
    onReset?.();
    render();
    showToast("🔄 처음부터 재시작!");
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
    elSummonCost.textContent = String(summonCost(vampireCount()));
  }
  render();
  return { render };
}
