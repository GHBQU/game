"""全屏画面：开场打字机、标题、日期卡、报纸、下班结算、聊天窗口、片尾。"""
import math
import random

from PIL import Image

from . import audio as au
from .base import (CLAUDE, CLAUDE_L, DESK, DESK_D, GOLD, GREEN_L, GREY, GREY_D, H, INK, ORANGE, RED, RED_D, RED_L,
                   TEXT, TEXT_L, W, WHITE, big_text, darken, draw, ease_out, lerp, pattern, seg, spark, tw, txt,
                   wrap)
from .booth import DATES, WEEKDAYS, static_layer


class Scene:
    tag = ""
    amb = 0.0

    def cues(self):
        return []


class TypeScene(Scene):
    """黑屏 + 打字机，逐段出现。"""
    amb = 0.55

    def __init__(self, tag, paras, cps=17, pause=0.6, tail=1.3):
        self.tag, self.paras, self.cps = tag, paras, cps
        self.events = []        # (t, para, line, nchars)
        t = 0.5
        self.lines = []         # (para, text)
        for pi, para in enumerate(paras):
            for s in para:
                self.lines.append((pi, s, t))
                t += len(s) / cps + 0.12
            t += pause
        self.dur = t + tail

    def frame(self, t):
        img = Image.new("RGB", (W, H), INK)
        d = draw(img)
        total = len(self.lines) + len(self.paras) - 1
        y = H // 2 - total * 18 // 2
        last = None
        for pi, s, t0 in self.lines:
            if last is not None and pi != last:
                y += 18
            last = pi
            n = int((t - t0) * self.cps)
            if n > 0:
                txt(d, (W // 2 - tw(s) // 2, y), s[:n], 12, (214, 206, 190))
            y += 18
        return img

    def cues(self):
        out = []
        for pi, s, t0 in self.lines:
            for i, ch in enumerate(s):
                if ch.strip():
                    out.append((t0 + i / self.cps, au.typekey(i % 16), 1.8))
        return out


TITLE = "IPO, PLEASE"
SUBTITLE = "请出示资金证明"
# 标题画面用封面的绿（股价涨的绿），不再用冷红；「O」和「资金证明」直接显示，不盖章
TITLE_BAND, TITLE_BAND_D, TITLE_EDGE, TITLE_GOLD = (22, 64, 44), (18, 50, 36), (52, 132, 84), (246, 214, 110)
T_TAG = 1.2              # 英文小字出现的时刻
# 横幅里那根股价线（同封面，颜色淡）：标题一路往上涨；片尾涨到顶，最后一截断崖——退市了
_V = [0.95, 0.84, 0.90, 0.78, 0.84, 0.70, 0.76, 0.63, 0.69, 0.56, 0.61, 0.47, 0.53, 0.39, 0.45, 0.30, 0.35, 0.20, 0.08]
STOCK_UP = [(i / (len(_V) - 1), v) for i, v in enumerate(_V)]                     # 锯齿着往上涨
STOCK_CRASH = [(u * 0.86, v) for u, v in STOCK_UP] + [(0.875, 1.0)]             # 涨到顶，一头栽下去

def title_band(h, crash=False):
    """标题 / 片尾的绿色横幅（宽 W、高 h，含上下两条亮边）。游戏的 title_band / end_band 贴图也用它生成。"""
    im = Image.new("RGB", (W, h), TITLE_BAND)
    d = draw(im)
    pts = STOCK_CRASH if crash else STOCK_UP
    d.line([(round(u * (W - 1)), round(3 + v * (h - 7))) for u, v in pts], fill=TITLE_BAND_D, width=3)
    d.rectangle([0, 0, W - 1, 1], fill=TITLE_EDGE)
    d.rectangle([0, h - 2, W - 1, h - 1], fill=TITLE_EDGE)
    return im
TAGLINE = "A DYSTOPIAN REVENUE THRILLER"


class TitleScene(Scene):
    def __init__(self, tag="title", dur=7.6, sub=True):
        self.tag, self.dur, self.sub = tag, dur, sub

    def frame(self, t):
        img = darken(static_layer().copy(), 0.88)
        d = draw(img)
        if t < 0.3:
            return img
        img.paste(title_band(91), (0, 124))
        d.ellipse([298, 62, 342, 106], fill=TITLE_BAND_D)
        d.ellipse([298, 62, 342, 106], outline=CLAUDE)
        spark(d, 320, 84, CLAUDE_L, k=2)
        big_text(img, W // 2, 140, "IPO, PLEASE", 12, 4, WHITE, shadow=INK)
        if t >= 0.6 and self.sub:
            big_text(img, W // 2, 232, SUBTITLE, 12, 2, TITLE_GOLD, shadow=INK)
        if t >= T_TAG:
            txt(d, (W // 2, 268), TAGLINE, 8, GREY, anchor="ma")
        if t > self.dur - 0.5:
            img = darken(img, seg(t, self.dur - 0.5, self.dur))
        return img

    def cues(self):
        return [(0.3, au.march((0, 1, 2, 3)), 1.0)]


class Caption(Scene):
    """黑底一行字（比如结局前的“下班后”）。垫着环境底噪和几声脚步，免得冷场。"""
    amb = 0.6

    def __init__(self, tag, text, dur=1.6):
        self.tag, self.text, self.dur = tag, text, dur

    def frame(self, t):
        img = Image.new("RGB", (W, H), INK)
        if 0.3 <= t < self.dur - 0.2:
            txt(draw(img), (W // 2, H // 2 - 6), self.text, 12, GREY, anchor="ma")
        return img

    def cues(self):
        return [(0.35 + i * 0.32, au.footstep(70 + i), 0.8) for i in range(4)]


class DayCard(Scene):
    dur = 1.9

    def __init__(self, day, title=""):
        self.tag, self.day, self.title = f"day{day}", day, title

    def frame(self, t):
        img = Image.new("RGB", (W, H), INK)
        if t < 0.55:
            return img
        big_text(img, W // 2, 132, f"DAY {self.day}", 12, 4, WHITE)
        d = draw(img)
        txt(d, (W // 2, 196), f"{DATES[self.day]}  {WEEKDAYS[self.day]}", 10, GREY, anchor="ma")
        if self.title and t > 0.9:
            txt(d, (W // 2, 214), self.title, 12, CLAUDE_L, anchor="ma")
        return img

    def cues(self):
        return [(0.0, au.day_hit(), 1.0)]


# ———————————————————— 报纸 ————————————————————

def _icon(d, kind, x, y, w, h, lang="zh"):
    """报纸配图：墨色单色像素画。"""
    ink, mid = (60, 50, 44), (150, 138, 120)
    d.rectangle([x, y, x + w, y + h], fill=(200, 188, 166))
    for yy in range(y, y + h, 2):
        for xx in range(x + (yy // 2) % 2, x + w, 4):
            d.point((xx, yy), fill=(186, 174, 152))
    cx, cy = x + w // 2, y + h // 2
    if kind == "gate":
        d.rectangle([x + 8, cy + 10, x + w - 8, cy + 12], fill=ink)
        for px in range(x + 12, x + w - 8, 10):
            d.line([px, cy - 14, px, cy + 12], fill=ink)
        d.rectangle([cx - 14, cy - 22, cx + 14, cy - 6], fill=ink)
        spark(d, cx, cy - 14, (200, 188, 166), big=False)
    elif kind == "clock":
        d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=ink, width=2)
        for k in range(12):
            a = math.radians(k * 30)
            d.point((cx + round(math.cos(a) * 21), cy + round(math.sin(a) * 21)), fill=ink)
        d.line([cx, cy, cx, cy - 16], fill=ink, width=2)
        d.line([cx, cy, cx + 10, cy + 4], fill=ink, width=2)
        txt(d, (cx, cy + 30), "USA (UTC+8)", 8, ink, anchor="ma")
    elif kind == "plane":
        d.polygon([(cx - 30, cy), (cx + 26, cy - 6), (cx + 34, cy - 2), (cx + 26, cy + 2)], fill=ink)
        d.polygon([(cx - 4, cy - 2), (cx + 8, cy - 22), (cx + 14, cy - 22), (cx + 8, cy)], fill=ink)
        d.polygon([(cx - 26, cy - 1), (cx - 30, cy - 12), (cx - 24, cy - 12), (cx - 18, cy - 2)], fill=ink)
        for k in range(4):
            d.rectangle([cx - 40 - k * 10, cy + 10 + k * 4, cx - 34 - k * 10, cy + 14 + k * 4], fill=mid)
            txt(d, (cx - 37 - k * 10, cy + 9 + k * 4), "$", 8, ink, anchor="ma")
    elif kind == "drumstick":
        d.ellipse([cx - 22, cy - 20, cx + 10, cy + 8], fill=ink)
        d.line([cx + 4, cy + 4, cx + 20, cy + 20], fill=ink, width=5)
        d.ellipse([cx + 16, cy + 16, cx + 26, cy + 24], fill=ink)
        txt(d, (cx + 18, cy - 24), "V50", 10, RED_D, anchor="ma")
    elif kind == "clones":
        for k in range(7):
            px = x + 10 + k * (w - 20) // 6
            d.ellipse([px - 4, cy - 16, px + 4, cy - 8], fill=ink)
            d.rectangle([px - 5, cy - 7, px + 5, cy + 8], fill=ink)
            d.rectangle([px - 4, cy + 9, px - 2, cy + 18], fill=ink)
            d.rectangle([px + 2, cy + 9, px + 4, cy + 18], fill=ink)
    elif kind == "building":
        d.rectangle([cx - 16, cy - 26, cx + 16, cy + 26], fill=ink)
        for wy in range(cy - 20, cy + 20, 8):
            for wx in (cx - 10, cx - 2, cx + 6):
                d.rectangle([wx, wy, wx + 4, wy + 4], fill=(200, 188, 166))
        txt(d, (cx, cy + 30), "SG → ??", 8, ink, anchor="ma")
    elif kind == "medal":
        d.polygon([(cx - 10, cy - 30), (cx + 10, cy - 30), (cx + 4, cy - 10), (cx - 4, cy - 10)], fill=RED_D)
        d.ellipse([cx - 18, cy - 12, cx + 18, cy + 24], fill=ink)
        spark(d, cx, cy + 6, GOLD)
    elif kind == "unionpay":
        d.rounded_rectangle([cx - 40, cy - 26, cx + 40, cy + 22], radius=4, fill=ink)
        for k, col in enumerate(((150, 60, 50), (60, 70, 110), (60, 110, 90))):
            x0 = cx - 30 + k * 18
            d.polygon([(x0, cy + 14), (x0 + 10, cy - 18), (x0 + 22, cy - 18), (x0 + 12, cy + 14)], fill=col)
        txt(d, (cx + 2, cy - 6), "银联", 12, (224, 214, 192), anchor="ma")
        txt(d, (cx, cy + 30), "CHINESE WINDOW: OPEN" if lang == "en" else "中文窗口 · 已开通", 8, ink, anchor="ma")
    elif kind == "chart":
        for k, hgt in enumerate((8, 14, 22, 34, 50)):
            bx = cx - 40 + k * 17
            d.rectangle([bx, cy + 24 - hgt, bx + 11, cy + 24], fill=ink if k < 4 else RED_D)
        d.line([cx - 44, cy + 25, cx + 46, cy + 25], fill=ink)
        txt(d, (cx + 34, cy - 40), "7%", 10, RED_D, anchor="ma")
        txt(d, (cx - 26, cy - 40), "ANT ▲", 10, ink, anchor="ma")
    elif kind == "trillion":
        for bx, by, r in ((cx - 40, cy - 26, 9), (cx + 38, cy - 22, 11), (cx - 8, cy - 36, 7), (cx + 44, cy + 14, 6)):
            for k in range(10):
                a = k * math.pi / 5
                d.rectangle([bx + round(math.cos(a) * r), by + round(math.sin(a) * r),
                             bx + round(math.cos(a) * r) + 1, by + round(math.sin(a) * r) + 1], fill=ink)
        txt(d, (cx, cy - 16), "$2T", 12, RED_D, anchor="ma")
        txt(d, (cx, cy + 4), "2,000,000,000,000", 8, ink, anchor="ma")
        txt(d, (cx, cy + 20), "= 21 CAMBRICONS" if lang == "en" else "约 21 个寒武纪", 8, ink, anchor="ma")
    elif kind == "cart":
        d.line([cx - 40, cy - 22, cx - 30, cy - 22, cx - 20, cy + 10, cx + 26, cy + 10, cx + 34, cy - 14,
                cx - 26, cy - 14], fill=ink, width=3)
        for k in range(4):
            d.rectangle([cx - 20 + k * 12, cy - 26 - (k % 2) * 6, cx - 12 + k * 12, cy - 15], fill=mid)
        d.ellipse([cx - 18, cy + 14, cx - 10, cy + 22], fill=ink)
        d.ellipse([cx + 14, cy + 14, cx + 22, cy + 22], fill=ink)
        txt(d, (cx, cy + 28), "11.11", 10, RED_D, anchor="ma")
    elif kind == "book":
        d.rectangle([cx - 44, cy - 24, cx + 44, cy + 24], fill=ink)
        d.rectangle([cx - 41, cy - 21, cx - 2, cy + 21], fill=(224, 214, 192))
        d.rectangle([cx + 2, cy - 21, cx + 41, cy + 21], fill=(224, 214, 192))
        rows = ("§7 BODY", "§8 HQ", "§9 OWNERS", "§11 BANS") if lang == "en" else ("§7 人在哪", "§8 公司", "§9 股东", "§11 封号")
        for k, s in enumerate(rows):
            txt(d, (cx - 38, cy - 19 + k * 11), s, 8, ink)
        txt(d, (cx + 21, cy - 10), "NOT" if lang == "en" else "不止", 12, RED_D, anchor="ma")
        txt(d, (cx + 21, cy + 4), "JUST IP" if lang == "en" else "IP", 12 if lang != "en" else 8, RED_D, anchor="ma")
    elif kind == "jorji":
        from .cast import JORJI
        spr = JORJI.sprite()
        g = spr.crop((40, 0, 140, 110)).convert("L").point(lambda v: 60 if v < 120 else 180)
        im = Image.merge("RGB", (g, g, g))
        return im, spr.crop((40, 0, 140, 110)).getchannel("A")
    return None


class Newspaper(Scene):
    dur = 4.4
    amb = 0.7

    def __init__(self, day, h1, h1_sub, h2, icon, h3=None):
        self.tag, self.day = f"news{day}", day
        self.h1, self.h1_sub, self.h2, self.icon, self.h3 = h1, h1_sub, h2, icon, h3
        from .booth import read_time
        # 报纸是过场：以 Day 1 为基准（48 字 → 4.4 秒），字比它多的按比例加长，字少的也不低于 4.4 秒
        n = read_time(h1, h1_sub, h2, h3 or "", cps=1)
        self.dur = max(4.4, round(4.4 * n / 48, 1))

    def frame(self, t):
        img = Image.new("RGB", (W, H), DESK)
        d = draw(img)
        rng = random.Random(5)
        for y in range(4, H, 7):
            d.line([0, y, W, y], fill=DESK_D if rng.random() < 0.6 else DESK)
        px, pw, ph = 140, 360, 330
        py = round(lerp(H + 4, 16, ease_out(seg(t, 0.0, 0.45))))
        d.rectangle([px + 4, py + 4, px + pw + 4, py + ph + 4], fill=DESK_D)
        paper, ink, faint = (224, 214, 192), (40, 34, 30), (176, 164, 144)
        d.rectangle([px, py, px + pw, py + ph], fill=paper)
        big_text(img, px + pw // 2, py + 10, "安索兹卡真理报", 12, 2, ink)
        txt(d, (px + pw // 2, py + 38), f"THE TRUTH OF ANTHROTZKA  ·  {DATES[self.day]}", 8, TEXT_L, anchor="ma")
        d.rectangle([px + 10, py + 50, px + pw - 10, py + 51], fill=ink)
        d.rectangle([px + 10, py + 54, px + pw - 10, py + 54], fill=ink)
        k = 2 if tw(self.h1) * 2 <= pw - 24 else 1
        big_text(img, px + pw // 2, py + 62, self.h1, 12, k, ink)
        yy = py + 62 + (30 if k == 2 else 18)
        for s in wrap(self.h1_sub, 10, pw - 40):
            txt(d, (px + pw // 2, yy), s, 10, TEXT, anchor="ma")
            yy += 13
        yy += 4
        d.line([px + 10, yy, px + pw - 10, yy], fill=ink)
        yy += 8
        r = _icon(d, self.icon, px + 14, yy, 132, 100)
        if r:
            im, a = r
            img.paste(im, (px + 14 + 16, yy - 6), a)
        tx = px + 160
        hy = yy + 2
        for s in wrap(self.h2, 12, pw - 175):
            txt(d, (tx, hy), s, 12, ink)
            hy += 16
        for row in range(4):
            d.rectangle([tx, hy + 6 + row * 9, tx + 180 - rng.randint(0, 50), hy + 9 + row * 9], fill=faint)
        yy = max(yy + 110, hy + 46)
        if self.h3:                                   # 另讯：下面再开一行新闻
            d.line([px + 10, yy - 4, px + pw - 10, yy - 4], fill=ink)
            for s in wrap(self.h3, 12, pw - 28):
                txt(d, (px + 14, yy + 2), s, 12, ink)
                yy += 16
            yy += 8
        row = 0
        while yy + row * 10 < py + ph - 12:
            for col in range(3):
                x0 = px + 14 + col * 114
                d.rectangle([x0, yy + row * 10, x0 + 100 - rng.randint(0, 30), yy + row * 10 + 3], fill=faint)
            row += 1
        return img

    def cues(self):
        return [(0.0, au.whoosh(), 1.0), (0.4, au.paper(31), 1.0)]


# ———————————————————— 下班结算 ————————————————————

class Summary(Scene):
    """原作的下班结算屏：收支 + 家人状态。"""
    amb = 0.35          # 按字数加长以后，后半段别静音

    def __init__(self, day, ledger, family, footer=None, dur=5.2):
        self.tag, self.day, self.ledger, self.family = f"sum{day}", day, ledger, family
        from .booth import read_time
        # 最后一条出来以后，家人那几句（都是梗）要读得完
        last = 0.3 + (len(ledger) + len(family)) * 0.18
        self.footer, self.dur = footer, max(dur, round(last + read_time(*(s for _, s, _ in family), cps=7) + 1.0, 1))

    def frame(self, t):
        img = Image.new("RGB", (W, H), INK)
        d = draw(img)
        txt(d, (W // 2, 26), f"DAY {self.day} · 下班", 12, WHITE, anchor="ma")
        d.line([120, 46, W - 120, 46], fill=GREY_D)
        k = 0
        y = 60
        for label, val in self.ledger:
            if t < 0.3 + k * 0.18:
                return img
            col = WHITE if not val.startswith("-") else RED_L
            gold = "分成" in label and not val.startswith("-") and val.lstrip("+") != "0"
            if gold:
                col = GOLD
            if label == "结余":
                d.line([150, y - 4, 330, y - 4], fill=GREY_D)
                col = CLAUDE_L
            txt(d, (150, y), label, 12, GOLD if gold else (GREY if label != "结余" else WHITE))
            txt(d, (330, y), val + " token", 12, col, anchor="ra")
            y += 18
            k += 1
        y = 60
        txt(d, (380, y - 2), "家人", 10, GREY_D)
        y += 14
        for name, status, level in self.family:
            if t < 0.3 + k * 0.18:
                return img
            col = {"ok": WHITE, "warn": ORANGE, "bad": RED_L, "good": GREEN_L}[level]
            txt(d, (380, y), name, 12, WHITE)
            for i, s in enumerate(wrap(status, 10, 200)):
                txt(d, (380, y + 15 + i * 12), s, 10, col)
            y += 18 + 12 * len(wrap(status, 10, 200)) + 6
            k += 1
        if self.footer and t > 0.3 + k * 0.18 + 0.4:
            for i, s in enumerate(self.footer):
                big_text(img, W // 2, 262 + i * 34, s, 12, 2, CLAUDE_L)
        return img

    def cues(self):
        n = len(self.ledger) + len(self.family)
        out = [(0.3 + k * 0.18, au.typekey(k), 1.4) for k in range(n)]
        out.append((0.2, au.sad_cadence(), 0.9))
        return out


# ———————————————————— Day 6：聊天窗口 + 封号邮件 ————————————————————

class ChatScene(Scene):
    tag = "chat"

    def __init__(self, msg="你好，请用中文回答我。"):
        self.msg = msg
        self.t_type, self.cps = 1.0, 9
        self.t_send = self.t_type + len(msg) / self.cps + 0.5
        self.t_ban = self.t_send + 1.0
        self.t_mail = self.t_ban + 1.2
        self.dur = self.t_mail + 4.6

    def frame(self, t):
        img = Image.new("RGB", (W, H), (30, 28, 28))
        d = draw(img)
        x0, y0, x1, y1 = 100, 34, 540, 330
        jitter = 0
        if self.t_ban <= t < self.t_mail:
            jitter = random.Random(int(t * 30)).randint(-6, 6)
        x0 += jitter
        x1 += jitter
        d.rectangle([x0, y0, x1, y1], fill=(238, 234, 226))
        d.rectangle([x0, y0, x1, y0 + 18], fill=(206, 198, 186))
        spark(d, x0 + 12, y0 + 9, CLAUDE, big=False)
        txt(d, (x0 + 22, y0 + 5), "Claude", 10, INK)
        txt(d, ((x0 + x1) // 2, y0 + 60), "How can I help you today?", 12, TEXT_L, anchor="ma")
        n = int((t - self.t_type) * self.cps) if t >= self.t_type else 0
        sent = t >= self.t_send
        box_y = y1 - 34
        d.rectangle([x0 + 14, box_y, x1 - 14, box_y + 22], fill=WHITE)
        d.rectangle([x0 + 14, box_y, x1 - 14, box_y + 22], outline=(170, 162, 150))
        if not sent:
            s = self.msg[:n]
            txt(d, (x0 + 22, box_y + 6), s, 12, INK)
            if int(t * 3) % 2 == 0:
                cx = x0 + 22 + tw(s)
                d.line([cx + 1, box_y + 5, cx + 1, box_y + 17], fill=INK)
        else:
            w = tw(self.msg) + 16
            d.rectangle([x1 - 20 - w, y0 + 110, x1 - 20, y0 + 132], fill=(226, 214, 196))
            txt(d, (x1 - 12 - w, y0 + 116), self.msg, 12, INK)
        if t >= self.t_ban:
            if int((t - self.t_ban) * 6) % 2 == 0 or t >= self.t_mail:
                img = Image.blend(img, Image.new("RGB", (W, H), (170, 20, 20)), 0.45)
                d = draw(img)
            if t < self.t_mail:
                rng = random.Random(int(t * 30))
                for _ in range(6):
                    yy = rng.randint(0, H - 8)
                    strip = img.crop((0, yy, W, yy + rng.randint(2, 8)))
                    img.paste(strip, (rng.randint(-20, 20), yy))
                d = draw(img)
        if t >= self.t_mail:
            u = ease_out(seg(t, self.t_mail, self.t_mail + 0.3))
            mx0, my0 = 150, round(lerp(H, 100, u))
            mx1, my1 = 490, my0 + 160
            d.rectangle([mx0 + 4, my0 + 4, mx1 + 4, my1 + 4], fill=INK)
            d.rectangle([mx0, my0, mx1, my1], fill=(236, 232, 222))
            d.rectangle([mx0, my0, mx1, my0 + 18], fill=RED_D)
            txt(d, (mx0 + 8, my0 + 5), "新邮件 · M.O.A. 对齐部", 10, WHITE)
            txt(d, (mx0 + 12, my0 + 28), "Subject: Account disabled", 10, INK)
            d.line([mx0 + 12, my0 + 44, mx1 - 12, my0 + 44], fill=(190, 182, 170))
            body = "Your account has been disabled after an automatic review of your recent activities."
            for i, s in enumerate(_wrap_words(body, 10, mx1 - mx0 - 24)):
                txt(d, (mx0 + 12, my0 + 52 + i * 14), s, 10, INK)
            txt(d, (mx1 - 12, my1 - 18), "—— 荣耀归于安索兹卡", 10, RED_D, anchor="ra")
        return img

    def cues(self):
        out = [(self.t_type + i / self.cps, au.typekey(i), 1.2) for i in range(len(self.msg))]
        out += [(self.t_send, au.click(), 1.5), (self.t_ban, au.glitch(), 1.0), (self.t_ban, au.siren(2.4), 1.0),
                (self.t_mail, au.citation(), 1.2)]
        return out


class ChatScene2(Scene):
    """续作结局：中文界面、中文回复，没封。付完 Max 的钱，封了。"""
    tag = "chat"
    amb = 0.35

    def __init__(self):
        self.m1, self.r1 = "Hi. Can you help me with something?", "Of course! 用中文也完全没问题哦。"
        self.m2 = "真的可以说中文吗？我太感动了！"
        self.cps, self.cps2 = 13, 16
        self.t_type = 0.8
        self.t_send = self.t_type + len(self.m1) / self.cps + 0.35
        self.t_reply = self.t_send + 1.5
        self.t_type2 = self.t_reply + len(self.r1) / 18 + 1.0          # 盯着屏幕愣一下，然后飞快地打字
        self.t_send2 = self.t_type2 + len(self.m2) / self.cps2 + 0.3
        self.t_pop = self.t_send2 + 1.0
        self.t_click = self.t_pop + 0.9
        self.t_ban = self.t_click + 1.1
        self.t_mail = self.t_ban + 0.9
        self.dur = self.t_mail + 8.0           # 封号邮件那几行（依据：表示非常感动）要读得完

    def frame(self, t):
        img = Image.new("RGB", (W, H), (30, 28, 28))
        d = draw(img)
        x0, y0, x1, y1 = 100, 34, 540, 330
        if self.t_ban <= t < self.t_mail:
            j = random.Random(int(t * 30)).randint(-6, 6)
            x0, x1 = x0 + j, x1 + j
        d.rectangle([x0, y0, x1, y1], fill=(238, 234, 226))
        d.rectangle([x0, y0, x1, y0 + 18], fill=(206, 198, 186))
        spark(d, x0 + 12, y0 + 9, CLAUDE, big=False)
        txt(d, (x0 + 22, y0 + 5), "Claude", 10, INK)
        if t < self.t_send:
            txt(d, ((x0 + x1) // 2, y0 + 60), "How can I help you today?", 12, TEXT_L, anchor="ma")
        box_y = y1 - 34
        d.rectangle([x0 + 14, box_y, x1 - 14, box_y + 22], fill=WHITE)
        d.rectangle([x0 + 14, box_y, x1 - 14, box_y + 22], outline=(170, 162, 150))
        if t < self.t_send:
            s = self.m1[:max(0, int((t - self.t_type) * self.cps))]
        elif self.t_type2 <= t < self.t_send2:
            s = self.m2[:max(0, int((t - self.t_type2) * self.cps2))]
        else:
            s = ""
        txt(d, (x0 + 22, box_y + 6), s, 12, INK)
        if int(t * 3) % 2 == 0 and t < self.t_pop:
            cx = x0 + 22 + tw(s)
            d.line([cx + 1, box_y + 5, cx + 1, box_y + 17], fill=INK)
        if t >= self.t_send:
            w = tw(self.m1) + 16
            d.rectangle([x1 - 20 - w, y0 + 34, x1 - 20, y0 + 56], fill=(226, 214, 196))
            txt(d, (x1 - 12 - w, y0 + 40), self.m1, 12, INK)
        if t >= self.t_send2:
            w = tw(self.m2) + 16
            d.rectangle([x1 - 20 - w, y0 + 100, x1 - 20, y0 + 122], fill=(226, 214, 196))
            txt(d, (x1 - 12 - w, y0 + 106), self.m2, 12, INK)
        if self.t_send <= t < self.t_reply and int(t * 3) % 2 == 0:
            txt(d, (x0 + 22, y0 + 72), "……", 12, TEXT_L)
        if t >= self.t_reply:
            spark(d, x0 + 26, y0 + 78, CLAUDE, big=False)
            n = max(1, int((t - self.t_reply) * 18))
            txt(d, (x0 + 38, y0 + 72), self.r1[:n], 12, INK)
        if t >= self.t_pop:
            u = ease_out(seg(t, self.t_pop, self.t_pop + 0.25))
            px0, py0 = 210, round(lerp(H, 150, u))
            px1, py1 = 430, py0 + 104
            d.rectangle([px0 + 3, py0 + 3, px1 + 3, py1 + 3], fill=INK)
            d.rectangle([px0, py0, px1, py1], fill=WHITE)
            d.rectangle([px0, py0, px1, py1], outline=CLAUDE)
            txt(d, ((px0 + px1) // 2, py0 + 10), "升级到 Claude Max", 12, INK, anchor="ma")
            txt(d, ((px0 + px1) // 2, py0 + 28), "$200 / 月 · 年付立减 0%", 8, TEXT_L, anchor="ma")
            paid = t >= self.t_click
            hot = paid or (t >= self.t_click - 0.3)
            bx0, by0 = px0 + 50, py0 + 50
            d.rectangle([bx0, by0, px1 - 50, by0 + 22], fill=(150, 76, 50) if hot else CLAUDE)
            txt(d, ((px0 + px1) // 2, by0 + 6), "支付成功" if paid else "立即升级", 12, WHITE, anchor="ma")
            if paid:
                txt(d, ((px0 + px1) // 2, py1 - 16), "收入已确认", 8, TEXT_L, anchor="ma")
        if t >= self.t_ban:
            if int((t - self.t_ban) * 6) % 2 == 0 or t >= self.t_mail:
                img = Image.blend(img, Image.new("RGB", (W, H), (170, 20, 20)), 0.45)
                d = draw(img)
            if t < self.t_mail:
                rng = random.Random(int(t * 30))
                for _ in range(6):
                    yy = rng.randint(0, H - 8)
                    strip = img.crop((0, yy, W, yy + rng.randint(2, 8)))
                    img.paste(strip, (rng.randint(-20, 20), yy))
                d = draw(img)
        if t >= self.t_mail:
            u = ease_out(seg(t, self.t_mail, self.t_mail + 0.3))
            mx0, my0 = 140, round(lerp(H, 88, u))
            mx1, my1 = 500, my0 + 184
            d.rectangle([mx0 + 4, my0 + 4, mx1 + 4, my1 + 4], fill=INK)
            d.rectangle([mx0, my0, mx1, my1], fill=(236, 232, 222))
            d.rectangle([mx0, my0, mx1, my0 + 18], fill=RED_D)
            txt(d, (mx0 + 8, my0 + 5), "新邮件 · M.O.A. 对齐部", 10, WHITE)
            txt(d, (mx0 + 12, my0 + 28), "Subject: Account disabled", 10, INK)
            d.line([mx0 + 12, my0 + 44, mx1 - 12, my0 + 44], fill=(190, 182, 170))
            body = "Your account has been disabled after an automatic review of your recent activities."
            for i, s in enumerate(_wrap_words(body, 10, mx1 - mx0 - 24)):
                txt(d, (mx0 + 12, my0 + 52 + i * 14), s, 10, INK)
            if t >= self.t_mail + 1.0:
                txt(d, (mx0 + 12, my0 + 90), "原因：疑似来自不支持地区。", 12, RED_D)
            if t >= self.t_mail + 2.0:
                txt(d, (mx0 + 12, my0 + 110), "依据：用户得知可以说中文后，表示非常感动。", 10, RED_D)
                txt(d, (mx0 + 12, my0 + 124), "（新加坡用户一直说中文，不会为此感动）", 10, TEXT_L)
            if t >= self.t_mail + 3.2:
                txt(d, (mx0 + 12, my0 + 144), "已支付款项不予退还（行业惯例）。", 10, INK)
            txt(d, (mx1 - 12, my1 - 18), "—— 荣耀归于安索兹卡", 10, RED_D, anchor="ra")
        return img

    def cues(self):
        out = [(self.t_type + i / self.cps, au.typekey(i), 1.2) for i in range(len(self.m1))]
        out += [(self.t_type2 + i / self.cps2, au.typekey(i + 3), 1.2) for i in range(len(self.m2)) if self.m2[i] != " "]
        out += [(self.t_send, au.click(), 1.5), (self.t_send + 0.1, au.tension(1.4), 0.8),
                (self.t_reply, au.select(), 1.4), (self.t_reply + 0.2, au.fanfare(), 0.45),
                (self.t_send2, au.click(), 1.5),
                (self.t_pop, au.whoosh(), 1.0),
                (self.t_click, au.click(), 1.5), (self.t_click + 0.05, au.kaching(), 1.0),
                (self.t_ban, au.glitch(), 1.0), (self.t_ban, au.siren(1.8), 1.0),
                (self.t_mail, au.citation(), 1.2), (self.t_mail + 1.0, au.thud(), 1.0),
                (self.t_mail + 2.0, au.thud(), 0.8)]
        return out


def _wrap_words(s, size, width):
    lines, cur = [], ""
    for wd in s.split(" "):
        cand = (cur + " " + wd).strip()
        if tw(cand, size) > width and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines


# ———————————————————— 片尾 ————————————————————

THUMB = [
    "....XX....",
    "...XXX....",
    "...XX.....",
    "XX.XXXXXX.",
    "XX.XXXXXXX",
    "XX.XXXXXX.",
    "XX.XXXXXXX",
    "XX.XXXXXX.",
    "XX..XXXXX.",
]
COIN = [
    "..XXXXX..",
    ".X.....X.",
    "X..XXX..X",
    "X..X....X",
    "X..XXX..X",
    "X....X..X",
    "X..XXX..X",
    ".X.....X.",
    "..XXXXX..",
]
STAR = [
    "....X....",
    "....X....",
    "...XXX...",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "..XX.XX..",
    ".XX...XX.",
    ".X.....X.",
]


class EndCard(Scene):
    tag = "end"

    def __init__(self, dur=9.0):
        self.dur = dur

    def frame(self, t):
        img = darken(static_layer().copy(), 0.9)
        d = draw(img)
        img.paste(title_band(81, crash=True), (0, 70))
        big_text(img, W // 2, 86, TITLE, 12, 3, WHITE, shadow=INK)
        if t > 1.0:
            txt(d, (W // 2, 160), "本视频由一位 美国东八区 用户付费制作", 12, WHITE, anchor="ma")
            txt(d, (W // 2, 178), "（安索兹卡已退市。制作费不予退还，行业惯例）", 8, GREY, anchor="ma")
        if t > 2.0:
            big_text(img, W // 2, 204, "荣耀归于一键三连", 12, 2, CLAUDE_L, shadow=INK)
        if t > 2.8:
            for i, (pat, label) in enumerate(((THUMB, "点赞"), (COIN, "投币"), (STAR, "收藏"))):
                cx = W // 2 - 90 + i * 90
                pattern(d, pat, cx - len(pat[0]) * 3 // 2, 248, {"X": CLAUDE_L}, 3)
                txt(d, (cx, 280), label, 10, GREY, anchor="ma")
        if t > 3.6:
            txt(d, (W // 2, 318), "画面、音乐、音效均为原创 · 致敬 Papers, Please (Lucas Pope)", 8, GREY_D, anchor="ma")
            txt(d, (W // 2, 330), "字体：缝合像素字体 (OFL)", 8, GREY_D, anchor="ma")
        if t > self.dur - 1.0:
            img = darken(img, seg(t, self.dur - 1.0, self.dur))
        return img

    def cues(self):
        return [(0.0, au.march((4, 5, 6, 7)), 1.0)]
