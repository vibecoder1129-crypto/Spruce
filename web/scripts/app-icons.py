"""Draws the Spruce app icons: a white spruce on the brand green (slice 11).

Run from web/: python3 scripts/app-icons.py (needs Pillow).
"""
from PIL import Image, ImageDraw

GREEN = (27, 67, 50, 255)
WHITE = (255, 255, 255, 255)

def icon(size: int, scale: float, rounded: bool) -> Image.Image:
    big = size * 4
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=GREEN)
    else:
        d.rectangle([0, 0, big, big], fill=GREEN)
    c = big / 2
    h = big * scale  # height of the tree
    top = c - h / 2
    tiers = [(0.00, 0.42, 0.34), (0.22, 0.66, 0.48), (0.44, 0.90, 0.62)]
    for start, end, half in tiers:
        d.polygon([(c, top + start * h), (c - half * h, top + end * h), (c + half * h, top + end * h)], fill=WHITE)
    trunk = 0.07 * h
    d.rectangle([c - trunk, top + 0.88 * h, c + trunk, top + h], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)

out = "public/icons"
icon(192, 0.62, False).save(f"{out}/icon-192.png")
icon(512, 0.62, False).save(f"{out}/icon-512.png")
icon(512, 0.48, False).save(f"{out}/maskable-512.png")  # tree inside the 80% safe zone
icon(180, 0.6, False).convert("RGB").save("src/app/apple-icon.png")
icon(64, 0.66, True).save("src/app/icon.png")
