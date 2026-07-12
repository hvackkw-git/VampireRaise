#!/usr/bin/env python3
"""Bake the vivid-red vampire shrimp with crisp black shell/segment outlines.

The cherry-red sheet already paints its silhouette edge in one deep magenta
tone and its shell/joint lines in another. Recolouring just those two tones to
near-black — the same colours the zombie shrimp uses — gives the vampire clean
black outlines and abdomen segments while the bright-red body fill is left
untouched, so it stays as vivid as the original.
"""

import argparse
from pathlib import Path

from PIL import Image


PALETTE = {
    (180, 6, 83): (5, 4, 8),        # silhouette outline -> near-black shell
    (200, 17, 70): (1, 1, 3),       # shell/joint lines -> black segments
    (31, 40, 35): (0, 0, 0),        # eye -> pure black
    # (243,65,63) vivid red, (250,161,148) pink, (248,219,206) pale highlight,
    # and (255,255,255) specular are left as-is to keep the body bright red.
}


def bake(source, output):
    image = Image.open(source).convert("RGBA")
    pixels = []
    for r, g, b, a in image.getdata():
        if a == 0:
            pixels.append((0, 0, 0, 0))
            continue
        color = PALETTE.get((r, g, b))
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
