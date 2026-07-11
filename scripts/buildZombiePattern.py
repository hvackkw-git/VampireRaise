#!/usr/bin/env python3
"""Bake a red shrimp pattern overlay with black outlines and segment gaps."""

import argparse
from pathlib import Path

from PIL import Image


BLACK = (1, 1, 3, 255)


def is_black_segment(pixel):
    r, g, b, a = pixel
    return a > 0 and max(r, g, b) <= 8


def bake(mask_path, color_path, zombie_path, output_path):
    mask = Image.open(mask_path).convert("RGBA")
    color_source = Image.open(color_path).convert("RGBA")
    zombie = Image.open(zombie_path).convert("RGBA")
    if not (mask.size == color_source.size == zombie.size):
        raise ValueError("pattern, color source, and zombie sheets must have identical dimensions")

    width, height = mask.size
    mask_px = mask.load()
    color_px = color_source.load()
    zombie_px = zombie.load()
    output = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    out_px = output.load()

    pattern = {
        (x, y)
        for y in range(height)
        for x in range(width)
        if mask_px[x, y][3] > 0 and color_px[x, y][3] > 0 and zombie_px[x, y][3] > 0
    }

    # Fill the pattern with the color-source pixel at the exact same frame coordinate.
    # Zombie segment pixels win so a RILI stripe cannot erase the abdomen joints.
    for x, y in pattern:
        if is_black_segment(zombie_px[x, y]):
            out_px[x, y] = BLACK
        else:
            rr, rg, rb, ra = color_px[x, y]
            out_px[x, y] = (rr, rg, rb, min(ra, mask_px[x, y][3]))

    # One-pixel black outline, constrained to the zombie body. Frame boundaries are
    # respected so the last column of one frame never outlines the next frame.
    frame_width = 32
    for x, y in pattern:
        frame_left = (x // frame_width) * frame_width
        frame_right = frame_left + frame_width
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if nx < frame_left or nx >= frame_right or ny < 0 or ny >= height:
                    continue
                if zombie_px[nx, ny][3] == 0 or (nx, ny) in pattern:
                    continue
                out_px[nx, ny] = BLACK

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mask", type=Path)
    parser.add_argument("color", type=Path)
    parser.add_argument("zombie", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bake(args.mask, args.color, args.zombie, args.output)


if __name__ == "__main__":
    main()
