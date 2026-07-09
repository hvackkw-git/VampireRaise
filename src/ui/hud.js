// src/ui/hud.js
// 수조 내 오버레이 HUD: 좌상단 상태 칩 + 우상단 핫키(웨이브·자동·소환·꾸미기).

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
  const elSummonCost = document.getElementById("summonCost");

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
    elWave.textContent = `🌊 ${state.wave.current}`;
    const humans = humansAlive(state);
    elHumans.textContent = state.wave.active ? `🙍 ${humans}` : "";
    elBlood.textContent = `🩸 ${state.blood}`;
    btnWave.disabled = state.wave.active;
    btnWave.textContent = state.wave.active ? "⏳" : "▶";
    btnAuto.classList.toggle("on", state.wave.auto);
    elSummonCost.textContent = String(summonCost(vampireCount()));
  }
  render();
  return { render };
}
