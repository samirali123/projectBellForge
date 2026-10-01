"""extract-wordmark.py

Cuts the two full BellForge lockups (bell + wordmark) out of the Ember Bell
concept board and makes their card background transparent, so they sit on
any surface:

  branding/logo/bellforge-logo-on-light.png   dark "Bell", for light themes
  branding/logo/bellforge-logo-on-dark.png    white "Bell", for dark themes

Run from the repo root:  python3 tools/extract-wordmark.py
Needs Pillow. If a vector (SVG) export of the lockup becomes available,
use that instead; this is a stand-in cut from the 2560px board PNG.
"""

from PIL import Image

BOARD = "branding/logo/ember-bell-concept-board.png"
PAD = 6  # px of transparent breathing room around the artwork

# (search region inside the card, output file). The region is inset from
# the card's rounded border so only the lockup itself is picked up.
LOCKUPS = [
    ((160, 360, 1450, 820), "branding/logo/bellforge-logo-on-light.png"),
    ((1600, 360, 2420, 820), "branding/logo/bellforge-logo-on-dark.png"),
]


def color_to_alpha(px, bg):
    """GIMP-style color-to-alpha: the least alpha that, composited over bg,
    reproduces px exactly. Keeps anti-aliased edges free of bg-colored halos."""
    alpha = 0.0
    for p, b in zip(px, bg):
        if p > b:
            a = (p - b) / (255 - b) if b < 255 else 0.0
        elif p < b:
            a = (b - p) / b if b > 0 else 0.0
        else:
            a = 0.0
        alpha = max(alpha, a)
    if alpha <= 0.0:
        return (0, 0, 0, 0)
    color = tuple(round(min(255, max(0, (p - b) / alpha + b))) for p, b in zip(px, bg))
    return color + (round(alpha * 255),)


def bbox(im, region, bg, threshold=40):
    x0, y0, x1, y1 = region
    px = im.load()
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if sum(abs(c - b) for c, b in zip(px[x, y], bg)) > threshold:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


board = Image.open(BOARD).convert("RGB")
for region, out in LOCKUPS:
    bg = board.getpixel((region[0] + 40, region[1] + 90))
    x0, y0, x1, y1 = bbox(board, region, bg)
    crop = board.crop((x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))
    result = Image.new("RGBA", crop.size)
    src, dst = crop.load(), result.load()
    for y in range(crop.height):
        for x in range(crop.width):
            dst[x, y] = color_to_alpha(src[x, y], bg)
    result.save(out)
    print(f"wrote {out} ({result.width}x{result.height}, background {bg} made transparent)")
