import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t } from "../i18n/index.js";
import { PLATFORM_BLOCK_TYPES } from "../platform/platformBlockRenderer.js";
import {
  BACKFLIP_SKILL_DEFS, DASH_SKILL_DEFS, DETECT_SKILL_DEF, ZOMBIE_SKILL_DEFS,
} from "../skills/skillTree.js";

afterEach(() => setLocale("en"));

describe("i18n", () => {
  it("defaults to English and switches between English and Korean", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("events.infect")).toBe("INFECTED!");

    setLocale("ko");
    expect(getLocale()).toBe("ko");
    expect(t("events.infect")).toBe("감염!");
  });

  it("interpolates dynamic values", () => {
    setLocale("en");
    expect(t("hud.waveStart", { wave: 7 })).toContain("7");
    setLocale("ko");
    expect(t("events.levelAll", { count: 3 })).toContain("3");
  });

  it("has names for every placeable block in both languages", () => {
    for (const locale of ["en", "ko"]) {
      setLocale(locale);
      for (const type of PLATFORM_BLOCK_TYPES) {
        expect(t(`blocks.${type}`)).not.toBe(`blocks.${type}`);
      }
    }
  });

  it("has localized names and effects for every skill", () => {
    const defs = [...DASH_SKILL_DEFS, DETECT_SKILL_DEF, ...ZOMBIE_SKILL_DEFS, ...BACKFLIP_SKILL_DEFS];
    for (const locale of ["en", "ko"]) {
      setLocale(locale);
      for (const def of defs) {
        expect(t(def.nameKey)).not.toBe(def.nameKey);
        expect(t(def.effectKey)).not.toBe(def.effectKey);
      }
    }
  });

  it("has localized stat panel labels", () => {
    for (const locale of ["en", "ko"]) {
      setLocale(locale);
      for (const key of ["strength", "agility", "intelligence", "strengthEffect", "agilityEffect", "intelligenceEffect"]) {
        expect(t(`statPanel.${key}`)).not.toBe(`statPanel.${key}`);
      }
    }
  });
});
