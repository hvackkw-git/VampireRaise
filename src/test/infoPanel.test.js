import { describe, expect, it } from "vitest";
import { faceThermalPalette } from "../ui/infoPanel.js";

describe("squad portrait thermal palette", () => {
  it("moves from dark blue-purple at critical HP to hot yellow-red at full HP", () => {
    expect(faceThermalPalette(0, 100)).toMatchObject({
      ratio: 0,
      hot: "rgb(57, 53, 120)",
      core: "rgb(22, 23, 61)",
    });
    expect(faceThermalPalette(100, 100)).toMatchObject({
      ratio: 1,
      hot: "rgb(255, 228, 112)",
      core: "rgb(238, 63, 39)",
    });
  });

  it("clamps invalid health and keeps dead portraits cold", () => {
    expect(faceThermalPalette(150, 100).ratio).toBe(1);
    expect(faceThermalPalette(-20, 100).ratio).toBe(0);
    expect(faceThermalPalette(100, 100, true).ratio).toBe(0);
    expect(faceThermalPalette(10, 0).ratio).toBe(0);
  });

  it("keeps half health warm and reserves blue-purple for critical health", () => {
    const half = faceThermalPalette(50, 100);
    const critical = faceThermalPalette(20, 100);

    expect(half.hot).toBe("rgb(235, 80, 82)");
    expect(critical.hot).toBe("rgb(107, 73, 166)");
  });
});
