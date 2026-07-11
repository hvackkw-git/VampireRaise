#!/usr/bin/env python3
"""스킬트리 노드 아이콘 픽셀 스프라이트 생성 → assets/skills/tree/.

PIL 없이 표준 라이브러리(zlib/struct)만으로 40×40 RGBA PNG를 쓴다
(20×20 그리드를 2배 확대해서 저장 — tools/generate_skill_icons.py와 동일 기법).
아이콘 테마:
  - Dash 7색: 기존 skill_dash.png과 같은 이중 셰브런을 각 색으로 재채색.
  - 대쉬 숙련(cdmana): 모래시계(쿨타임/마나 숙련).
  - 인식범위(detect): 레이더 링.
  - Jombie Shrimp 체력: 하트.
  - 노란/붉은/검은 릴리(부활/맹독/미구현 특성): 릴리 꽃 실루엣을 색만 바꿔 재사용.
  - 기동: 부츠. 군집: 뭉친 원 4개. 감염: 스파이크 볼. 숙련: 반짝임(스파클).
사용: python3 tools/generate_skill_tree_icons.py
"""
import math
import os
import struct
import zlib

GRID = 20
SCALE = 2
TRANS = (0, 0, 0, 0)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "skills", "tree")

ZOMBIE_GREEN = "#8fe36a"


def write_png(path, pixels, scale=SCALE):
    w = len(pixels[0]) * scale
    h = len(pixels) * scale
    raw = b"".join(
        b"\x00" + b"".join(bytes(px) * scale for px in row)
        for row in pixels for _ in range(scale)
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({w}x{h})")


def new_canvas():
    return [[TRANS] * GRID for _ in range(GRID)]


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(rgb, factor):
    """factor>0: 흰색쪽으로 보간(밝게), factor<0: 검정쪽으로 스케일(어둡게)."""
    if factor >= 0:
        return tuple(min(255, int(c + (255 - c) * factor)) for c in rgb) + (255,)
    return tuple(max(0, int(c * (1 + factor))) for c in rgb) + (255,)


def put(px, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < GRID and 0 <= y < GRID:
        px[y][x] = c


def circle(px, cx, cy, r, c):
    r2 = r * r
    for y in range(GRID):
        for x in range(GRID):
            dx, dy = x - cx + 0.5, y - cy + 0.5
            if dx * dx + dy * dy <= r2:
                px[y][x] = c


def ring(px, cx, cy, r_out, r_in, c):
    ro2, ri2 = r_out * r_out, r_in * r_in
    for y in range(GRID):
        for x in range(GRID):
            dx, dy = x - cx + 0.5, y - cy + 0.5
            d2 = dx * dx + dy * dy
            if ri2 <= d2 <= ro2:
                px[y][x] = c


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(px, x, y, c)


def preview(px, label):
    """터미널에서 실루엣을 눈으로 확인하기 위한 ASCII 미리보기."""
    print(f"-- {label} --")
    for row in px:
        print("".join("#" if p[3] > 0 else "." for p in row))


# ── Dash 색 셰브런(기존 skill_dash.png 디자인을 20×20으로 재구성 + 색상 파라미터화) ──
def chevron_icon(hexcolor):
    px = new_canvas()
    rgb = hex_to_rgb(hexcolor)
    rgba = rgb + (255,)
    dark = shade(rgb, -0.55)
    hi = shade(rgb, 0.4)
    ghost_dark = shade(rgb, -0.75)
    ghost_main = shade(rgb, -0.35)
    ghost_hi = shade(rgb, -0.05)

    def chevron(ox, c_dark, c_main, c_hi):
        for y in range(3, 17):
            d = y - 3 if y <= 9 else 16 - y
            put(px, ox + d, y, c_dark)
            put(px, ox + d + 1, y, c_main)
            put(px, ox + d + 2, y, c_hi)

    chevron(2, ghost_dark, ghost_main, ghost_hi)  # 잔상(뒤)
    chevron(9, dark, rgba, hi)                     # 본체(앞)
    return px


# ── 대쉬 숙련(쿨타임/마나) — 모래시계 ──
def hourglass_icon():
    px = new_canvas()
    rgb = hex_to_rgb("#8fd6d0")
    frame = shade(rgb, -0.55)
    glass = shade(rgb, 0.35)
    sand = shade(rgb, -0.1)
    cx, top, mid, bot = 10, 4, 10, 16
    for y in range(top, mid + 1):
        t = (y - top) / (mid - top)
        half = max(0, round(6 * (1 - t)))
        rect(px, cx - half, y, cx + half, y, glass)
        put(px, cx - half, y, frame)
        put(px, cx + half, y, frame)
    for y in range(mid, bot + 1):
        t = (y - mid) / (bot - mid)
        half = max(0, round(6 * t))
        rect(px, cx - half, y, cx + half, y, glass)
        put(px, cx - half, y, frame)
        put(px, cx + half, y, frame)
    rect(px, cx - 7, top - 1, cx + 7, top - 1, frame)
    rect(px, cx - 7, bot + 1, cx + 7, bot + 1, frame)
    circle(px, cx, bot - 1, 2, sand)
    put(px, cx, mid, sand)
    put(px, cx, mid + 1, sand)
    return px


# ── 인식범위 — 레이더 링 ──
def detect_icon():
    px = new_canvas()
    rgb = hex_to_rgb("#6fb7cc")
    rgba = rgb + (255,)
    bright = shade(rgb, 0.5)
    cx = cy = 10
    ring(px, cx, cy, 9, 7.4, rgba)
    ring(px, cx, cy, 6, 4.6, rgba)
    circle(px, cx, cy, 2.2, bright)
    return px


# ── Jombie Shrimp 체력 — 하트 ──
def heart_icon():
    px = new_canvas()
    rgb = hex_to_rgb(ZOMBIE_GREEN)
    rgba = rgb + (255,)
    hi = shade(rgb, 0.4)
    cx, cy = 10, 8
    circle(px, cx - 4, cy, 4.2, rgba)
    circle(px, cx + 4, cy, 4.2, rgba)
    top_y, bot_y, base_half = cy, 17, 8
    for y in range(top_y, bot_y + 1):
        t = (y - top_y) / (bot_y - top_y)
        half = max(0, round(base_half * (1 - t)))
        rect(px, cx - half, y, cx + half, y, rgba)
    circle(px, cx - 5, cy - 1, 1.6, hi)
    return px


# ── 릴리 꽃(부활/맹독/미구현 특성 공용, 색만 다름) ──
def lily_icon(hexcolor, muted=False):
    px = new_canvas()
    rgb = hex_to_rgb(hexcolor)
    if muted:
        rgb = tuple(int(c * 0.65) for c in rgb)
    petal = rgb + (255,)
    petal_dark = shade(rgb, -0.35)
    center = shade(rgb, 0.55 if not muted else 0.2)
    stem = (86, 138, 72, 255)
    cx, cy = 10, 9
    for i in range(5):
        ang = -math.pi / 2 + i * 2 * math.pi / 5
        pcx = cx + 5.2 * math.cos(ang)
        pcy = cy + 5.2 * math.sin(ang)
        circle(px, pcx, pcy, 3.4, petal)
    for i in range(5):
        ang = -math.pi / 2 + i * 2 * math.pi / 5
        pcx = cx + 5.2 * math.cos(ang)
        pcy = cy + 5.2 * math.sin(ang)
        circle(px, pcx, pcy, 1.3, petal_dark)
    circle(px, cx, cy, 2.6, center)
    for y in range(cy + 4, 18):
        put(px, cx, y, stem)
    return px


# ── 기동 — 부츠 ──
def boot_icon():
    px = new_canvas()
    rgb = hex_to_rgb(ZOMBIE_GREEN)
    rgba = rgb + (255,)
    dark = shade(rgb, -0.45)
    hi = shade(rgb, 0.35)
    rect(px, 6, 2, 12, 10, rgba)
    rect(px, 5, 10, 14, 13, rgba)
    rect(px, 4, 13, 17, 16, rgba)
    rect(px, 4, 17, 17, 18, dark)
    rect(px, 6, 2, 12, 3, hi)
    return px


# ── 군집 — 뭉친 원 4개 ──
def swarm_icon():
    px = new_canvas()
    rgb = hex_to_rgb(ZOMBIE_GREEN)
    rgba = rgb + (255,)
    dark = shade(rgb, -0.4)
    hi = shade(rgb, 0.4)
    circle(px, 7, 7, 3.6, dark)
    circle(px, 13, 7, 3.2, rgba)
    circle(px, 7, 14, 3.2, rgba)
    circle(px, 13, 14, 3.6, dark)
    circle(px, 10, 10.5, 3.0, hi)
    return px


# ── 감염 — 스파이크 볼(바이러스) ──
def infect_icon():
    px = new_canvas()
    rgb = hex_to_rgb(ZOMBIE_GREEN)
    rgba = rgb + (255,)
    dark = shade(rgb, -0.4)
    hi = shade(rgb, 0.45)
    cx, cy = 10, 10
    circle(px, cx, cy, 5.2, rgba)
    circle(px, cx, cy, 2.6, dark)
    for i in range(8):
        ang = i * 2 * math.pi / 8
        put(px, cx + 6.4 * math.cos(ang), cy + 6.4 * math.sin(ang), hi)
        put(px, cx + 5.2 * math.cos(ang), cy + 5.2 * math.sin(ang), hi)
    return px


# ── 숙련 — 반짝임(스파클) ──
def sparkle_icon():
    px = new_canvas()
    rgb = hex_to_rgb("#e8d15a")
    rgba = rgb + (255,)
    hi = shade(rgb, 0.5)

    def spike(dx, dy, length):
        for i in range(1, length + 1):
            t = i / length
            x, y = 10 + dx * i, 10 + dy * i
            put(px, x, y, rgba if t < 0.7 else hi)
            if i <= 2:
                put(px, x + (1 if dy else 0), y + (1 if dx else 0), rgba)

    spike(0, -1, 8); spike(0, 1, 8); spike(-1, 0, 8); spike(1, 0, 8)
    spike(1, -1, 4); spike(-1, -1, 4); spike(1, 1, 4); spike(-1, 1, 4)
    circle(px, 10, 10, 2.2, hi)
    return px


DASH_COLOR_HEX = {
    "red": "#ff4d5e",
    "orange": "#ff9a3c",
    "yellow": "#ffe14d",
    "green": "#5ad860",
    "blue": "#4d9fff",
    "purple": "#b060e0",
    "white": "#f2f2f2",
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    icons = {}
    for key, hexcolor in DASH_COLOR_HEX.items():
        icons[f"dash_{key}.png"] = chevron_icon(hexcolor)
    icons["cdmana.png"] = hourglass_icon()
    icons["detect.png"] = detect_icon()
    icons["zombie_hp.png"] = heart_icon()
    icons["zombie_yellow_revive.png"] = lily_icon("#f4d84a")
    icons["zombie_red_poison.png"] = lily_icon("#e05a4d")
    icons["zombie_black.png"] = lily_icon("#6a5a8a", muted=True)
    icons["zombie_move.png"] = boot_icon()
    icons["zombie_swarm.png"] = swarm_icon()
    icons["zombie_infect.png"] = infect_icon()
    icons["zombie_mastery.png"] = sparkle_icon()

    for name, px in icons.items():
        preview(px, name)
        write_png(os.path.join(OUT_DIR, name), px)


if __name__ == "__main__":
    main()
