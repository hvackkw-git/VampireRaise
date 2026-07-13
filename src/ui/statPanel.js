import { CRAWL_SPD, DASH_SPD, MP_REGEN_PER_S } from "../constants.js";
import { effectiveDetectRange } from "../skills/dashColors.js";
import {
  STAT_KEYS, effectiveArmor, effectiveAttackSpeed, effectiveDashSpeed,
  effectiveMagicAttack, effectiveMoveSpeed, effectiveMpRegen,
  investStat, normalizeStatProgress,
} from "../stats/characterStats.js";
import { t } from "../i18n/index.js";

function rounded(value, digits = 0) {
  return Number(value || 0).toFixed(digits);
}

export function initStatPanel({ getCharacter, onChange, onOpenChange } = {}) {
  const panel = document.getElementById("statPanel");
  const owner = document.getElementById("statPanelOwner");
  const level = document.getElementById("statPanelLevel");
  const points = document.getElementById("statPanelPoints");
  const closeButton = document.getElementById("btnStatPanelClose");
  const rows = new Map(STAT_KEYS.map((key) => {
    const row = panel.querySelector(`[data-stat-key="${key}"]`);
    return [key, {
      row,
      name: row.querySelector(".stat-attribute-name"),
      value: row.querySelector(".stat-attribute-value"),
      effect: row.querySelector(".stat-attribute-effect"),
      button: row.querySelector(".stat-invest-btn"),
    }];
  }));
  const summary = Object.fromEntries(
    ["hp", "atk", "armor", "attackSpeed", "moveSpeed", "dashSpeed", "detect", "mp", "regen", "magicAtk"]
      .map((key) => [key, document.getElementById(`statSummary-${key}`)]),
  );

  for (const [key, entry] of rows) {
    entry.button.addEventListener("click", () => {
      const char = getCharacter?.();
      if (!investStat(char, key)) return;
      onChange?.(char);
      render();
    });
  }

  function render() {
    if (panel.classList.contains("hidden")) return;
    const char = getCharacter?.();
    if (!char || char.side !== "vampire") {
      owner.textContent = t("statPanel.noShrimp");
      level.textContent = "—";
      points.textContent = "0";
      for (const entry of rows.values()) entry.button.disabled = true;
      return;
    }

    normalizeStatProgress(char);
    owner.textContent = Number.isFinite(char.vampireOrder)
      ? t("statPanel.shrimpNumber", { number: char.vampireOrder })
      : t("statPanel.shrimp");
    level.textContent = String(char.level);
    points.textContent = String(char.statPoints);

    const labels = {
      str: ["statPanel.strength", "statPanel.strengthEffect"],
      agi: ["statPanel.agility", "statPanel.agilityEffect"],
      int: ["statPanel.intelligence", "statPanel.intelligenceEffect"],
    };
    for (const [key, entry] of rows) {
      entry.name.textContent = t(labels[key][0]);
      entry.value.textContent = String(char.stats[key]);
      entry.effect.textContent = t(labels[key][1]);
      entry.button.disabled = char.statPoints <= 0;
      const investLabel = t("statPanel.invest", { stat: t(labels[key][0]) });
      entry.button.title = investLabel;
      entry.button.setAttribute("aria-label", investLabel);
    }

    summary.hp.textContent = rounded(char.maxHp);
    summary.atk.textContent = rounded(char.atk);
    summary.armor.textContent = rounded(effectiveArmor(char));
    summary.attackSpeed.textContent = `×${rounded(effectiveAttackSpeed(char), 2)}`;
    summary.moveSpeed.textContent = `${rounded(effectiveMoveSpeed(char, CRAWL_SPD))}`;
    summary.dashSpeed.textContent = `${rounded(effectiveDashSpeed(char, DASH_SPD))}`;
    summary.detect.textContent = `${rounded(effectiveDetectRange(char))}`;
    summary.mp.textContent = rounded(char.maxMp);
    summary.regen.textContent = `${rounded(effectiveMpRegen(char, MP_REGEN_PER_S), 2)}/s`;
    summary.magicAtk.textContent = rounded(effectiveMagicAttack(char));
  }

  function open() {
    const char = getCharacter?.();
    if (!char || char.side !== "vampire") return false;
    panel.classList.remove("hidden");
    onOpenChange?.(true);
    render();
    closeButton.focus({ preventScroll: true });
    return true;
  }

  function close() {
    if (panel.classList.contains("hidden")) return;
    panel.classList.add("hidden");
    onOpenChange?.(false);
  }

  function toggle() {
    return panel.classList.contains("hidden") ? open() : close();
  }

  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return { open, close, toggle, render, isOpen: () => !panel.classList.contains("hidden") };
}
