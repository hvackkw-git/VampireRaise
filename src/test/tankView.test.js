import { describe, it, expect } from "vitest";
import { ATTACK_RAISE_S, ATTACK_RAISE_DEG } from "../constants.js";
import { spriteAttackTransform } from "../ui/tankView.js";

describe("tank view attack transforms", () => {
  it("keeps the right-facing slam rotation outside the horizontal flip", () => {
    const c = { side: "vampire", dir: 1, _swinging: true, _swingT: ATTACK_RAISE_S };

    expect(spriteAttackTransform(c)).toBe(`rotate(${-ATTACK_RAISE_DEG}deg) scaleX(-1)`);
  });

  it("raises the left-facing head with an unflipped positive rotation", () => {
    const c = { side: "vampire", dir: -1, _swinging: true, _swingT: ATTACK_RAISE_S };

    expect(spriteAttackTransform(c)).toBe(`rotate(${ATTACK_RAISE_DEG}deg)`);
  });
});
