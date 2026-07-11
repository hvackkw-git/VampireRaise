#!/usr/bin/env python3
"""Bake the former CSS aura into a transparent 10-tier PNG sprite sheet."""

import argparse
import math
from pathlib import Path

from PIL import Image


FRAME = 64
FRAMES = 8
TIERS = 10
SUPERSAMPLE = 4
MAX_ALPHA = round(255 * 0.7)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(a, b, t):
    return tuple(round(lerp(x, y, t)) for x, y in zip(a, b))


def angle_distance(a, b):
    return abs((a - b + math.pi) % (math.tau) - math.pi)


def composite_pixel(dst, src):
    sr, sg, sb, sa = src
    if sa <= 0:
        return dst
    dr, dg, db, da = dst
    out_a = sa + da * (255 - sa) // 255
    if out_a <= 0:
        return (0, 0, 0, 0)
    src_w = sa / out_a
    dst_w = 1 - src_w
    return (
        round(sr * src_w + dr * dst_w),
        round(sg * src_w + dg * dst_w),
        round(sb * src_w + db * dst_w),
        out_a,
    )


def bake_frame(tier, frame_index):
    hi = FRAME * SUPERSAMPLE
    image = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    pixels = image.load()
    progress = (tier - 1) / 8
    phase = frame_index / FRAMES * math.tau
    breathe = 1 + 0.045 * math.sin(phase)
    diameter = lerp(34, 62, progress) * SUPERSAMPLE * breathe
    radius = diameter / 2
    center = hi / 2
    tier_alpha = round(lerp(58, MAX_ALPHA, progress))

    core = mix((255, 222, 102), (255, 252, 220), progress)
    edge = mix((226, 105, 20), (255, 173, 42), progress)

    for y in range(hi):
        for x in range(hi):
            dx = x + 0.5 - center
            dy = y + 0.5 - center
            r = math.hypot(dx, dy) / radius
            if r >= 1:
                continue
            angle = math.atan2(dy, dx)

            # Former radial-gradient: bright core, orange body, transparent edge.
            if r < 0.28:
                color = core
                alpha = tier_alpha * lerp(0.84, 1, r / 0.28)
            elif r < 0.68:
                q = (r - 0.28) / 0.40
                color = mix(core, edge, q)
                alpha = tier_alpha * lerp(1, 0.42, q)
            else:
                q = (r - 0.68) / 0.32
                color = edge
                alpha = tier_alpha * 0.42 * (1 - q) ** 1.6
            pixel = (color[0], color[1], color[2], round(alpha))

            # Former conic-gradient ring: two broad arcs rotating clockwise.
            if tier >= 2 and 0.58 <= r <= 0.86:
                ring_strength = min(1, (tier - 1) / 5)
                arc = max(
                    1 - angle_distance(angle, phase) / 0.62,
                    1 - angle_distance(angle, phase + math.pi) / 0.62,
                )
                radial = max(0, 1 - abs(r - 0.72) / 0.14)
                ring_alpha = round(tier_alpha * ring_strength * max(0, arc) * radial * 0.9)
                pixel = composite_pixel(pixel, (*core, ring_alpha))

            pixels[x, y] = pixel

    return image.resize((FRAME, FRAME), Image.Resampling.LANCZOS)


def bake(output):
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME * TIERS), (0, 0, 0, 0))
    # Row 0 (levels 1-5) remains fully transparent.
    for tier in range(1, TIERS):
        for frame in range(FRAMES):
            sheet.alpha_composite(bake_frame(tier, frame), (frame * FRAME, tier * FRAME))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bake(args.output)


if __name__ == "__main__":
    main()
