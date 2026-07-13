import { describe, it, expect } from "vitest";
import { ATTACK_RAISE_S, ATTACK_RAISE_DEG } from "../constants.js";
import { formatDamage, spriteAttackTransform } from "../ui/tankView.js";
import { BACKFLIP_DURATION_S } from "../skills/backflip.js";

describe("tank view damage text", () => {
  it("shows at most one decimal place without changing integer labels", () => {
    expect(formatDamage(9.94)).toBe("9.9");
    expect(formatDamage(9.96)).toBe("10");
    expect(formatDamage(4)).toBe("4");
  });
});

describe("tank view attack transforms", () => {
  it("keeps the right-facing slam rotation outside the horizontal flip", () => {
    const c = { side: "vampire", dir: 1, _swinging: true, _swingT: ATTACK_RAISE_S };

    expect(spriteAttackTransform(c)).toBe(`rotate(${-ATTACK_RAISE_DEG}deg) scaleX(-1)`);
  });

  it("raises the left-facing head with an unflipped positive rotation", () => {
    const c = { side: "vampire", dir: -1, _swinging: true, _swingT: ATTACK_RAISE_S };

    expect(spriteAttackTransform(c)).toBe(`rotate(${ATTACK_RAISE_DEG}deg)`);
  });

  it("uses Shrimprium's eased 360-degree backflip with a short hop", () => {
    const c = { state: "BACKFLIP", dir: 1, _backflipT: BACKFLIP_DURATION_S / 2 };

    expect(spriteAttackTransform(c)).toBe("translateY(-10px) rotate(180deg) scaleX(-1)");
  });

  it("keeps a left-facing shrimp backflipping relative to its facing direction", () => {
    const c = { state: "BACKFLIP", dir: -1, _backflipT: BACKFLIP_DURATION_S / 2 };

    expect(spriteAttackTransform(c)).toBe("translateY(-10px) rotate(-180deg)");
  });
});
