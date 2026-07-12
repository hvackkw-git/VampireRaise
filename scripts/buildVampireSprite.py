#!/usr/bin/env python3
"""Bake the swarthy blood-red vampire shrimp with crisp black shell/segment outlines.

Remaps the bright cherry-red sheet so its two dominant deep tones collapse to
near-black — the same trick that gives the zombie shrimp its outlined, jointed
look — while the mid/light tones stay dark crimson so the vampire reads red,
just darker and clearly segmented.
"""

import argparse
from pathlib import Path

from PIL import Image


PALETTE = {
    (180, 6, 83): (7, 4, 6),        # dominant body fill -> near-black (swarthy)
    (200, 17, 70): (1, 1, 2),       # deep red -> black shell/segment outline
    (243, 65, 63): (150, 26, 40),   # bright red -> dark blood-red mid tone
    (250, 161, 148): (196, 70, 72), # pink -> muted crimson highlight
    (248, 219, 206): (224, 150, 150),  # pale -> soft rose highlight
    (31, 40, 35): (0, 0, 0),        # eye -> pure black
    (255, 255, 255): (245, 235, 235),  # specular -> warm near-white
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
