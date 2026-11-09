#!/usr/bin/env python3
"""Draw the DraftForgeCAD icon (1024 x 1024 PNG) with Pillow.

Usage: python3 scripts/make_icon.py [output.png]   (default: build/icon-next.png)

A blue-to-teal rounded tile with a white drafting grid, an arc, a U-shaped outline and a
yellow CAD crosshair. Everything is laid out on a 1024 px canvas and drawn at 4x, then
scaled down for smooth edges. The grid is centred on the tile: 8 lines, 96 px apart,
at 176 ... 848 on both axes, running from 120 to 904.
"""
import sys
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                        # final size, supersampling factor
TILE = (40, 40, 984, 984)                 # rounded tile, centred on 512
RADIUS = 200
TOP_LEFT, BOTTOM_RIGHT = (31, 111, 229), (15, 167, 160)   # diagonal gradient
WHITE, YELLOW = (255, 255, 255, 255), (255, 209, 102, 255)
GRID = [176 + 96 * i for i in range(8)]   # symmetric about 512
GRID_FROM, GRID_TO, GRID_W = 120, 904, 4


def s(v):
    return v * SS


def main(out):
    W = s(SIZE)
    # gradient running from the top-left corner to the bottom-right corner
    grad = Image.new('RGBA', (W, W))
    gp = grad.load()
    for y in range(W):
        for x in range(0, W, SS):  # constant across each 4 px block keeps this quick
            t = (x + y) / (2 * W)
            c = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT)) + (255,)
            for k in range(SS):
                gp[x + k, y] = c
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([s(v) for v in TILE], radius=s(RADIUS), fill=255)
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # grid
    for c in GRID:
        d.rectangle([s(c - GRID_W / 2), s(GRID_FROM), s(c + GRID_W / 2), s(GRID_TO)], fill=WHITE)
        d.rectangle([s(GRID_FROM), s(c - GRID_W / 2), s(GRID_TO), s(c + GRID_W / 2)], fill=WHITE)

    # arc: centre (512, 512), outer radius 263, 34 px wide, from 202 to 338 degrees (clockwise, y down)
    R = 263
    d.arc([s(512 - R), s(512 - R), s(512 + R), s(512 + R)], start=202, end=338, fill=WHITE, width=s(34))

    # U-shaped outline, 34 px thick
    d.rectangle([s(246), s(600), s(280), s(818)], fill=WHITE)
    d.rectangle([s(744), s(600), s(778), s(818)], fill=WHITE)
    d.rectangle([s(246), s(784), s(778), s(818)], fill=WHITE)

    # crosshair centred at (512, 470): bars 22 px thick, pick box 85 px with an 18 px ring
    d.rectangle([s(342), s(459), s(682), s(481)], fill=YELLOW)
    d.rectangle([s(501), s(300), s(523), s(640)], fill=YELLOW)
    d.rectangle([s(470), s(428), s(555), s(513)], outline=YELLOW, width=s(18))

    img.resize((SIZE, SIZE), Image.LANCZOS).save(out)
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'build/icon-next.png')
