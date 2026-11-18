#!/usr/bin/env python3
"""GetGround email graphic renderer (UX-imagery style). Pillow only.

Floating white UI cards on the soft teal/pink aurora glow, rounded container with
transparent corners (sits cleanly on light AND dark email backgrounds). Output is a
PNG at 2x for a 560px-wide email slot (1120 x 600 by default).

  python3 hero_image.py spec.json            # writes spec["out"] (default email_graphic.png)

Spec examples (pick one "style"):
  {"style":"cards","cards":[{"title":"Renew your EPC certificate","button":"Renew now","chip":{"text":"Due in 14 days","tone":"warning"}},
                            {"title":"Confirm tenant details","button":"Confirm"}]}
  {"style":"checklist","title":"Your Complete plan","items":["Tenant found and referenced","Deposit protected","Rent collected monthly"]}
  {"style":"stat","chip":"Black Friday","value":"50% off","label":"your first year of Core"}
  {"style":"event","month":"DEC","day":"3","title":"Renters' Rights Act webinar","meta":"Thursday · 12:00pm · Online","button":"Save my place"}
Optional: "height": 300 (display px, 220–360), "out": "file.png".
Rules: minimal text (it must read on a phone), no prices/claims that aren't in the email copy,
sentence case, no em dashes. Keep the real message in the email's live text, not in the image.
"""
import json, os, sys, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_BASE = "https://gg-email.pages.dev/assets/fonts/"
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
FONTS = {"r": "inter-400.ttf", "m": "inter-500.ttf", "b": "inter-600.ttf", "x": "inter-700.ttf",
         "h": "rethink-sans-600.ttf", "H": "rethink-sans-700.ttf"}

W_DISP = 560            # email slot width (px)
OUT = 2                 # output scale (retina)
SS = 2                  # supersample on top of OUT
K = OUT * SS            # display px -> working px

INK = (32, 32, 32); INK2 = (77, 77, 77); GREY = (224, 224, 224); LINE = (236, 238, 240)
TEAL = (0, 94, 107); TEAL_D = (6, 54, 58); WHITE = (255, 255, 255); BG = (247, 248, 247)
TONES = {"success": ((60, 154, 95), (224, 243, 227)), "warning": ((150, 100, 0), (255, 243, 201)),
         "error": ((217, 57, 44), (255, 230, 230)), "info": ((0, 94, 107), (227, 242, 243)),
         "lavender": ((158, 78, 198), (245, 230, 255)), "sage": ((90, 128, 86), (227, 239, 227))}


def font(kind, size):
    os.makedirs(FONT_DIR, exist_ok=True)
    p = os.path.join(FONT_DIR, FONTS[kind])
    if not os.path.exists(p):
        req = urllib.request.Request(FONT_BASE + FONTS[kind], headers={"User-Agent": "gg-email-skill/1"})
        with urllib.request.urlopen(req, timeout=30) as r, open(p, "wb") as f:
            f.write(r.read())
    return ImageFont.truetype(p, int(size * K))


def wrap(text, f, max_w, draw):
    out, cur = [], ""
    for w in str(text).split():
        s = (cur + " " + w).strip()
        if draw.textlength(s, font=f) <= max_w:
            cur = s
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


def background(Wk, Hk):
    small = (max(1, Wk // 16), max(1, Hk // 16))
    g = Image.new("RGB", small, BG); d = ImageDraw.Draw(g); sw, sh = small
    d.ellipse([int(-.30 * sw), int(-.25 * sh), int(.80 * sw), int(1.05 * sh)], fill=(110, 219, 224))
    d.ellipse([int(.48 * sw), int(.30 * sh), int(1.32 * sw), int(1.45 * sh)], fill=(240, 178, 216))
    g = g.filter(ImageFilter.GaussianBlur(max(2, sw // 9))).resize((Wk, Hk), Image.BICUBIC)
    return Image.blend(Image.new("RGB", (Wk, Hk), BG), g, 0.42).convert("RGBA")


def shadow(base, box, radius):
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 6 * K, y0 + 14 * K, x1 - 6 * K, y1 + 10 * K], radius=radius, fill=(60, 55, 70, 34))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12 * K)))


def card(base, box, radius=20):
    shadow(base, box, radius * K)
    ImageDraw.Draw(base).rounded_rectangle(box, radius=radius * K, fill=WHITE)


def button(d, x, y, label, fill=TEAL, size=15):
    f = font("b", size); tw = d.textlength(label, font=f)
    w, h = tw + 36 * K, (size + 22) * K
    d.rounded_rectangle([x, y, x + w, y + h], radius=10 * K, fill=fill)
    d.text((x + 18 * K, y + h / 2), label, font=f, fill=WHITE, anchor="lm")
    return w, h


def chip(d, x, y, text, tone="info", size=12):
    fg, bg = TONES.get(tone, TONES["info"]); f = font("b", size); tw = d.textlength(text, font=f)
    w, h = tw + 20 * K, (size + 12) * K
    d.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=bg)
    d.text((x + 10 * K, y + h / 2), text, font=f, fill=fg, anchor="lm")
    return w, h


def tick(d, cx, cy, r, fill=(60, 154, 95)):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    d.line([(cx - r * .45, cy + r * .02), (cx - r * .1, cy + r * .38), (cx + r * .5, cy - r * .35)], fill=WHITE, width=max(2, int(r * .28)), joint="curve")


def floating_tile(base, cx, cy, r, glyph=None, tone="info"):
    shadow(base, [cx - r, cy - r, cx + r, cy + r], r)
    d = ImageDraw.Draw(base); d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    fg, _ = TONES.get(tone, TONES["info"])
    if glyph == "tick":
        tick(d, cx, cy, r * .55, fill=fg)
    elif glyph:
        d.text((cx, cy), glyph, font=font("x", r / K * .9), fill=fg, anchor="mm")


def action_card(base, x, y, w, c):
    d = ImageDraw.Draw(base); pad = 24 * K
    ft = font("b", 19); lines = wrap(c.get("title", ""), ft, w - 2 * pad - 40 * K, d)[:2]
    h = pad + (30 * K if c.get("chip") else 0) + len(lines) * 26 * K + 14 * K + 2 * 12 * K + 22 * K + 46 * K + pad
    card(base, [x, y, x + w, y + h]); d = ImageDraw.Draw(base); cy = y + pad
    if c.get("chip"):
        ch = c["chip"] if isinstance(c["chip"], dict) else {"text": c["chip"]}
        chip(d, x + pad, cy, ch.get("text", ""), ch.get("tone", "info")); cy += 30 * K
    for ln in lines:
        d.text((x + pad, cy), ln, font=ft, fill=INK); cy += 26 * K
    cy += 14 * K
    for frac in (0.78, 0.52):  # placeholder lines
        d.rounded_rectangle([x + pad, cy, x + pad + (w - 2 * pad) * frac, cy + 9 * K], radius=5 * K, fill=LINE); cy += 21 * K
    cy += 14 * K
    if c.get("button"):
        button(d, x + pad, cy, c["button"])
    # pencil-ish dot top-right
    r = 15 * K; ex, ey = x + w - pad - r, y + pad + r
    d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(227, 242, 243))
    d.line([(ex - r * .4, ey + r * .4), (ex + r * .4, ey - r * .4)], fill=TEAL, width=int(2.5 * K))
    return h


def render(spec):
    Hd = max(220, min(360, int(spec.get("height", 300))))
    Wk, Hk = W_DISP * K, Hd * K
    img = background(Wk, Hk)
    style = spec.get("style", "cards")

    if style == "cards":
        cards = (spec.get("cards") or [{"title": "Your next step", "button": "Start now"}])[:3]
        cw = 330 * K
        x = (Wk - cw) // 2; tmp = Image.new("RGBA", img.size, (0, 0, 0, 0))
        h = action_card(tmp, 0, 0, cw, cards[0]); y = max(14 * K, (Hk - h) // 2 + (len(cards) - 1) * 8 * K)
        # extra cards = a neat stack peeking out above (more to do), no extra text
        for i in range(len(cards) - 1, 0, -1):
            inset, up = 22 * K * i, 14 * K * i
            layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            card(layer, [x + inset, y - up, x + cw - inset, y - up + h])
            layer.putalpha(layer.split()[3].point(lambda v, i=i: int(v * (0.85 - 0.2 * i))))
            img.alpha_composite(layer)
        action_card(img, x, y, cw, cards[0])
        floating_tile(img, x - 34 * K, y + 40 * K, 24 * K, "tick", "success")
        floating_tile(img, x + cw + 30 * K, y + h - 50 * K, 22 * K, "£", "info")

    elif style == "checklist":
        items = (spec.get("items") or [])[:4]; cw = 360 * K; pad = 26 * K
        h = pad + 34 * K + len(items) * 44 * K + pad - 10 * K
        x, y = (Wk - cw) // 2, (Hk - h) // 2
        card(img, [x, y, x + cw, y + h]); d = ImageDraw.Draw(img)
        d.text((x + pad, y + pad), spec.get("title", ""), font=font("h", 19), fill=INK)
        cy = y + pad + 40 * K
        for it in items:
            tick(d, x + pad + 11 * K, cy + 11 * K, 11 * K)
            d.text((x + pad + 34 * K, cy + 11 * K), str(it)[:42], font=font("m", 15), fill=INK2, anchor="lm")
            cy += 44 * K
            if it is not items[-1]:
                d.line([(x + pad, cy - 11 * K), (x + cw - pad, cy - 11 * K)], fill=LINE, width=K)
        floating_tile(img, x + cw + 28 * K, y + 30 * K, 22 * K, "%", "lavender")

    elif style == "stat":
        cw = 330 * K; pad = 28 * K; h = 190 * K; x, y = (Wk - cw) // 2, (Hk - h) // 2
        card(img, [x, y, x + cw, y + h]); d = ImageDraw.Draw(img); cy = y + pad
        if spec.get("chip"):
            chip(d, x + pad, cy, spec["chip"], spec.get("tone", "info")); cy += 36 * K
        d.text((x + pad, cy), str(spec.get("value", "")), font=font("H", 46), fill=TEAL_D); cy += 62 * K
        for ln in wrap(spec.get("label", ""), font("m", 16), cw - 2 * pad, d)[:2]:
            d.text((x + pad, cy), ln, font=font("m", 16), fill=INK2); cy += 22 * K
        floating_tile(img, x - 32 * K, y + h - 46 * K, 22 * K, "tick", "success")

    elif style == "event":
        cw = 400 * K; pad = 26 * K; h = pad + 84 * K + pad + ((22 + 37) * K if spec.get("button") else 0)
        x, y = (Wk - cw) // 2, (Hk - h) // 2
        card(img, [x, y, x + cw, y + h]); d = ImageDraw.Draw(img)
        tx, ty, tw, th = x + pad, y + pad, 74 * K, 84 * K
        d.rounded_rectangle([tx, ty, tx + tw, ty + th], radius=14 * K, fill=WHITE, outline=GREY, width=K)
        d.rounded_rectangle([tx, ty, tx + tw, ty + 28 * K], radius=14 * K, fill=TEAL_D)
        d.rectangle([tx, ty + 16 * K, tx + tw, ty + 28 * K], fill=TEAL_D)
        d.text((tx + tw / 2, ty + 14 * K), str(spec.get("month", "")).upper()[:3], font=font("x", 12), fill=(163, 236, 238), anchor="mm")
        d.text((tx + tw / 2, ty + 57 * K), str(spec.get("day", "")), font=font("H", 30), fill=TEAL_D, anchor="mm")
        lx = tx + tw + 20 * K; cy = ty + 2 * K
        for ln in wrap(spec.get("title", ""), font("h", 19), x + cw - pad - lx, d)[:2]:
            d.text((lx, cy), ln, font=font("h", 19), fill=INK); cy += 25 * K
        d.text((lx, cy + 6 * K), spec.get("meta", ""), font=font("r", 14), fill=INK2)
        if spec.get("button"):
            button(d, tx, ty + th + 22 * K, spec["button"])
        floating_tile(img, x + cw + 26 * K, y + 34 * K, 22 * K, "tick", "success")
    else:
        sys.exit("style must be cards | checklist | stat | event")

    # rounded container, transparent corners (works on light and dark email backgrounds)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, Wk - 1, Hk - 1], radius=24 * K, fill=255)
    img.putalpha(mask)
    return img.resize((W_DISP * OUT, Hd * OUT), Image.LANCZOS)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    spec = json.load(open(sys.argv[1]))
    out = spec.get("out", "email_graphic.png")
    render(spec).save(out, optimize=True)
    print(f"Saved {out} ({os.path.getsize(out)//1024} KB). Look at it before uploading. Display width 560px.")
