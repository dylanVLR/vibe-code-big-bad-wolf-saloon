#!/usr/bin/env python3
"""
tools/make-splash.py — generate iOS PWA launch screens (apple-touch-startup-image).

iOS needs an EXACT-pixel launch image per device + orientation, or it shows a blank
background. We render a branded splash (saloon gradient + "BIG BAD WOLF SALOON" in Rye
+ the wolf) at each target device's resolution, in portrait and landscape, and print
the <link rel="apple-touch-startup-image"> tags to paste into index.html.

  python3 tools/make-splash.py
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = "assets/splash"
os.makedirs(OUT, exist_ok=True)
RYE = "/tmp/fonts/Rye.ttf"
WOLF = "assets/wolf_poster.webp"

# (label, css-width, css-height, device-pixel-ratio) — portrait orientation values
DEVICES = [
    ("16promax",   440, 956, 3),   # iPhone 16 Pro Max  (the client's phone)
    ("15promax",   430, 932, 3),   # 14/15 Pro Max, 15/16 Plus
    ("16pro",      402, 874, 3),   # iPhone 16 Pro
    ("15pro",      393, 852, 3),   # 14 Pro, 15, 15 Pro, 16
    ("13",         390, 844, 3),   # 12/13/14
    ("11promax",   414, 896, 3),   # XS Max, 11 Pro Max
    ("11",         414, 896, 2),   # XR, 11
    ("mini",       375, 812, 3),   # 12/13 mini
    ("se",         375, 667, 2),   # SE 2/3, 8
]

def gradient(W, H):
    """Dark saloon background: brown-green radial glow on near-black."""
    g = 160
    yy, xx = np.mgrid[0:g, 0:g]
    cx, cy = g/2, g*0.46
    d = np.clip(np.hypot((xx-cx), (yy-cy)) / (g*0.72), 0, 1)
    r = (26 + (10-26)*d).astype('uint8')
    gg = (54 + (8-54)*d).astype('uint8')
    b = (28 + (6-28)*d).astype('uint8')
    a = np.full((g, g), 255, 'uint8')
    return Image.fromarray(np.dstack([r, gg, b, a]), 'RGBA').resize((W, H), Image.LANCZOS)

def fit_font(text, target_w, max_size):
    size = max_size
    while size > 10:
        f = ImageFont.truetype(RYE, size)
        w = f.getbbox(text)[2]
        if w <= target_w:
            return f
        size -= 2
    return ImageFont.truetype(RYE, 10)

def draw_title(img, lines, top_frac, max_w):
    d = ImageDraw.Draw(img)
    W, H = img.size
    y = int(H * top_frac)
    for ln in lines:
        f = fit_font(ln, max_w, int(H * 0.085))
        bb = f.getbbox(ln)
        tw, th = bb[2]-bb[0], bb[3]-bb[1]
        x = (W - tw)//2 - bb[0]
        # soft dark shadow then gold fill
        d.text((x+max(2, W//400), y+max(2, W//400)), ln, font=f, fill=(0, 0, 0, 170))
        d.text((x, y), ln, font=f, fill=(245, 200, 70, 255))
        y += int(th * 1.18)

def splash(W, H):
    img = gradient(W, H)
    landscape = W > H
    short = min(W, H)
    # title (wrap on portrait to keep it big)
    title = ["BIG BAD WOLF", "SALOON"] if not landscape else ["BIG BAD WOLF SALOON"]
    draw_title(img, title, 0.10 if not landscape else 0.10, int(W * (0.86 if not landscape else 0.7)))
    # wolf, centered in the lower area (crop the bottom watermark strip)
    wolf = Image.open(WOLF).convert("RGBA")
    wolf = wolf.crop((0, 0, wolf.width, wolf.height - 48))
    target_h = int(H * (0.66 if landscape else 0.55))
    scale = target_h / wolf.height
    nw, nh = int(wolf.width*scale), int(wolf.height*scale)
    wolf = wolf.resize((nw, nh), Image.LANCZOS)
    # soft ground shadow
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ew = nw*0.7
    cx = W/2
    by = H*0.93
    ImageDraw.Draw(sh).ellipse([cx-ew/2, by-short*0.04, cx+ew/2, by+short*0.04], fill=(0, 0, 0, 150))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(short//40 or 1)))
    img.alpha_composite(wolf, ((W-nw)//2, int(H*0.93) - nh))
    return img

links = []
made = 0
for label, w, h, dpr in DEVICES:
    pw, ph = w*dpr, h*dpr                    # portrait pixels
    for orient, (W, H) in (("portrait", (pw, ph)), ("landscape", (ph, pw))):
        path = f"{OUT}/{label}-{orient}.png"
        splash(W, H).convert("RGB").save(path)
        made += 1
        media = (f"(device-width: {w}px) and (device-height: {h}px) and "
                 f"(-webkit-device-pixel-ratio: {dpr}) and (orientation: {orient})")
        links.append(f'  <link rel="apple-touch-startup-image" media="{media}" href="{path}">')

with open("/tmp/splash-links.html", "w") as f:
    f.write("\n".join(links) + "\n")
print(f"Generated {made} splash images in {OUT}/")
print("Link tags written to /tmp/splash-links.html")
