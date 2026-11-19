"""旅客立绘：用参数拼出半身像（脸型、肤色、发型、帽子、眼镜、衣服、表情）。

立绘画布 180x128，人物中轴 x=90，头顶约在 y=12~18；窗口里按中轴对齐摆放。
"""
import math
from dataclasses import dataclass, replace
from functools import lru_cache

from PIL import Image

from .base import (FLAG_R, FLAG_W, GLASS, GLASS_L, HAIR, INK, NAVY, OUTLINE, SWEAT, WHITE, draw, spark, txt)

SKINS = {
    "light": ((224, 184, 154), (188, 144, 116), (148, 106, 84), (236, 202, 174)),
    "mid": ((198, 152, 120), (160, 116, 90), (118, 82, 64), (214, 172, 140)),
    "tan": ((178, 130, 94), (142, 100, 72), (106, 72, 52), (198, 152, 114)),
    "deep": ((130, 90, 66), (102, 68, 50), (74, 48, 36), (152, 108, 80)),
}
# 头部椭圆（相对中轴）和下巴多边形
FACES = {
    "oval": ((-26, 16, 26, 74), [(-26, 44), (-23, 66), (-12, 80), (12, 80), (23, 66), (26, 44)]),
    "round": ((-28, 18, 28, 76), [(-28, 46), (-26, 66), (-14, 80), (14, 80), (26, 66), (28, 46)]),
    "long": ((-24, 12, 24, 74), [(-24, 44), (-22, 70), (-11, 84), (11, 84), (22, 70), (24, 44)]),
    "square": ((-27, 16, 27, 72), [(-27, 42), (-27, 68), (-16, 81), (16, 81), (27, 68), (27, 42)]),
}
BODY = [(-72, 128), (-64, 101), (-46, 93), (-15, 88), (15, 88), (46, 93), (64, 101), (72, 128)]
LIP = (108, 62, 52)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


@dataclass(frozen=True)
class Person:
    skin: str = "mid"
    face: str = "oval"
    hair: str = "short"            # short side slick bald buzz curly long bun none
    hair_color: tuple = HAIR
    beard: str = None              # mustache stubble
    beard_color: tuple = None
    eyes: str = None               # glasses rimless sunglasses
    hat: str = None                # cap flatcap cowboy hood helmet
    hat_color: tuple = (150, 48, 42)
    hat_text: str = None
    top: str = "jacket"            # jacket flag suit hoodie cardigan polo plaid shirt_tie tee uniform
    top_color: tuple = (86, 82, 64)
    inner: tuple = (210, 204, 190)
    tie: tuple = (120, 40, 36)
    acc: str = None                # catears headphones
    expr: str = "neutral"          # 默认表情
    shadow: bool = False           # 整个人压成剪影
    eyebags: bool = False
    mystery: bool = False          # 兜帽阴影遮脸

    @property
    def walker(self):
        """上方室外小人用的 (衣服色, 头顶色)。"""
        top = self.hat_color if self.hat else self.hair_color
        return self.top_color if self.top != "flag" else (86, 82, 64), top

    def but(self, **kw):
        return replace(self, **kw)

    def sprite(self, expr=None, slip=False, sweat=None):
        return portrait(self, expr or self.expr, slip, sweat)


class Group:
    """拼车团：一群人挤在一个窗口里。"""

    def __init__(self, people, expr="smile"):
        self.people = tuple(people)
        self.expr = expr
        self.shadow = False

    @property
    def walker(self):
        return self.people[0].walker

    def sprite(self, expr=None, slip=False, sweat=None):
        return group_sprite(self.people, expr or self.expr)


# ———————————————————— 各部件 ————————————————————

def _poly(d, pts, cx, fill, outline=None):
    p = [(cx + x, y) for x, y in pts]
    if outline:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            d.polygon([(x + dx, y + dy) for x, y in p], fill=outline)
    d.polygon(p, fill=fill)


def _pattern_in_body(S, cx, base, line, step):
    """格子衫：在身体多边形里画格纹。"""
    mask = Image.new("L", S.size, 0)
    _poly(draw(mask), BODY, cx, 255)
    pat = Image.new("RGBA", S.size, base + (255,))
    dp = draw(pat)
    for x in range(0, S.width, step):
        dp.line([x, 0, x, S.height], fill=line + (255,), width=2)
    for y in range(80, S.height, step):
        dp.line([0, y, S.width, y], fill=line + (255,), width=2)
    S.paste(pat, (0, 0), mask)


def _body(S, d, p, cx):
    c = p.top_color
    dark, light = shade(c, 0.76), shade(c, 1.22)
    _poly(d, BODY, cx, c, OUTLINE)
    if p.top == "plaid":
        _pattern_in_body(S, cx, c, shade(c, 0.6), 7)
    d.polygon([(cx + 22, 90), (cx + 46, 93), (cx + 64, 101), (cx + 72, 128), (cx + 30, 128)], fill=dark)
    d.polygon([(cx - 62, 104), (cx - 46, 96), (cx - 30, 94), (cx - 48, 104)], fill=light)
    t = p.top
    if t in ("jacket", "flag"):
        for y in range(88, 128):
            k = (y - 88) * 6 / 40
            x0, x1 = round(cx - 15 - k), round(cx + 15 + k)
            if t == "flag":
                d.line([x0, y, x1, y], fill=FLAG_R if (y - 88) // 3 % 2 == 0 else FLAG_W)
                if y < 101:
                    d.line([x0, y, cx - 1, y], fill=NAVY)
                    if y % 3 == 0:
                        for sx in range(x0 + 2, cx - 1, 4):
                            d.point((sx, y), fill=FLAG_W)
            else:
                d.line([x0, y, x1, y], fill=p.inner)
        d.line([(cx - 15, 88), (cx - 23, 128)], fill=dark, width=3)
        d.line([(cx + 15, 88), (cx + 23, 128)], fill=dark, width=3)
        d.polygon([(cx - 15, 88), (cx - 26, 93), (cx - 19, 106)], fill=light)
        d.polygon([(cx + 15, 88), (cx + 26, 93), (cx + 19, 106)], fill=c)
    elif t in ("suit", "shirt_tie"):
        shirt = (222, 218, 208) if t == "suit" else c
        if t == "suit":
            d.polygon([(cx - 13, 88), (cx + 13, 88), (cx + 6, 128), (cx - 6, 128)], fill=shirt)
            d.line([(cx - 13, 88), (cx - 5, 128)], fill=dark, width=2)
            d.line([(cx + 13, 88), (cx + 5, 128)], fill=dark, width=2)
            d.polygon([(cx - 13, 88), (cx - 22, 96), (cx - 8, 112)], fill=light)
            d.polygon([(cx + 13, 88), (cx + 22, 96), (cx + 8, 112)], fill=c)
        else:
            d.polygon([(cx - 13, 88), (cx - 3, 96), (cx - 12, 98)], fill=WHITE)
            d.polygon([(cx + 13, 88), (cx + 3, 96), (cx + 12, 98)], fill=WHITE)
            for y in (106, 118):
                d.point((cx + 6, y), fill=dark)
        d.rectangle([cx - 3, 89, cx + 3, 93], fill=shade(p.tie, 0.8))
        d.polygon([(cx - 3, 93), (cx + 3, 93), (cx + 5, 122), (cx, 127), (cx - 5, 122)], fill=p.tie)
    elif t == "hoodie":
        d.arc([cx - 14, 80, cx + 14, 98], 0, 180, fill=dark)
        d.line([cx - 7, 94, cx - 7, 110], fill=light)
        d.line([cx + 7, 94, cx + 7, 110], fill=light)
        d.line([cx - 30, 120, cx + 30, 120], fill=dark)
    elif t == "cardigan":
        d.polygon([(cx - 13, 88), (cx + 13, 88), (cx + 6, 128), (cx - 6, 128)], fill=p.inner)
        d.line([(cx - 13, 88), (cx - 6, 128)], fill=dark, width=2)
        d.line([(cx + 13, 88), (cx + 6, 128)], fill=dark, width=2)
        for y in (104, 114, 124):
            d.point((cx + 9, y), fill=light)
    elif t == "polo":
        d.polygon([(cx - 13, 88), (cx - 2, 95), (cx - 14, 97)], fill=light)
        d.polygon([(cx + 13, 88), (cx + 2, 95), (cx + 14, 97)], fill=light)
        d.line([cx, 95, cx, 108], fill=dark)
        d.point((cx + 2, 100), fill=WHITE)
        d.point((cx + 2, 105), fill=WHITE)
    elif t == "tee":
        d.arc([cx - 14, 80, cx + 14, 96], 0, 180, fill=dark)
    elif t == "jersey":
        d.polygon([(cx - 14, 88), (cx + 14, 88), (cx, 104)], fill=WHITE)                   # V 领
        d.polygon([(cx - 10, 88), (cx + 10, 88), (cx, 99)], fill=shade(c, 0.8))
        for s_ in (-1, 1):                                                                # 肩上白条
            d.line([(cx + s_ * 40, 94), (cx + s_ * 66, 108)], fill=WHITE, width=3)
        txt(d, (cx - 34, 104), "NGA", 8, WHITE)
        d.line([(cx + 9, 90), (cx + 18, 99)], fill=(230, 230, 230))                       # 吊牌线
        d.rectangle([cx + 13, 98, cx + 55, 110], fill=OUTLINE)
        d.rectangle([cx + 14, 99, cx + 54, 109], fill=(246, 244, 236))
        txt(d, (cx + 34, 100), "闲鱼·赠品", 8, (190, 40, 30), anchor="ma")
    elif t == "tangzhuang":
        # 唐装：红缎面、立领、对襟一排金色盘扣、金色团花
        gold, gold_d = (232, 190, 80), (176, 130, 50)
        for gx, gy in ((-50, 108), (-34, 120), (-56, 124), (36, 106), (52, 120), (30, 124), (-20, 112)):
            d.ellipse([cx + gx - 4, gy - 4, cx + gx + 4, gy + 4], outline=gold_d)
            d.point((cx + gx, gy), fill=gold_d)
        d.polygon([(cx - 15, 83), (cx + 15, 83), (cx + 16, 93), (cx - 16, 93)], fill=OUTLINE)
        d.polygon([(cx - 14, 84), (cx + 14, 84), (cx + 15, 92), (cx - 15, 92)], fill=c)      # 立领
        d.line([cx - 14, 84, cx + 14, 84], fill=gold)
        d.line([cx, 93, cx, 128], fill=dark, width=2)                                     # 对襟
        for y in range(97, 128, 7):                                                       # 盘扣
            d.line([cx - 5, y, cx + 5, y], fill=gold, width=2)
            d.rectangle([cx - 7, y - 1, cx - 6, y + 1], fill=gold)
            d.rectangle([cx + 6, y - 1, cx + 7, y + 1], fill=gold)
    elif t == "uniform":
        d.polygon([(cx - 14, 88), (cx - 4, 98), (cx - 16, 100)], fill=light)
        d.polygon([(cx + 14, 88), (cx + 4, 98), (cx + 16, 100)], fill=light)
        d.rectangle([cx - 24, 98, cx - 20, 101], fill=(150, 40, 36))
        d.rectangle([cx + 20, 98, cx + 24, 101], fill=(150, 40, 36))
        for y in (104, 114, 124):
            d.rectangle([cx - 1, y, cx, y + 1], fill=(170, 150, 90))
    elif t == "maid":
        # 蓝白女仆装：白围裙 + 白圆领 + 蓝蝴蝶结
        ap = (238, 238, 240)
        d.polygon([(cx - 20, 100), (cx + 20, 100), (cx + 27, 128), (cx - 27, 128)], fill=OUTLINE)
        d.polygon([(cx - 19, 101), (cx + 19, 101), (cx + 26, 128), (cx - 26, 128)], fill=ap)
        for x in range(cx - 18, cx + 19, 4):
            d.point((x, 102), fill=(190, 196, 214))
        d.line([(cx - 19, 101), (cx - 34, 92)], fill=ap, width=3)
        d.line([(cx + 19, 101), (cx + 34, 92)], fill=ap, width=3)
        for s_ in (-1, 1):
            d.chord([cx + min(0, s_ * 18), 84, cx + max(0, s_ * 18), 100], 0, 180, fill=OUTLINE)
            d.chord([cx + min(0, s_ * 17), 85, cx + max(0, s_ * 17), 98], 0, 180, fill=ap)
        d.polygon([(cx - 7, 89), (cx, 93), (cx - 7, 97)], fill=shade(c, 0.8))
        d.polygon([(cx + 7, 89), (cx, 93), (cx + 7, 97)], fill=shade(c, 0.8))
        d.rectangle([cx - 1, 92, cx + 1, 94], fill=shade(c, 0.6))
    elif t == "plaid":
        d.polygon([(cx - 13, 88), (cx - 2, 95), (cx - 14, 97)], fill=shade(c, 0.6))
        d.polygon([(cx + 13, 88), (cx + 2, 95), (cx + 14, 97)], fill=shade(c, 0.6))


def _neck(d, cx, sk_d, sk_dd):
    d.rectangle([cx - 12, 74, cx + 12, 90], fill=OUTLINE)
    d.rectangle([cx - 11, 74, cx + 11, 90], fill=sk_d)
    d.rectangle([cx - 11, 74, cx + 11, 80], fill=sk_dd)


def _eyes(d, cx, expr, sk_d, sk_dd, brow):
    white, pupil = (226, 218, 204), INK
    by = {"shock": 43, "sad": 45}.get(expr, 45)
    # 眉毛
    if expr == "sad":
        d.line([(cx - 18, 46), (cx - 10, 44)], fill=brow, width=2)
        d.line([(cx + 8, 44), (cx + 16, 46)], fill=brow, width=2)
    elif expr == "angry":
        d.line([(cx - 18, 44), (cx - 10, 47)], fill=brow, width=2)
        d.line([(cx + 8, 47), (cx + 16, 44)], fill=brow, width=2)
    elif expr == "nervous":
        d.line([(cx - 18, 45), (cx - 10, 44)], fill=brow, width=2)
        d.line([(cx + 8, 43), (cx + 16, 45)], fill=brow, width=2)
    else:
        d.rectangle([cx - 18, by, cx - 10, by + 1], fill=brow)
        d.rectangle([cx + 8, by, cx + 16, by + 1], fill=brow)
    for ex in (cx - 18, cx + 8):
        if expr in ("smile", "grin"):
            d.line([ex + 1, 50, ex + 7, 50], fill=sk_dd)
            d.point((ex, 51), fill=sk_dd)
            d.point((ex + 8, 51), fill=sk_dd)
            continue
        top = 47 if expr == "shock" else 48
        d.line([ex, top, ex + 8, top], fill=sk_dd)
        d.rectangle([ex + 1, top + 1, ex + 7, 50], fill=white)
        px = ex + 3
        if expr == "nervous":
            px = ex + 1
        py = 49 if expr != "sad" else 49
        d.rectangle([px, py, px + 1, 50], fill=pupil)


def _mouth(d, cx, expr, sk_d):
    if expr == "smile":
        d.line([cx - 8, 69, cx + 8, 69], fill=LIP)
        d.point((cx - 9, 68), fill=LIP)
        d.point((cx + 9, 68), fill=LIP)
    elif expr == "grin":
        d.rectangle([cx - 9, 67, cx + 9, 71], fill=(70, 34, 30))
        d.rectangle([cx - 8, 67, cx + 8, 68], fill=WHITE)
        d.point((cx - 10, 66), fill=LIP)
        d.point((cx + 10, 66), fill=LIP)
    elif expr == "talk":
        d.rectangle([cx - 5, 68, cx + 5, 71], fill=(70, 34, 30))
        d.line([cx - 5, 68, cx + 5, 68], fill=LIP)
    elif expr == "shock":
        d.ellipse([cx - 4, 66, cx + 4, 74], fill=(70, 34, 30))
    elif expr == "nervous":
        d.line([(cx - 8, 70), (cx - 5, 69), (cx - 2, 70), (cx + 1, 69), (cx + 4, 70), (cx + 7, 69)], fill=LIP)
    elif expr in ("sad", "angry"):
        d.line([cx - 7, 69, cx + 7, 69], fill=LIP)
        d.point((cx - 8, 70), fill=LIP)
        d.point((cx + 8, 70), fill=LIP)
    else:
        d.line([cx - 7, 69, cx + 7, 69], fill=LIP)
    if expr not in ("shock", "grin", "talk"):
        d.line([cx - 6, 71, cx + 6, 71], fill=sk_d)


def _fish_tail(d, cx, c):
    """蓝色大肥鱼：右肩后面翘起来的鲸尾。"""
    cd, cl = shade(c, 0.72), shade(c, 1.25)
    body = [(cx + 40, 128), (cx + 50, 104), (cx + 60, 86), (cx + 66, 74), (cx + 72, 74), (cx + 70, 88),
            (cx + 62, 106), (cx + 58, 128)]
    fluke = [(cx + 68, 78), (cx + 54, 64), (cx + 52, 56), (cx + 62, 62), (cx + 69, 70), (cx + 74, 60),
             (cx + 86, 52), (cx + 84, 62), (cx + 74, 78)]
    for pts in (body, fluke):
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            d.polygon([(x + dx, y + dy) for x, y in pts], fill=OUTLINE)
    d.polygon(body, fill=c)
    d.polygon(fluke, fill=c)
    d.line([(cx + 52, 106), (cx + 62, 86), (cx + 66, 78)], fill=cl)
    d.line([(cx + 55, 60), (cx + 64, 66)], fill=cl)
    d.line([(cx + 60, 128), (cx + 66, 104), (cx + 70, 90)], fill=cd)


def _hair_back(d, p, cx, head):
    x0, y0, x1, y1 = head
    if p.acc == "fishgirl":
        _fish_tail(d, cx, p.top_color)
    elif p.acc == "fishtail":                     # 伪装的鲸鱼娘：尾巴藏不住了
        _fish_tail(d, cx, (64, 96, 200))
    if p.hair == "long":
        d.rounded_rectangle([x0 - 7, y0 + 8, x1 + 7, 106], radius=10, fill=OUTLINE)
        d.rounded_rectangle([x0 - 6, y0 + 9, x1 + 6, 105], radius=10, fill=p.hair_color)
        if p.acc == "fishgirl":
            d.rounded_rectangle([x0 - 6, 80, x1 + 6, 105], radius=10, fill=shade(p.hair_color, 1.35))
            d.rectangle([x0 - 6, 80, x1 + 6, 86], fill=shade(p.hair_color, 1.15))
    if p.hair == "dreads":
        _locs(d, cx, [(-38, 30), (-30, 22), (-20, 16), (-8, 13), (8, 13), (20, 16), (30, 22), (38, 30)],
              104, p.hair_color)
    if p.hat == "hood":
        c = p.hat_color
        d.ellipse([cx - 39, y0 - 11, cx + 39, y1 + 26], fill=OUTLINE)
        d.ellipse([cx - 38, y0 - 10, cx + 38, y1 + 25], fill=c)
        d.ellipse([cx - 31, y0 - 4, cx + 31, y1 + 12], fill=shade(c, 0.6))


def _locs(d, cx, roots, bottom, c):
    """一根根脏辫：粗线 + 描边 + 一节节的亮纹。"""
    for dx, y0 in roots:
        x = cx + dx
        d.line([(x, y0), (x + (2 if dx > 0 else -2), bottom)], fill=OUTLINE, width=7)
        d.line([(x, y0), (x + (2 if dx > 0 else -2), bottom)], fill=c, width=5)
        for yy in range(y0 + 4, bottom, 6):
            d.point((x - 1, yy), fill=shade(c, 1.9))


def wig_sprite(p):
    """单独画出脏辫假发（掉下来时用），画布和立绘一样大。"""
    S = Image.new("RGBA", (180, 128), (0, 0, 0, 0))
    d = draw(S)
    cx = 90
    (hx0, hy0, hx1, hy1), _ = FACES[p.face]
    head = (cx + hx0, hy0, cx + hx1, hy1)
    _hair_back(d, p, cx, head)
    _hair_top(d, p, cx, head, (0, 0, 0))
    return S


def _hair_top(d, p, cx, head, sk_l):
    x0, y0, x1, y1 = head
    c = p.hair_color
    if p.hair == "none" or p.hat in ("cap", "helmet", "hood"):
        if p.hat in ("cap", "helmet") and p.hair not in ("none", "bald"):
            d.rectangle([x0 + 1, 38, x0 + 4, 52], fill=c)
            d.rectangle([x1 - 4, 38, x1 - 1, 52], fill=c)
        return
    if p.hair == "bald":
        d.rectangle([x0, y0 + 22, x0 + 3, y0 + 36], fill=c)
        d.rectangle([x1 - 3, y0 + 22, x1, y0 + 36], fill=c)
        d.arc([x0 + 6, y0 + 3, x1 - 6, y0 + 40], 200, 250, fill=sk_l)
        return
    if p.hair == "bun":
        d.ellipse([cx - 11, y0 - 15, cx + 11, y0 + 3], fill=OUTLINE)
        d.ellipse([cx - 10, y0 - 14, cx + 10, y0 + 2], fill=c)
    if p.hair == "dreads":
        d.chord([x0 - 3, y0 - 4, x1 + 3, y0 + 46], 180, 360, fill=OUTLINE)
        d.chord([x0 - 2, y0 - 3, x1 + 2, y0 + 45], 180, 360, fill=c)
        for k in range(-3, 4):                                                            # 辫根
            d.line([(cx + k * 7, y0 + 1), (cx + k * 9, y0 + 20)], fill=shade(c, 1.7))
        _locs(d, cx, [(-31, 34), (-26, 38), (26, 38), (31, 34)], 76, c)                  # 脸两侧垂下来的
        return
    if p.hair == "buzz":
        d.chord([x0, y0, x1, y0 + 40], 180, 360, fill=shade(c, 1.0))
        for yy in range(y0 + 1, y0 + 20, 2):
            for xx in range(x0 + 2, x1 - 1, 2):
                d.point((xx + (yy // 2) % 2, yy), fill=shade(c, 1.6))
        return
    d.chord([x0 - 2, y0 - 3, x1 + 2, y0 + 44], 180, 360, fill=OUTLINE)
    d.chord([x0 - 1, y0 - 2, x1 + 1, y0 + 43], 180, 360, fill=c)
    d.rectangle([x0 + 1, y0 + 20, x0 + 4, y0 + 34], fill=c)
    d.rectangle([x1 - 4, y0 + 20, x1 - 1, y0 + 34], fill=c)
    if p.hair == "side":
        d.polygon([(cx - 4, y0 + 18), (x1, y0 + 18), (x1 - 2, y0 + 27), (cx + 12, y0 + 24)], fill=c)
        d.line([cx - 10, y0, cx - 5, y0 + 15], fill=shade(c, 0.6))
    elif p.hair == "slick":
        d.arc([x0 + 4, y0 + 1, x1 - 4, y0 + 40], 205, 245, fill=shade(c, 2.2))
        d.arc([x0 + 8, y0 + 4, x1 - 8, y0 + 40], 290, 330, fill=shade(c, 1.8))
    elif p.hair == "curly":
        for ang in range(190, 351, 20):
            a = math.radians(ang)
            ccx = cx + round(math.cos(a) * (x1 - x0) / 2)
            ccy = y0 + 21 + round(math.sin(a) * 23)
            d.ellipse([ccx - 5, ccy - 5, ccx + 5, ccy + 5], fill=OUTLINE)
            d.ellipse([ccx - 4, ccy - 4, ccx + 4, ccy + 4], fill=c)
            d.point((ccx - 1, ccy - 2), fill=shade(c, 1.8))
    elif p.hair == "long":
        d.rectangle([x0 - 5, y0 + 18, x0 + 2, 100], fill=c)
        d.rectangle([x1 - 2, y0 + 18, x1 + 5, 100], fill=c)
        d.line([x0 - 5, y0 + 18, x0 - 5, 100], fill=OUTLINE)
        d.line([x1 + 5, y0 + 18, x1 + 5, 100], fill=OUTLINE)


def _hat(d, p, cx, head, sk_d):
    x0, y0, x1, y1 = head
    c = p.hat_color
    cd, cl = shade(c, 0.72), shade(c, 1.18)
    if p.hat == "cap":
        d.chord([cx - 29, 8, cx + 29, 70], 180, 360, fill=OUTLINE)
        d.chord([cx - 28, 9, cx + 28, 69], 180, 360, fill=c)
        d.arc([cx - 24, 13, cx + 24, 65], 200, 240, fill=cl)
        d.line([(cx - 2, 10), (cx - 9, 18), (cx - 13, 28), (cx - 14, 38)], fill=cd)
        d.line([(cx + 2, 10), (cx + 9, 18), (cx + 13, 28), (cx + 14, 38)], fill=cd)
        d.rectangle([cx - 1, 8, cx + 1, 9], fill=cd)
        if p.hat_text:
            txt(d, (cx, 23), p.hat_text, 8, WHITE, anchor="ma")
        d.chord([cx - 25, 29, cx + 25, 48], 0, 180, fill=OUTLINE)
        d.chord([cx - 24, 30, cx + 24, 47], 0, 180, fill=cd)
        d.line([cx - 22, 39, cx + 22, 39], fill=c)
        d.rectangle([cx - 22, 46, cx + 22, 46], fill=sk_d)
    elif p.hat == "flatcap":
        d.chord([cx - 31, y0 - 6, cx + 31, y0 + 44], 180, 360, fill=OUTLINE)
        d.chord([cx - 30, y0 - 5, cx + 30, y0 + 43], 180, 360, fill=c)
        d.arc([cx - 26, y0 - 2, cx + 26, y0 + 40], 205, 250, fill=cl)
        d.chord([cx - 27, y0 + 10, cx + 27, y0 + 28], 0, 180, fill=OUTLINE)
        d.chord([cx - 26, y0 + 11, cx + 26, y0 + 27], 0, 180, fill=cd)
        d.rectangle([cx - 22, y0 + 28, cx + 22, y0 + 28], fill=sk_d)
    elif p.hat == "cowboy":
        d.rounded_rectangle([cx - 25, y0 - 13, cx + 25, y0 + 21], radius=6, fill=OUTLINE)
        d.rounded_rectangle([cx - 24, y0 - 12, cx + 24, y0 + 20], radius=6, fill=c)
        d.polygon([(cx - 6, y0 - 12), (cx + 6, y0 - 12), (cx, y0 - 6)], fill=cd)
        d.rectangle([cx - 24, y0 + 12, cx + 24, y0 + 16], fill=shade(c, 0.5))
        d.ellipse([cx - 49, y0 + 13, cx + 49, y0 + 28], fill=OUTLINE)
        d.ellipse([cx - 48, y0 + 14, cx + 48, y0 + 27], fill=cd)
        d.ellipse([cx - 44, y0 + 14, cx + 44, y0 + 22], fill=c)
        d.rectangle([cx - 22, y0 + 28, cx + 22, y0 + 29], fill=sk_d)
    elif p.hat == "hood":
        d.chord([cx - 32, y0 - 7, cx + 32, y0 + 42], 180, 360, fill=OUTLINE)
        d.chord([cx - 31, y0 - 6, cx + 31, y0 + 41], 180, 360, fill=c)
        d.arc([cx - 31, y0 - 6, cx + 31, y0 + 41], 180, 360, fill=cl)
        d.line([cx - 28, y0 + 17, cx + 28, y0 + 17], fill=shade(c, 0.5))
    elif p.hat in ("whale", "moon", "beanie"):
        # 毛线帽：鲸鱼尾巴 / 月牙
        d.chord([cx - 30, y0 - 4, cx + 30, y0 + 50], 180, 360, fill=OUTLINE)
        d.chord([cx - 29, y0 - 3, cx + 29, y0 + 49], 180, 360, fill=c)
        d.rectangle([cx - 29, y0 + 18, cx + 29, y0 + 24], fill=cd)
        for x in range(cx - 27, cx + 28, 4):
            d.line([x, y0 + 18, x, y0 + 24], fill=c)
        if p.hat == "beanie":
            d.ellipse([cx - 5, y0 - 8, cx + 5, y0 + 1], fill=OUTLINE)
            d.ellipse([cx - 4, y0 - 7, cx + 4, y0], fill=cl)
        elif p.hat == "whale":
            d.polygon([(cx - 2, y0 - 2), (cx - 14, y0 - 14), (cx - 4, y0 - 10), (cx, y0 - 5), (cx + 4, y0 - 10),
                       (cx + 14, y0 - 14), (cx + 2, y0 - 2)], fill=OUTLINE)
            d.polygon([(cx - 1, y0 - 3), (cx - 11, y0 - 12), (cx - 3, y0 - 9), (cx, y0 - 6), (cx + 3, y0 - 9),
                       (cx + 11, y0 - 12), (cx + 1, y0 - 3)], fill=c)
            d.ellipse([cx - 4, y0 + 4, cx + 4, y0 + 8], fill=WHITE)
        else:
            d.ellipse([cx - 8, y0 + 0, cx + 8, y0 + 16], fill=(232, 210, 120))
            d.ellipse([cx - 3, y0 - 2, cx + 11, y0 + 12], fill=c)
    elif p.hat == "helmet":
        d.chord([cx - 32, 6, cx + 32, 66], 180, 360, fill=OUTLINE)
        d.chord([cx - 31, 7, cx + 31, 65], 180, 360, fill=c)
        d.arc([cx - 26, 11, cx + 26, 60], 205, 245, fill=cl)
        d.rectangle([cx - 32, 34, cx + 32, 38], fill=cd)
        d.rectangle([cx - 32, 34, cx + 32, 34], fill=OUTLINE)
        d.rectangle([cx - 22, 39, cx + 22, 40], fill=sk_d)
        d.line([(x0 + 1, 39), (x0 + 3, 56)], fill=OUTLINE)
        d.line([(x1 - 1, 39), (x1 - 3, 56)], fill=OUTLINE)


def _eyewear(d, p, cx, slip):
    if p.eyes == "groucho":
        # 大鼻子眼镜：黑框圆眼镜 + 粉红大鼻子 + 粗眉毛
        for ex in (cx - 20, cx + 6):
            d.rounded_rectangle([ex - 1, 43, ex + 15, 55], radius=4, outline=OUTLINE, width=2)
            d.line([ex, 40, ex + 14, 39], fill=OUTLINE, width=3)
        d.line([cx - 6, 47, cx + 6, 47], fill=OUTLINE, width=2)
        d.line([cx - 30, 47, cx - 21, 47], fill=OUTLINE, width=2)
        d.line([cx + 21, 47, cx + 30, 47], fill=OUTLINE, width=2)
        d.ellipse([cx - 7, 50, cx + 9, 64], fill=OUTLINE)
        d.ellipse([cx - 6, 51, cx + 8, 63], fill=(226, 150, 140))
        d.ellipse([cx - 3, 53, cx + 1, 56], fill=(244, 196, 186))
        return
    if p.eyes == "mask":
        # 眼罩面具：一条黑带，两个眼洞，后面系着带子——戴了跟没戴差不多
        band = (36, 34, 40)
        d.line([cx - 30, 47, cx - 26, 49], fill=band, width=2)
        d.line([cx + 26, 49, cx + 30, 47], fill=band, width=2)
        d.rounded_rectangle([cx - 27, 42, cx + 27, 55], radius=4, fill=OUTLINE)
        d.rounded_rectangle([cx - 26, 43, cx + 26, 54], radius=4, fill=band)
        sk = SKINS[p.skin][0]
        for ex in (cx - 19, cx + 7):
            d.ellipse([ex, 45, ex + 12, 52], fill=sk)
            d.rectangle([ex + 5, 47, ex + 7, 50], fill=OUTLINE)
        d.line([cx - 22, 44, cx - 14, 44], fill=(80, 78, 88))
        return
    if p.eyes == "sunglasses":
        gy = 50 if slip else 46
        d.line([cx - 26, gy + 1, cx + 26, gy + 1], fill=GLASS)
        for lx in (cx - 22, cx + 4):
            d.rounded_rectangle([lx, gy, lx + 18, gy + 7], radius=2, fill=GLASS)
            d.line([lx + 3, gy + 2, lx + 6, gy + 2], fill=GLASS_L)
            d.point((lx + 3, gy + 3), fill=GLASS_L)
        d.line([cx - 4, gy + 2, cx + 4, gy + 2], fill=GLASS)
    elif p.eyes in ("glasses", "rimless"):
        col = (46, 40, 40) if p.eyes == "glasses" else (176, 176, 170)
        for ex in (cx - 20, cx + 6):
            d.rectangle([ex, 46, ex + 12, 53], outline=col)
            d.line([ex + 2, 47, ex + 4, 47], fill=(236, 236, 230))
        d.line([cx - 8, 48, cx + 6, 48], fill=col)
        d.line([cx - 26, 48, cx - 20, 48], fill=col)
        d.line([cx + 18, 48, cx + 26, 48], fill=col)


def _acc(d, p, cx, head, expr="neutral"):
    x0, y0, x1, y1 = head
    if p.acc == "fishgirl":
        c = p.hair_color
        fin, fin_l = p.top_color, shade(p.top_color, 1.3)
        for s_ in (-1, 1):
            bx = x0 - 4 if s_ < 0 else x1 + 4
            pts = [(bx, y0 + 30), (bx + s_ * 16, y0 + 14), (bx + s_ * 13, y0 + 26), (bx + s_ * 3, y0 + 38)]
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                d.polygon([(x + dx, y + dy) for x, y in pts], fill=OUTLINE)
            d.polygon(pts, fill=fin)
            d.line([(bx + s_ * 2, y0 + 30), (bx + s_ * 12, y0 + 18)], fill=fin_l)
        # 刘海
        bang = [(x0 + 3, y0 + 8), (x1 - 3, y0 + 8), (x1 - 2, y0 + 24), (x1 - 8, y0 + 19), (x1 - 13, y0 + 26),
                (cx + 7, y0 + 20), (cx + 1, y0 + 27), (cx - 5, y0 + 20), (x0 + 15, y0 + 26), (x0 + 9, y0 + 19),
                (x0 + 2, y0 + 25)]
        d.polygon([(x, y + 1) for x, y in bang], fill=shade(c, 0.6))
        d.polygon(bang, fill=c)
        d.line([(cx - 12, y0 + 10), (cx - 16, y0 + 20)], fill=shade(c, 1.3))
        # 睫毛（闭眼的表情不画）
        if expr not in ("smile", "grin"):
            top = 47 if expr == "shock" else 48
            for ex, wing in ((cx - 18, -1), (cx + 8, 9)):
                d.line([ex, top, ex + 8, top], fill=OUTLINE)
                d.point((ex + wing, top - 1), fill=OUTLINE)
        else:
            for ex in (cx - 18, cx + 8):
                d.line([ex + 1, 50, ex + 7, 50], fill=OUTLINE)
        # 女仆头饰：一圈白色褶边
        d.arc([x0 + 2, y0 - 4, x1 - 2, y0 + 30], 200, 340, fill=OUTLINE, width=6)
        d.arc([x0 + 3, y0 - 3, x1 - 3, y0 + 29], 200, 340, fill=(240, 240, 244), width=4)
        for k in range(7):
            a = math.radians(205 + k * 21.5)
            fx = cx + round(math.cos(a) * ((x1 - x0) / 2 - 3))
            fy = y0 + 13 + round(math.sin(a) * 16)
            d.ellipse([fx - 2, fy - 3, fx + 2, fy + 1], fill=(240, 240, 244))
        # 呆毛
        d.line([(cx + 3, y0 - 3), (cx + 6, y0 - 12), (cx + 13, y0 - 15), (cx + 11, y0 - 9)], fill=OUTLINE, width=3)
        d.line([(cx + 3, y0 - 3), (cx + 6, y0 - 12), (cx + 13, y0 - 15), (cx + 11, y0 - 9)], fill=c)
        # 鼓起来的腮红
        for bx in (cx - 22, cx + 12):
            d.rectangle([bx, 56, bx + 7, 58], fill=(232, 150, 150))
        return
    if p.acc in ("fishhide", "fishtail"):
        # 伪装：鳍和头饰都藏起来了
        if p.hat != "balaclava":
            for bx in (cx - 22, cx + 12):
                d.rectangle([bx, 56, bx + 7, 58], fill=(232, 150, 150))
        return
    if p.acc == "jinqi":
        # 锦旗举在胸前，排版和挂墙上一样；下半截（连同手）在窗口下沿外面
        draw_jinqi(d, *JINQI_HELD)
        return
    if p.acc == "claude_mask":
        # 中转站的“官方 Claude”：一张橙色面具
        d.rounded_rectangle([cx - 27, 24, cx + 27, 78], radius=12, fill=OUTLINE)
        d.rounded_rectangle([cx - 26, 25, cx + 26, 77], radius=12, fill=(204, 112, 80))
        d.rectangle([cx - 18, 45, cx - 9, 49], fill=OUTLINE)
        d.rectangle([cx + 9, 45, cx + 18, 49], fill=OUTLINE)
        spark(d, cx, 63, (240, 220, 200), big=False)
        return
    if p.acc not in ("catears", "headphones"):
        return
    band = (232, 226, 228) if p.acc == "catears" else (40, 38, 42)
    d.arc([x0 - 5, y0 - 8, x1 + 5, y0 + 56], 185, 355, fill=OUTLINE, width=4)
    d.arc([x0 - 4, y0 - 7, x1 + 4, y0 + 55], 185, 355, fill=band, width=2)
    for ex in (x0 - 8, x1 - 1):
        d.rounded_rectangle([ex - 1, y0 + 25, ex + 9, y0 + 45], radius=3, fill=OUTLINE)
        d.rounded_rectangle([ex, y0 + 26, ex + 8, y0 + 44], radius=3, fill=band)
    if p.acc == "catears":
        pink = (226, 150, 160)
        for s in (-1, 1):
            tip = (cx + s * 18, y0 - 15)
            base = [(cx + s * 9, y0 - 3), tip, (cx + s * 27, y0 + 2)]
            d.polygon([(x + s * 0, y - 1) for x, y in base], fill=OUTLINE)
            d.polygon(base, fill=band)
            d.polygon([(cx + s * 13, y0 - 3), (cx + s * 18, y0 - 10), (cx + s * 23, y0)], fill=pink)


def _beard(S, d, p, cx, head, jb, skin_cols):
    if not p.beard:
        return
    c = p.beard_color or p.hair_color
    if p.beard == "mustache":
        d.polygon([(cx - 13, 63), (cx + 14, 63), (cx + 15, 68), (cx + 10, 66), (cx - 9, 66), (cx - 14, 68)], fill=c)
        d.line([cx - 12, 63, cx + 13, 63], fill=shade(c, 1.5))
    elif p.beard == "stubble":
        px = S.load()
        for y in range(60, jb + 1):
            for x in range(cx - 30, cx + 31):
                if (x + y) % 2 == 0 and px[x, y][:3] in skin_cols and not (64 <= y <= 72 and abs(x - cx) < 10):
                    px[x, y] = c + (255,)


def _balaclava(S, d, p, cx, head, jawp):
    """黑头套：整颗头套住，只抠出两个眼洞和一个嘴洞。"""
    c = p.hat_color
    cd, cl = shade(c, 0.72), shade(c, 1.4)
    holes = [(cx - 20, 45, cx - 6, 54), (cx + 6, 45, cx + 20, 54), (cx - 7, 64, cx + 8, 73)]
    keep = [S.crop(h) for h in holes]
    x0, y0, x1, y1 = head
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        d.ellipse([x0 - 3 + dx, y0 - 3 + dy, x1 + 3 + dx, y1 + dy], fill=OUTLINE)
        d.polygon([(x + dx, y + dy) for x, y in jawp], fill=OUTLINE)
    d.ellipse([x0 - 3, y0 - 3, x1 + 3, y1], fill=c)
    d.polygon(jawp, fill=c)
    d.rectangle([x0 - 6, 42, x0 + 2, 62], fill=c)          # 耳朵也包进去
    d.rectangle([x1 - 2, 42, x1 + 6, 62], fill=c)
    for yy in range(y0 + 4, max(y for _, y in jawp) - 2, 4):  # 毛线横纹
        d.line([x0 + 2, yy, x1 - 2, yy], fill=cd)
    d.arc([x0 + 4, y0, x1 - 4, y0 + 30], 200, 250, fill=cl)
    for (hx0, hy0, hx1, hy1), im in zip(holes, keep):
        S.paste(im, (hx0, hy0))
        d.rounded_rectangle([hx0 - 1, hy0 - 1, hx1, hy1], radius=3, outline=OUTLINE)


JINQI_W, JINQI_H = 52, 74
JINQI_HELD = (64, 77)         # 立绘画布坐标：双手握旗杆两头、举在胸前时旗杆左端（下半截被窗口下沿切掉）


def draw_jinqi(d, x, y):
    """锦旗：(x, y) 是旗杆左端。红底金字，下面一排流苏。举着和挂墙上用同一个排版。"""
    red, gold, gold_d = (178, 28, 28), (240, 200, 90), (170, 120, 40)
    w, h = JINQI_W, JINQI_H
    d.rectangle([x - 1, y + 2, x + w + 1, y + h - 5], fill=OUTLINE)
    d.rectangle([x, y + 3, x + w, y + h - 6], fill=red)
    d.rectangle([x + 2, y + 5, x + w - 2, y + h - 8], outline=gold)
    d.line([x - 4, y + 2, x + w + 4, y + 2], fill=(120, 80, 40), width=2)                # 旗杆
    for kx in (x - 5, x + w + 4):
        d.rectangle([kx, y, kx + 1, y + 3], fill=gold)
    for fx in range(x + 1, x + w, 3):                                                      # 流苏
        d.line([fx, y + h - 5, fx, y + h], fill=gold)
    top = 18
    txt(d, (x + w // 2, y + 8), "Claude", 8, gold, anchor="ma")               # 上款
    for i, ch in enumerate("有求必应"):                                          # 正文，离下边留出空
        txt(d, (x + 35, y + top + i * 10), ch, 10, gold, anchor="ma")
    # 下款「美国东八区用户敬赠」：竖排两列，从右往左读。右列：美国东八区；左列：用户敬赠
    rx, lx, ly = x + 21, x + 11, y + top + 2
    for i, ch in enumerate("美国东八区"):
        txt(d, (rx, ly + i * 8), ch, 8, gold_d, anchor="ma")
    for i, ch in enumerate("用户敬赠"):
        txt(d, (lx, ly + i * 8), ch, 8, gold_d, anchor="ma")


def _features(d, cx, sk, sk_d, sk_dd, sk_l):
    d.line([cx + 2, 54, cx + 2, 61], fill=sk_d)
    d.line([cx - 1, 55, cx - 1, 60], fill=sk_l)
    d.line([cx - 3, 62, cx + 5, 62], fill=sk_dd)
    d.line([cx - 18, 60, cx - 15, 66], fill=sk_d)


@lru_cache(maxsize=512)
def portrait(p, expr="neutral", slip=False, sweat=None):
    S = Image.new("RGBA", (180, 128), (0, 0, 0, 0))
    d = draw(S)
    cx = 90
    sk, sk_d, sk_dd, sk_l = SKINS[p.skin]
    (hx0, hy0, hx1, hy1), jaw = FACES[p.face]
    head = (cx + hx0, hy0, cx + hx1, hy1)
    jawp = [(cx + x, y) for x, y in jaw]
    jb = max(y for _, y in jaw)

    _hair_back(d, p, cx, head)
    if p.top == "hoodie":
        d.ellipse([cx - 30, 78, cx + 30, 100], fill=shade(p.top_color, 0.7))
    _body(S, d, p, cx)
    _neck(d, cx, sk_d, sk_dd)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        d.ellipse([head[0] + dx, head[1] + dy, head[2] + dx, head[3] + dy], fill=OUTLINE)
        d.polygon([(x + dx, y + dy) for x, y in jawp], fill=OUTLINE)
    ex0, ex1 = head[0] - 5, head[2] + 5
    d.rectangle([ex0, 44, ex0 + 6, 60], fill=OUTLINE)
    d.rectangle([ex0 + 1, 45, ex0 + 6, 59], fill=sk)
    d.line([ex0 + 3, 48, ex0 + 3, 56], fill=sk_d)
    d.rectangle([ex1 - 6, 44, ex1, 60], fill=OUTLINE)
    d.rectangle([ex1 - 6, 45, ex1 - 1, 59], fill=sk_d)
    d.line([ex1 - 3, 48, ex1 - 3, 56], fill=sk_dd)
    d.ellipse(list(head), fill=sk)
    d.polygon(jawp, fill=sk)
    hr = hx1
    d.polygon([(cx + 16, 30), (cx + hr, 44), (cx + hr - 3, 66), (cx + 12, jb), (cx + 5, jb),
               (cx + 15, 66), (cx + 19, 46)], fill=sk_d)
    d.line([cx - 10, jb, cx + 10, jb], fill=sk_d)
    _features(d, cx, sk, sk_d, sk_dd, sk_l)
    if p.eyebags:
        d.line([cx - 17, 53, cx - 11, 53], fill=sk_dd)
        d.line([cx + 9, 53, cx + 15, 53], fill=sk_dd)
    hidden_eyes = p.eyes == "sunglasses" and not slip
    if not hidden_eyes:
        _eyes(d, cx, "shock" if slip else expr, sk_d, sk_dd, shade(p.hair_color, 0.8) if p.hair != "bald" else (120, 116, 110))
    _mouth(d, cx, expr, sk_d)
    _beard(S, d, p, cx, head, jb, (sk, sk_d))
    _hair_top(d, p, cx, head, sk_l)
    _hat(d, p, cx, head, sk_d)
    if p.hat == "balaclava":
        _balaclava(S, d, p, cx, head, jawp)
    _eyewear(d, p, cx, slip)
    _acc(d, p, cx, head, expr)
    if p.mystery:
        # 兜帽下的阴影，只露出两点眼光
        hood_in = shade(p.hat_color, 0.55)
        d.chord([head[0] - 1, head[1] - 2, head[2] + 1, head[1] + 70], 180, 360, fill=hood_in)
        d.rectangle([head[0] - 1, head[1] + 33, head[2] + 1, 54], fill=hood_in)
        d.line([head[0] + 4, 55, head[2] - 4, 55], fill=shade(sk, 0.6))
        d.point((cx - 13, 49), fill=(220, 210, 180))
        d.point((cx + 12, 49), fill=(220, 210, 180))
    if sweat is not None:
        sx, sy = cx + 22, 42 + sweat
        d.point((sx, sy), fill=SWEAT)
        d.rectangle([sx - 1, sy + 1, sx + 1, sy + 3], fill=SWEAT)
        d.point((sx - 1, sy + 1), fill=WHITE)
    if p.shadow:
        sil = Image.new("RGBA", S.size, (30, 28, 31, 255))
        S = Image.composite(sil, Image.new("RGBA", S.size, (0, 0, 0, 0)), S.getchannel("A"))
    return S


@lru_cache(maxsize=32)
def group_sprite(people, expr):
    """六个人挤在一起：后排三人偏暗、偏高，前排三人。"""
    G = Image.new("RGBA", (300, 128), (0, 0, 0, 0))
    back, front = people[:3], people[3:]
    for p, dx in zip(back, (-62, 0, 62)):
        spr = portrait(p, expr)
        dark = Image.blend(spr, Image.new("RGBA", spr.size, (20, 18, 18, 255)), 0.3)
        dark.putalpha(spr.getchannel("A"))
        G.alpha_composite(dark, (60 + dx, -14))
    for p, dx in zip(front, (-46, 10, 64)):
        G.alpha_composite(portrait(p, expr), (60 + dx, 6))
    return G


def photo(sprite, size=(40, 50), bg=(176, 180, 176)):
    """证件照：同一张立绘缩小 + 压色，像原作那样粗糙。"""
    w = sprite.width
    src = sprite.crop((w // 2 - 40, 0, w // 2 + 40, 100))
    flat = Image.new("RGB", src.size, bg)
    flat.paste(src, (0, 0), src)
    small = flat.resize(size, Image.BOX)
    return small.quantize(colors=12, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
