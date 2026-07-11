#!/usr/bin/env python3
"""새우 스킬 패턴 스프라이트를 색상별로 굽는다 → assets/shrimp_variants/.

베이스 패턴(SPECKLE/RILI/BACKLINE.png)은 흰색·회색조 시트다. 각 픽셀의 밝기를
그대로 유지한 채 목표 색을 곱해(multiply) 색상별 변형을 만든다. 흰 부분은 목표
색 그대로, 회색(RILI 음영)은 어둡게 물들어 패턴 내부 음영이 보존된다.

PIL 없이 표준 라이브러리(zlib/struct)만으로 8비트 RGBA PNG를 읽고 쓴다.
사용: python3 tools/generate_pattern_colors.py
"""
import os
import struct
import zlib

VARIANT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "shrimp_variants")
PATTERNS = ["SPECKLE", "RILI", "BACKLINE"]

# 14색 팔레트 (Shrimprium 팔레트 기준). skillPatterns.js의 PATTERN_COLORS와 동기화할 것.
COLORS = {
    "red":         (0xff, 0x47, 0x57),
    "dark_red":    (0x5c, 0x0f, 0x0f),
    "orange":      (0xe8, 0x85, 0x0a),
    "blue":        (0x3f, 0x6f, 0xf3),
    "dark_blue":   (0x0f, 0x1f, 0x5c),
    "yellow":      (0xf3, 0xc8, 0x3f),
    "dark_yellow": (0x6e, 0x5a, 0x16),
    "green":       (0x3f, 0x9a, 0x3f),
    "dark_green":  (0x12, 0x3d, 0x18),
    "teal":        (0x17, 0xa6, 0xa6),
    "purple":      (0x7a, 0x3f, 0xb3),
    "dark_purple": (0x3a, 0x1a, 0x5c),
    "black":       (0x20, 0x20, 0x20),
    "gray":        (0x9a, 0xa0, 0xa8),
}


def read_rgba_png(path):
    """8비트 RGBA(color type 6) PNG → (w, h, [[(r,g,b,a),...], ...])."""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "PNG 시그니처 아님"
    pos = 8
    width = height = bit_depth = color_type = None
    idat = b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", body[:10])
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
        pos += 12 + length
    assert bit_depth == 8 and color_type == 6, "8비트 RGBA만 지원"
    raw = zlib.decompress(idat)
    stride = width * 4
    rows = []
    prev = bytearray(stride)
    p = 0
    for _ in range(height):
        ftype = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        _unfilter(ftype, line, prev, 4)
        rows.append([tuple(line[i:i + 4]) for i in range(0, stride, 4)])
        prev = line
    return width, height, rows


def _unfilter(ftype, line, prev, bpp):
    """PNG 스캔라인 필터 역변환 (0=None,1=Sub,2=Up,3=Average,4=Paeth)."""
    if ftype == 0:
        return
    for i in range(len(line)):
        a = line[i - bpp] if i >= bpp else 0
        b = prev[i]
        c = prev[i - bpp] if i >= bpp else 0
        x = line[i]
        if ftype == 1:
            line[i] = (x + a) & 0xff
        elif ftype == 2:
            line[i] = (x + b) & 0xff
        elif ftype == 3:
            line[i] = (x + ((a + b) >> 1)) & 0xff
        elif ftype == 4:
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
            line[i] = (x + pr) & 0xff
        else:
            raise ValueError(f"미지원 필터 {ftype}")


def write_rgba_png(path, rows):
    h = len(rows)
    w = len(rows[0])
    raw = b"".join(
        b"\x00" + b"".join(bytes(px) for px in row) for row in rows
    )

    def chunk(tag, body):
        blob = tag + body
        return struct.pack(">I", len(body)) + blob + struct.pack(">I", zlib.crc32(blob))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def tint(rows, color):
    """각 픽셀 밝기(회색조 가정: R 채널)를 유지한 채 목표 색을 곱한다. 알파 보존."""
    cr, cg, cb = color
    out = []
    for row in rows:
        line = []
        for r, g, b, a in row:
            lum = r  # 베이스는 흰/회색조라 R=G=B
            line.append((
                round(cr * lum / 255),
                round(cg * lum / 255),
                round(cb * lum / 255),
                a,
            ))
        out.append(line)
    return out


def main():
    total = 0
    for pat in PATTERNS:
        w, h, rows = read_rgba_png(os.path.join(VARIANT_DIR, f"{pat}.png"))
        for name, color in COLORS.items():
            out_path = os.path.join(VARIANT_DIR, f"{pat}-{name}.png")
            write_rgba_png(out_path, tint(rows, color))
            total += 1
        print(f"{pat}.png ({w}x{h}) → {len(COLORS)}색")
    print(f"총 {total}개 생성 완료 ({VARIANT_DIR})")


if __name__ == "__main__":
    main()
