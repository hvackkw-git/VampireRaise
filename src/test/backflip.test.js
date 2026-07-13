import { beforeEach, describe, expect, it } from "vitest";
import { tickCombat } from "../game/combat.js";
import { createCharacter, createInitialState, fromSaveData, toSaveData } from "../state/gameState.js";
import {
  activateBackflip, BACKFLIP_COOLDOWN_S, BACKFLIP_DURATION_S, BACKFLIP_SPIKE_COUNT,
  backflipCooldown, backflipUpgradePoints, canActivateBackflip, hasBackflipSkill,
  investBackflipUpgrade, tickBackflipSkills,
} from "../skills/backflip.js";

let state;
let vampire;

beforeEach(() => {
  state = createInitialState();
  state.chars.items = [];
  vampire = createCharacter(state, "vampire", {
    x: 100, y: 500, maxHp: 100, hp: 100, atk: 10, skillPoints: 8,
  });
  vampire.dir = 1;
  vampire.state = "CRAWL";
});

describe("crimson spine backflip", () => {
  it("is equipped by default and persists its upgrades through save/restore", () => {
    expect(hasBackflipSkill(vampire)).toBe(true);
    expect(vampire.backflipSkillPoints).toBe(1);
    expect(vampire.skills).toContain("backflip-spikes");
    expect(investBackflipUpgrade(vampire, "red")).toBe(true);
    expect(investBackflipUpgrade(vampire, "red")).toBe(true);
    expect(vampire.skillPoints).toBe(6);

    const restored = fromSaveData(toSaveData(state));
    const restoredVampire = restored.chars.items.find((char) => char.id === vampire.id);
    expect(restoredVampire.skills).toContain("backflip-spikes");
    expect(backflipUpgradePoints(restoredVampire, "red")).toBe(2);
  });

  it("spawns twelve spikes clockwise over a Shrimprium-length backflip", () => {
    expect(activateBackflip(vampire)).toBe(true);

    const events = tickBackflipSkills(state, BACKFLIP_DURATION_S);
    const spikes = events.filter((event) => event.type === "backflipSpike");

    expect(spikes).toHaveLength(BACKFLIP_SPIKE_COUNT);
    expect(spikes.map((event) => event.index)).toEqual([...Array(BACKFLIP_SPIKE_COUNT).keys()]);
    expect(spikes.map((event) => Math.round(event.angleDeg))).toEqual(
      [...Array(BACKFLIP_SPIKE_COUNT).keys()].map((index) => index * 30),
    );
    expect(vampire.state).toBe("CRAWL");
  });

  it("reverses the spike sequence with a left-facing shrimp's backflip", () => {
    vampire.dir = -1;
    activateBackflip(vampire);

    const spikes = tickBackflipSkills(state, BACKFLIP_DURATION_S)
      .filter((event) => event.type === "backflipSpike");

    expect(spikes.map((event) => Math.round(event.angleDeg))).toEqual(
      [...Array(BACKFLIP_SPIKE_COUNT).keys()].map((index) => index === 0 ? 0 : index * -30),
    );
  });

  it("hits nearby enemies once, ignores distant targets, and enters cooldown", () => {
    const near = createCharacter(state, "human", { x: 145, y: 500, maxHp: 100, hp: 100 });
    const far = createCharacter(state, "human", { x: 260, y: 500, maxHp: 100, hp: 100 });
    near.state = "CRAWL";
    far.state = "CRAWL";

    expect(canActivateBackflip(vampire)).toBe(true);
    activateBackflip(vampire);
    const skillEvents = tickBackflipSkills(state, BACKFLIP_DURATION_S);
    expect(skillEvents.find((event) => event.type === "backflipBurst")).toMatchObject({ hits: 1 });

    const combatEvents = tickCombat(state, 0);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
    expect(combatEvents.filter((event) => event.type === "hit" && event.target === near)).toHaveLength(1);
    expect(vampire._backflipCd).toBeCloseTo(BACKFLIP_COOLDOWN_S - BACKFLIP_DURATION_S);
    expect(canActivateBackflip(vampire)).toBe(false);
  });

  it("applies yellow, green, and purple upgrades on cast", () => {
    investBackflipUpgrade(vampire, "yellow");
    investBackflipUpgrade(vampire, "green");
    investBackflipUpgrade(vampire, "purple");

    activateBackflip(vampire);
    const events = tickBackflipSkills(state, BACKFLIP_DURATION_S);

    expect(events.filter((event) => event.type === "backflipSpike")).toHaveLength(14);
    expect(vampire._backflipCd).toBeCloseTo(backflipCooldown(vampire) - BACKFLIP_DURATION_S);
    expect(vampire._shieldHp).toBe(10);
    expect(vampire._shieldT).toBe(3);
  });

  it("applies damage, lifesteal, stun, echo, and execute upgrades", () => {
    for (const key of ["red", "orange", "blue", "white", "mastery"]) {
      investBackflipUpgrade(vampire, key);
    }
    vampire.hp = 50;
    const target = createCharacter(state, "human", { x: 145, y: 500, maxHp: 100, hp: 30 });
    target.state = "CRAWL";

    activateBackflip(vampire);
    tickBackflipSkills(state, BACKFLIP_DURATION_S, 1000);
    const combatEvents = tickCombat(state, 0);

    expect(target.hp).toBe(2);
    expect(target.state).toBe("STUN");
    expect(target._stunUntil).toBe(1250);
    expect(vampire.hp).toBeCloseTo(51.76);
    expect(combatEvents.filter((event) => event.type === "hit" && event.target === target)).toHaveLength(2);
    expect(combatEvents.some((event) => event.type === "backflipLifesteal")).toBe(true);
    expect(combatEvents.some((event) => event.type === "backflipStun")).toBe(true);
  });

  it("can interrupt a jump and returns to falling after the flip", () => {
    vampire.state = "JUMP";
    vampire.vy = -90;

    expect(activateBackflip(vampire)).toBe(true);
    tickBackflipSkills(state, BACKFLIP_DURATION_S);

    expect(vampire.state).toBe("FALL");
    expect(vampire.vy).toBe(0);
  });
});
