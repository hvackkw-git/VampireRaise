# tools/generate_zombie_dummy.py
# 노예(좀비) 인체형 더미 스프라이트 생성기 — 24×24 × 8프레임 걷기 = 192×24 PNG.
# 규격: 몸통은 캔버스 하단 16px(y 8~23) 안, 폭 ≤20px, 발이 맨 아래변(y=23).
#       왼쪽을 바라보는 기본 방향 (렌더러가 dir>0일 때 좌우 반전).
# 사용: python3 tools/generate_zombie_dummy.py  →  assets/chars/zombie_walk.png

import os
import struct
import zlib

W, H, FRAMES = 24, 24, 8
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "chars", "zombie_walk.png")

# 팔레트 (RGBA)
HAIR   = (22, 22, 30, 255)      # 떡진 검은 머리
SKIN   = (134, 178, 111, 255)   # 좀비 피부(청록빛 녹색)
SKIN_D = (100, 140, 85, 255)    # 피부 음영
EYE    = (224, 72, 72, 255)     # 붉은 눈
CLOTH  = (58, 58, 74, 255)      # 낡은 옷(암회색)
CLOTH_D= (38, 38, 52, 255)      # 옷 음영
PANTS  = (46, 46, 60, 255)      # 바지
SHOE   = (18, 18, 24, 255)      # 신발


def make_canvas():
    return [[(0, 0, 0, 0)] * (W * FRAMES) for _ in range(H)]


def rect(px, fx, x, y, w, h, color):
    for yy in range(y, y + h):
        if not 0 <= yy < H:
            continue
        for xx in range(x, x + w):
            if 0 <= xx < W:
                px[yy][fx + xx] = color


def draw_frame(px, f):
    fx = f * W
    # 걷기 위상: 다리 벌림 정도(-2~2). 다리가 교차(0)할 때 몸이 1px 들썩.
    swing = [0, 1, 2, 1, 0, -1, -2, -1][f]
    bob = 1 if swing == 0 else 0
    b = -bob  # 몸 전체 y 오프셋 (들썩일 때 위로 1px)

    # ── 다리/발 (y 19~23, 발은 항상 바닥에) ──
    leg_front_x = 10 + swing   # 앞다리 (왼쪽 = 진행 방향)
    leg_back_x = 13 - swing    # 뒷다리
    rect(px, fx, leg_front_x, 19, 2, 4, PANTS)
    rect(px, fx, leg_back_x, 19, 2, 4, PANTS)
    rect(px, fx, leg_front_x - 1, 23, 3, 1, SHOE)
    rect(px, fx, leg_back_x, 23, 3, 1, SHOE)

    # ── 몸통 (y 14~18) — 낡은 옷 ──
    rect(px, fx, 9, 14 + b, 7, 5, CLOTH)
    rect(px, fx, 14, 14 + b, 2, 5, CLOTH_D)   # 등쪽 음영
    rect(px, fx, 9, 18 + b, 7, 1, CLOTH_D)    # 밑단 음영

    # ── 좀비 팔: 앞으로 쭉 뻗음 (진행 방향 왼쪽) + 손 ──
    arm_y = 14 + b + (1 if f % 4 >= 2 else 0)  # 팔도 느리게 위아래 흐느적
    rect(px, fx, 4, arm_y, 6, 2, CLOTH)
    rect(px, fx, 2, arm_y, 2, 2, SKIN)         # 손
    rect(px, fx, 4, arm_y + 1, 6, 1, CLOTH_D)  # 팔 아래 음영

    # ── 목 (y 13) ──
    rect(px, fx, 11, 13 + b, 3, 1, SKIN_D)

    # ── 머리 (y 8~12, 앞으로 1px 숙인 구부정한 자세) ──
    rect(px, fx, 8, 9 + b, 7, 4, SKIN)         # 얼굴
    rect(px, fx, 8, 8 + b, 7, 1, HAIR)         # 머리카락 윗줄
    rect(px, fx, 13, 9 + b, 2, 3, HAIR)        # 뒤통수 머리카락
    rect(px, fx, 8, 12 + b, 7, 1, SKIN_D)      # 턱 음영
    rect(px, fx, 9, 10 + b, 1, 1, EYE)         # 붉은 눈 (왼쪽 응시)


def png_chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, width, height, px):
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *p) for p in row) for row in px
    )
    data = (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + png_chunk(b"IDAT", zlib.compress(raw, 9))
            + png_chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def main():
    px = make_canvas()
    for f in range(FRAMES):
        draw_frame(px, f)
    write_png(OUT, W * FRAMES, H, px)
    print(f"wrote {os.path.normpath(OUT)} ({W * FRAMES}x{H}, {FRAMES} frames)")


if __name__ == "__main__":
    main()
