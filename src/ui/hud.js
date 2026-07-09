// src/ui/hud.js
// 상단 HUD: 웨이브/피 표시 + 웨이브 시작·자동 토글·뱀파이어 소환·꾸미기 진입.

import { summonCost } from "../constants.js";
import { startWave, humansAlive } from "../game/waves.js";
import { createCharacter } from "../state/gameState.js";
import { showToast } from "./tankView.js";

export function initHud(state, { onDecorate }) {
  const elWave = document.getElementById("hudWave");
  const elHumans = document.getElementById("hudHumans");
  const elBlood = document.getElementById("hudBlood");
  const btnWave = document.getElementById("btnWave");
  const btnAuto = document.getElementById("btnAuto");
  const btnSummon = document.getElementById("btnSummon");
  const btnDecorate = document.getElementById("btnDecorate");

  const vampireCount = () =>
    state.chars.items.filter((c) => c.side === "vampire").length;

  btnWave.addEventListener("click", () => {
    if (startWave(state)) showToast(`🌊 웨이브 ${state.wave.current} 시작!`);
  });

  btnAuto.addEventListener("click", () => {
    state.wave.auto = !state.wave.auto;
    if (state.wave.auto && !state.wave.active) {
      // 대기 중이면 즉시 시작
      if (startWave(state)) showToast(`🌊 웨이브 ${state.wave.current} 시작!`);
    }
  });

  btnSummon.addEventListener("click", () => {
    const cost = summonCost(vampireCount());
    if (state.blood < cost) {
      showToast(`피가 부족합니다 (🩸 ${cost} 필요)`);
      return;
    }
    state.blood -= cost;
    createCharacter(state, "vampire", { y: -32, state: "FALL" });
    showToast("🧛 새 뱀파이어가 합류했습니다");
  });

  btnDecorate.addEventListener("click", () => onDecorate?.());

  /** 저빈도(4Hz) 갱신 */
  function render() {
    elWave.textContent = `🌊 웨이브 ${state.wave.current}`;
    const humans = humansAlive(state);
    elHumans.textContent = state.wave.active ? `🙍 ${humans}` : "";
    elBlood.textContent = `🩸 ${state.blood}`;
    btnWave.disabled = state.wave.active;
    btnWave.textContent = state.wave.active ? "진행 중…" : "▶ 웨이브";
    btnAuto.textContent = `자동 ${state.wave.auto ? "ON" : "OFF"}`;
    btnAuto.classList.toggle("on", state.wave.auto);
    btnSummon.textContent = `🧛 소환 ${summonCost(vampireCount())}`;
  }
  render();
  return { render };
}
