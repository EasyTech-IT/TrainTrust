"""Erzeugt alle PNG-Icons aus einer Zeichnung. Aufruf: python scripts/make_icons.py"""
from PIL import Image, ImageDraw
import os

TEAL = (14, 107, 92)
WHITE = (255, 255, 255)
S = 1024  # Zeichenfläche


def draw(size, padding=0.0, rounded=True, bg=True):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        if rounded:
            d.rounded_rectangle((0, 0, S, S), radius=int(S * 0.22), fill=TEAL)
        else:
            d.rectangle((0, 0, S, S), fill=TEAL)
    k = 1 - 2 * padding
    o = S * padding

    def p(v):
        return o + v * S * k / 512

    w = int(28 * S * k / 512)
    d.rounded_rectangle((p(144), p(112), p(368), p(352)), radius=int(p(48) - p(0)), outline=WHITE, width=w)
    d.line((p(144), p(224), p(368), p(224)), fill=WHITE, width=w)
    d.line((p(200), p(400), p(164), p(444)), fill=WHITE, width=w)
    d.line((p(312), p(400), p(348), p(444)), fill=WHITE, width=w)
    for cx in (204, 308):
        r = 18 * S * k / 512
        d.ellipse((p(cx) - r, p(318) - r, p(cx) + r, p(318) + r), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs("public/icons", exist_ok=True)
os.makedirs("assets", exist_ok=True)
draw(192).save("public/icons/icon-192.png")
draw(512).save("public/icons/icon-512.png")
draw(512, padding=0.12, rounded=False).save("public/icons/icon-maskable-512.png")
draw(1024, rounded=False).convert("RGB").save("assets/icon-only.png")
draw(1024, padding=0.18, rounded=False, bg=False).save("assets/icon-foreground.png")
Image.new("RGB", (1024, 1024), TEAL).save("assets/icon-background.png")
print("Icons erzeugt")
