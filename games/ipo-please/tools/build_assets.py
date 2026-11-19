#!/usr/bin/env python3
"""把像素素材预渲染成网页游戏用的图集，输出仓库根目录的 assets.js。

  ../.venv/bin/python tools/build_assets.py     （在仓库根目录跑；依赖见 tools/requirements.txt）

- 字体图集：扫描根目录下所有 JS/HTML 里出现的字符，只渲染这些字（缝合像素字体 8/10/12px）
- 精灵图集：旅客立绘（各种表情）、证件照、背景、印章、锦旗、早安图、报纸配图、崩盘时会掉下来的东西
- 画法全部复用 pp/（从视频 video/pp/ 同步过来的副本），所以游戏和视频长得一样
产物是一个 JS 文件（图片以 base64 内嵌），所以 index.html 直接双击也能玩。
"""
import base64
import io
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops

TOOLS = Path(__file__).resolve().parent
SITE = TOOLS.parent
sys.path.insert(0, str(TOOLS))

from pp import booth, cast, cast2  # noqa: E402
from pp.base import FONTS, GOLD, GREEN, RED, SEAL, draw, spark, txt  # noqa: E402
from pp.booth import clean_exterior, fall_sprites, static_layer, window_bg  # noqa: E402
from pp.docs import MorningCard, stamp_mark  # noqa: E402
from pp.people import JINQI_H, JINQI_W, Person, draw_jinqi, photo, wig_sprite  # noqa: E402
from pp.screens import _icon  # noqa: E402

# ———————————————————— 字体 ————————————————————


def used_chars():
    chars = {chr(c) for c in range(32, 127)}
    for p in sorted(SITE.glob("*.js")) + [SITE / "index.html"]:
        if p.name == "assets.js" or not p.exists():
            continue
        chars |= set(p.read_text(encoding="utf-8"))
    return sorted(c for c in chars if c.isprintable() and c not in "\t\r\n")


def glyph_mask(ch, size):
    im = Image.new("L", (size * 2 + 8, size * 2 + 8), 0)
    d = draw(im)
    txt(d, (4, 4), ch, size, 255)
    return im


def build_font():
    chars = used_chars()
    missing = []
    sheets = {}
    for size in (8, 10, 12):
        f = FONTS[size]
        notdef = glyph_mask("͸", size).tobytes()   # 未分配码位 → 缺字方块
        glyphs, cells = {}, []
        for ch in chars:
            m = glyph_mask(ch, size)
            if ch != " " and m.tobytes() == notdef:
                if size == 12:
                    missing.append(ch)
                continue
            adv = round(f.getlength(ch))
            bb = m.getbbox()
            if bb is None:
                glyphs[ch] = [0, 0, 0, 0, 0, 0, adv]
                continue
            crop = m.crop(bb)
            cells.append((ch, crop, bb[0] - 4, bb[1] - 4, adv))
        sheets[size] = (glyphs, cells)
    W = 1024
    x = y = row_h = 0
    placed = []
    for size in (8, 10, 12):
        glyphs, cells = sheets[size]
        for ch, crop, ox, oy, adv in cells:
            if x + crop.width > W:
                x, y, row_h = 0, y + row_h + 1, 0
            placed.append((size, ch, crop, x, y, ox, oy, adv))
            x += crop.width + 1
            row_h = max(row_h, crop.height)
    sheet = Image.new("LA", (W, y + row_h + 1), (255, 0))
    out = {8: {}, 10: {}, 12: {}}
    for size, ch, crop, gx, gy, ox, oy, adv in placed:
        sheet.paste(Image.new("LA", crop.size, (255, 255)), (gx, gy), crop)
        out[size][ch] = [gx, gy, crop.width, crop.height, ox, oy, adv]
    for size in (8, 10, 12):
        out[size].update(sheets[size][0])
    if missing:
        print("字体缺字（会被跳过）：", "".join(missing))
    return sheet, out


# ———————————————————— 人物 ————————————————————

EXPRS = ["neutral", "smile", "grin", "talk", "shock", "nervous", "sad", "angry"]
POOL_EXPRS = ["neutral", "smile", "grin", "talk", "shock", "nervous", "sad"]

SCRIPTED = {
    # 原作的老面孔
    "JOHN": cast.JOHN, "BROWN": cast.BROWN, "EMILY": cast.EMILY, "CAT_GIRL": cast.CAT_GIRL, "HK_GUY": cast.HK_GUY,
    "GRANDPA": cast.GRANDPA, "JORJI": cast.JORJI, "JORJI_SUIT": cast.JORJI_SUIT, "MIKE": cast.MIKE,
    "AUTHOR": cast.AUTHOR, "GUARD": cast.GUARD, "GUARD2": cast.GUARD2,
    # 续作新角色
    "SG1": cast2.SG1, "SG2": cast2.SG2, "SG3": cast2.SG3, "SG_REAL1": cast2.SG_REAL1, "SG_REAL2": cast2.SG_REAL2,
    "JINQI": cast2.JINQI, "JINQI_BARE": cast2.JINQI_BARE, "MAXGUY": cast2.MAXGUY, "APPLE": cast2.APPLE,
    "XIANYU": cast2.XIANYU, "XIANYU_REAL": cast2.XIANYU_REAL, "GRUMPY": cast2.GRUMPY, "CODER": cast2.CODER,
    "RESELLER": cast2.RESELLER, "FISH": cast2.FISH, "BOSS": cast2.BOSS, "TOKYO": cast2.TOKYO,
    "TEXAN": cast2.TEXAN, "JORJI_MASK": cast2.JORJI_MASK, "FISH_MASK": cast2.FISH_MASK, "JORJI_NOSE": cast2.JORJI_NOSE,
}
GROUP_EXPRS = ["smile", "grin", "talk", "neutral", "shock", "sad", "nervous"]


def random_pool(n=24, seed=2026):
    """随机路人：肤色、脸型、发型、衣服都随机——只看地区，不看脸。"""
    rng = random.Random(seed)
    hair_colors = [(42, 34, 31), (30, 26, 24), (80, 60, 44), (96, 64, 44), (206, 176, 104), (160, 156, 150),
                   (140, 70, 40), (60, 46, 40)]
    tops = ["jacket", "suit", "hoodie", "cardigan", "polo", "plaid", "shirt_tie", "tee"]
    top_colors = [(86, 82, 64), (96, 70, 58), (52, 56, 70), (90, 96, 104), (120, 96, 70), (70, 96, 96),
                  (150, 60, 50), (130, 62, 56), (80, 90, 120), (140, 80, 90), (90, 110, 80), (110, 100, 90),
                  (70, 100, 130), (160, 120, 140), (60, 60, 70), (200, 180, 120), (206, 204, 196)]
    people = []
    for i in range(n):
        hair = rng.choice(["short", "short", "side", "slick", "bald", "buzz", "curly", "long", "long", "bun"])
        hat = rng.choice([None] * 7 + ["cap", "flatcap", "cowboy"])
        if hair == "bald" and hat:
            hat = None
        p = Person(
            skin=rng.choice(["light", "mid", "tan", "deep"]),
            face=rng.choice(["oval", "round", "long", "square"]),
            hair=hair,
            hair_color=rng.choice(hair_colors),
            beard=rng.choice([None] * 6 + ["mustache", "stubble"]),
            eyes=rng.choice([None] * 5 + ["glasses", "rimless"]),
            hat=hat,
            hat_color=rng.choice([(150, 48, 42), (70, 62, 56), (60, 80, 110), (150, 108, 70)]),
            top=rng.choice(tops),
            top_color=rng.choice(top_colors),
            inner=rng.choice([(210, 204, 190), (200, 196, 186), (170, 160, 140)]),
            tie=rng.choice([(120, 40, 36), (60, 70, 110), (90, 90, 100)]),
            acc=rng.choice([None] * 12 + ["headphones"]),
            expr=rng.choice(["neutral", "smile"]),
        )
        people.append((f"P{i:02d}", p))
    return people


# ———————————————————— 图集 ————————————————————


class Packer:
    def __init__(self, width=2048):
        self.width = width
        self.items = []

    def add(self, key, im, crop=True):
        im = im.convert("RGBA")
        ox = oy = 0
        if crop:
            bb = im.getchannel("A").getbbox()
            if bb:
                im = im.crop(bb)
                ox, oy = bb[0], bb[1]
        self.items.append((key, im, ox, oy))

    def build(self):
        items = sorted(self.items, key=lambda it: -it[1].height)
        x = y = row_h = 0
        pos = {}
        for key, im, ox, oy in items:
            if x + im.width > self.width:
                x, y, row_h = 0, y + row_h + 1, 0
            pos[key] = (x, y, im.width, im.height, ox, oy)
            x += im.width + 1
            row_h = max(row_h, im.height)
        sheet = Image.new("RGBA", (self.width, y + row_h + 1), (0, 0, 0, 0))
        for key, im, ox, oy in items:
            sheet.paste(im, pos[key][:2])
        return sheet, pos


def seal_sprite(lang="zh"):
    im = Image.new("RGBA", (34, 34), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, 33, 33], outline=SEAL, width=2)
    txt(d, (17, 8), "M.O.A.", 8, SEAL, anchor="ma")
    txt(d, (17, 19), "ALIGN" if lang == "en" else "对齐部", 8, SEAL, anchor="ma")
    return im


def emblem_sprite():
    im = Image.new("RGBA", (23, 21), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, 22, 20], outline=GOLD)
    spark(d, 11, 10, GOLD, big=False)
    return im


def title_emblem():
    from pp.base import CLAUDE, CLAUDE_L
    im = Image.new("RGBA", (45, 45), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, 44, 44], fill=(18, 50, 36))       # 封面的深绿
    d.ellipse([0, 0, 44, 44], outline=CLAUDE)
    spark(d, 22, 22, CLAUDE_L, k=2)
    return im


def stamp_sprite(kind, lang="zh"):
    m = stamp_mark(kind, lang=lang)
    im = Image.new("RGBA", m.size, (RED if kind == "deny" else GREEN) + (0,))
    im.putalpha(m)
    return im


def news_icon(kind, lang="zh"):
    im = Image.new("RGB", (133, 101), (200, 188, 166))
    r = _icon(draw(im), kind, 0, 0, 132, 100, lang)
    if r:
        g, a = r
        im.paste(g, (16, -6), a)
    return im


def group_photo(group):
    """拼车团的证件照：六张迷你证件照拼成 3×2。"""
    im = Image.new("RGB", (40, 50), (176, 180, 176))
    for i, p in enumerate(group.people):
        small = photo(p.sprite()).resize((13, 16), Image.BOX)
        im.paste(small, (1 + (i % 3) * 13, 8 + (i // 3) * 17))
    return im


def jinqi_sprite():
    """锦旗（挂墙上那面）：旗杆左端在 (6, 0)。"""
    im = Image.new("RGBA", (JINQI_W + 12, JINQI_H + 2), (0, 0, 0, 0))
    draw_jinqi(draw(im), 6, 0)
    return im


def morning_card():
    mc = MorningCard()
    im = Image.new("RGBA", (mc.w, mc.h), (0, 0, 0, 0))
    mc.draw(im, draw(im), 0, 0, shadow=False)
    return im


def bg_patches(zh, en):
    """英文背景和中文背景不同的地方（室外一块、桌面一块），各裁成一张整屏坐标的补丁（同原作）。"""
    out = []
    for y0, y1 in ((0, 124), (124, zh.height)):
        bb = ImageChops.difference(zh.crop((0, y0, zh.width, y1)), en.crop((0, y0, en.width, y1))).getbbox()
        if not bb:
            continue
        box = (bb[0], bb[1] + y0, bb[2], bb[3] + y0)
        im = Image.new("RGBA", zh.size, (0, 0, 0, 0))
        im.paste(en.crop(box), box[:2])
        out.append(im)
    return out


def png_b64(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


def main():
    font_sheet, font_meta = build_font()

    pk = Packer()
    people = {}
    for key, p in list(SCRIPTED.items()) + random_pool():
        exprs = EXPRS if key in SCRIPTED else POOL_EXPRS
        if key.startswith("GUARD"):
            exprs = ["angry"]
        for e in exprs:
            pk.add(f"{key}:{e}", p.sprite(e))
        if key == "JOHN":
            for e in ("nervous", "shock", "sad", "talk", "smile", "grin"):
                pk.add(f"{key}:{e}:slip", p.sprite(e, slip=True))
        pk.add(f"photo:{key}", photo(p.sprite()), crop=False)
        coat, top = p.walker
        people[key] = {"expr": p.expr, "walker": [list(coat), list(top) if top else None], "scripted": key in SCRIPTED,
                       "fw": 180,
                       # 看起来像男还是女（长发、发髻、没胡子 = 女）：随机路人护照上的性别和名字跟着它走
                       "look": "F" if p.hair in ("long", "bun") and not p.beard else "M"}
    grp = cast.CARPOOL
    for e in GROUP_EXPRS:
        pk.add(f"CARPOOL:{e}", grp.sprite(e))
    pk.add("photo:CARPOOL", group_photo(grp), crop=False)
    people["CARPOOL"] = {"expr": grp.expr, "walker": [list(c) if c else None for c in grp.walker], "scripted": True,
                         "fw": 300, "extra": [[list(c) if c else None for c in q.walker] for q in grp.people[1:4]]}
    pk.add("seal", seal_sprite(), crop=False)
    pk.add("emblem", emblem_sprite(), crop=False)
    pk.add("title_emblem", title_emblem(), crop=False)
    from pp.screens import title_band
    pk.add("title_band", title_band(91).convert("RGBA"), crop=False)
    pk.add("end_band", title_band(81, crash=True).convert("RGBA"), crop=False)
    for kind in ("deny", "approve"):
        pk.add(f"stamp:{kind}", stamp_sprite(kind), crop=False)
    for k in ("unionpay", "chart", "cart", "book", "trillion"):
        pk.add(f"news:{k}", news_icon(k), crop=False)
        if k in ("unionpay", "trillion", "book"):          # 图上有中文的，英文版另出一张
            pk.add(f"news:{k}:en", news_icon(k, "en"), crop=False)
    pk.add("jinqi", jinqi_sprite(), crop=False)
    pk.add("wig", wig_sprite(cast2.XIANYU), crop=False)
    pk.add("morning", morning_card(), crop=False)
    pk.add("ext_clean", clean_exterior(), crop=False)
    fall = {}
    for name, (im, xy) in fall_sprites().items():
        pk.add(f"fall:{name}", im, crop=False)
        fall[name] = list(xy)
    bg = static_layer().copy()
    # —— 英文版：带中文的印章、对齐部圆印、崩盘时掉下来的横幅和路牌另出一份 `:en`；
    #    背景上的横幅、路牌、退款窗口、宪法书只出补丁 `bg:en:*`（同原作）
    pk.add("seal:en", seal_sprite("en"), crop=False)
    for kind in ("deny", "approve"):
        pk.add(f"stamp:{kind}:en", stamp_sprite(kind, "en"), crop=False)
    pk.add("ext_clean:en", clean_exterior("en"), crop=False)
    fall_en = {}
    for name, (im, xy) in fall_sprites("en").items():
        pk.add(f"fall:{name}:en", im, crop=False)
        fall_en[name] = list(xy)
    for i, im in enumerate(bg_patches(bg, static_layer("en"))):
        pk.add(f"bg:en:{i}", im)
    sheet, pos = pk.build()

    wbg = window_bg().copy()

    blobs = {}
    sizes = {}
    for name, im in (("font", font_sheet), ("atlas", sheet), ("bg", bg), ("win", wbg)):
        blobs[name], sizes[name] = png_b64(im)

    data = {
        "font": {str(k): v for k, v in font_meta.items()},
        "sprites": pos,
        "people": people,
        "queue": {"spots": [list(p) for p in booth.QUEUE_SPOTS],
                  "looks": [[list(c), list(h) if h else None] for c, h in booth.QUEUE_LOOKS]},
        "fall": fall,
        "fall_en": fall_en,
    }
    js = ["// 由 build_assets.py 生成，不要手改", "window.ASSETS = " + json.dumps(data, ensure_ascii=False,
                                                                                 separators=(",", ":")) + ";"]
    js.append("window.ASSET_IMAGES = {")
    for name, b in blobs.items():
        js.append(f'  {name}: "data:image/png;base64,{b}",')
    js.append("};")
    out = SITE / "assets.js"
    out.write_text("\n".join(js) + "\n", encoding="utf-8")
    print("字体字符数：", len(font_meta[12]), " 图集尺寸：", sheet.size, " 排队区小人：", len(booth.QUEUE_SPOTS))
    print("PNG 大小：", {k: f"{v / 1024:.0f}KB" for k, v in sizes.items()})
    print(f"assets.js：{out.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
