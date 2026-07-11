#!/usr/bin/env python3
"""Bake the purple zombie shrimp with crisp black shell/segment outlines."""

import argparse
from pathlib import Path

from PIL import Image


OUTLINE_COLORS = {
    (24, 22, 30): (5, 4, 8),
    (14, 13, 18): (1, 1, 3),
    (10, 10, 14): (0, 0, 0),
}


def bake(source, output):
    image = Image.open(source).convert("RGBA")
    pixels = []
    for r, g, b, a in image.getdata():
        if a == 0:
            pixels.append((0, 0, 0, 0))
            continue
        color = OUTLINE_COLORS.get((r, g, b))
        pixels.append((*color, a) if color else (r, g, b, a))
    image.putdata(pixels)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bake(args.source, args.output)


if __name__ == "__main__":
    main()
