#!/usr/bin/env python3
"""스킬 아이콘 픽셀 스프라이트 생성 → assets/skills/.

PIL 없이 표준 라이브러리(zlib/struct)만으로 16×16 RGBA PNG를 쓴다.
사용: python3 tools/generate_skill_icons.py
"""
import os
import struct
import zlib

SIZE = 16
TRANS = (0, 0, 0, 0)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "skills")


def write_png(path, pixels, scale=1):
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


def make_dash():
    """혈귀 돌진: 이중 셰브런(») — 왼쪽은 잔상(어두움), 오른쪽은 본체(밝음) + 스피드 라인."""
    px = [[TRANS] * SIZE for _ in range(SIZE)]

    def put(x, y, c):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            px[y][x] = c

    def chevron(ox, dark, main, hi):
        # 오른쪽을 향한 셰브런: 위팔(y2~7)과 아래팔(y8~13)이 x로 3px 두께
        for y in range(2, 14):
            d = y - 2 if y <= 7 else 13 - y
            put(ox + d, y, dark)
            put(ox + d + 1, y, main)
            put(ox + d + 2, y, hi)

    chevron(1, (74, 18, 38, 255), (140, 38, 60, 255), (178, 60, 82, 255))     # 잔상
    chevron(7, (150, 30, 55, 255), (224, 72, 88, 255), (255, 168, 182, 255))  # 본체
    # 스피드 라인 (본체 뒤 잔광)
    for x in (0, 1):
        put(x, 7, (255, 136, 152, 150))
        put(x, 8, (255, 136, 152, 150))
    put(4, 0, (255, 210, 218, 190))
    put(5, 1, (255, 168, 182, 150))
    put(4, 15, (255, 210, 218, 190))
    put(5, 14, (255, 168, 182, 150))
    return px


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    write_png(os.path.join(OUT_DIR, "skill_dash.png"), make_dash())


if __name__ == "__main__":
    main()
