"""检查亭场景。

用法：先用 Case 的方法按顺序“写剧本”（叫号、进场、说话、递证件、检查、盖章、离开……），
每个方法会自动推进内部时间并记录鼠标路径和音效；渲染时 frame(t) 按时间轴还原画面。
"""
import math
import random
from functools import lru_cache

from PIL import Image, ImageDraw

from . import audio as au
from . import cast
from .base import (BANNER, BOOK, BOOK_L, BOOTH_LOW, BOOTH_WALL, CLAUDE, CLAUDE_L, COUNTER, COUNTER_D, COUNTER_L,
                   DESK, DESK_D, DESK_L, FLAG_W, FRAME_D, GOLD, GREEN, GREEN_D, GREY, GROUND, GROUND_D, GROUND_L,
                   H, HAIR, INK, LED, METAL, METAL_D, METAL_L, OUTLINE, RED, RED_D, RED_L, ROAD, ROAD_L, TEXT, W,
                   WALL, WALL_D, WALL_L, WHITE, WIN_GROUND, WIN_WALL, XRAY_BG, XRAY_FG, XRAY_L, darken, draw,
                   draw_cursor, edge_point, ease_out, lerp, lerp2, pattern, seg, smooth, spark, tw, txt)
from .docs import Card, CrayonPassport, Passport, PromptPaper, _photo, small_icon, stamp_mark

WIN = (8, 134, 210, 262)
WIN_W, WIN_H = WIN[2] - WIN[0] + 1, WIN[3] - WIN[1] + 1
WIN_CX = 101
SPEAKER = (15, 298)
DETAIN_BTN = (172, 268, 212, 280)
INSPECT_BTN = (602, 322, 634, 354)
XRAY_BTN = (566, 322, 598, 354)
LOCATE_BTN = (462, 322, 494, 354)
ASK_BTN = (548, 140, 590, 162)
BANNER_BOX = (300, 134, 598, 168)
TRAY_Y0, TRAY_Y1, TRAY_W = 196, 252, 170
TRAY_X = W - TRAY_W
STAMP_BTN = {"approve": (TRAY_X + 42, 226), "deny": (TRAY_X + 122, 226)}
MARK_XY = {"approve": (483, 220), "deny": (562, 220)}
SLOT_PASSPORT = (446, 172)
PRINT_X = 240
BOOTH_POS = (312, 117)
QUEUE_FRONT = (292, 102)
BANNER1_X = 70


BOARD = (66, 33, 250, 46)         # ANT 股价屏：横条电子屏，挂在墙脚、3H 横幅下方，排队的人正对着它
KIOSK = (538, 58, 586, 97)        # 退款窗口
BAN_BTN = (412, 308, 452, 360)    # 桌上的封号清单（Day 4 起）
LOOKUP_BTN = (372, 322, 404, 354) # 企查：查公司总部、股权穿透（Day 4 起）
BANLIST = (226, 132, 632, 314)    # 封号清单翻开后的整页
BAN_COLS, BAN_CELL = 4, (99, 80)
WALK = 92                         # 室外小人走路速度（像素/秒）
WORLD = {"queue": [], "pending": [], "ant": None, "hist": [], "open": None, "banner": None, "phones": 0,
         "bans": [], "fish": 0, "jinqi": False}
JINQI_WALL = (5, 1)               # 窗口坐标：锦旗挂在旅客身后那面墙上（Day 1 起一直挂着）
FISH_LOOK = ((64, 96, 200), (70, 112, 214))   # 排队区里的蓝色大肥鱼：(衣服色, 头发色)
QUEUE_SPOTS = []                  # 排队区里每个小人的位置（静态背景画的时候记下来）
QUEUE_LOOKS = []                  # 同上，每个小人的 (衣服色, 帽子色)
GUARDS = [(372, 98), (384, 72)]
GLORY = (392, 13, "荣耀归于 ANTHROTZKA")
GLORY_EN = "GLORY TO ANTHROTZKA"


def new_day(banner=None, ant=None, phones=None):
    """换天：还在路上的人直接算排进了退款队伍；股价从昨天收盘开始；排队区亮起的手机至少 phones 块。"""
    WORLD["queue"] += [look for look, _, _ in WORLD["pending"]]
    WORLD["pending"] = []
    WORLD["banner"] = banner
    if ant is not None and WORLD["ant"] is None:
        WORLD["ant"], WORLD["hist"] = ant, [ant]
    WORLD["open"] = WORLD["ant"]
    if phones is not None:
        WORLD["phones"] = max(WORLD["phones"], phones)


def phone_order():
    """手机按打乱后的固定顺序一块块亮起来，免得全挤在队头。"""
    static_layer()
    order = list(QUEUE_SPOTS)
    random.Random(11).shuffle(order)
    return order


def fish_order():
    """鱼灾：排队的人按打乱后的固定顺序一个个变成大肥鱼；变了就一直是鱼（Day 3 起）。"""
    static_layer()
    order = list(QUEUE_SPOTS)
    random.Random(5).shuffle(order)
    return order


def ban_cell(i):
    x0, y0 = BANLIST[0] + 4, BANLIST[1] + 18
    cw, ch = BAN_CELL
    r, c = divmod(i, BAN_COLS)
    return (x0 + c * (cw + 2), y0 + r * (ch + 2), x0 + c * (cw + 2) + cw - 1, y0 + r * (ch + 2) + ch - 1)


def refund_spot(i):
    r, k = divmod(i, 14)
    if r == 0:
        return (530 - 8 * k, 97)
    if r == 1:
        return (426 + 8 * k, 87)
    return (530 - 8 * (k % 14), 77)


def wrap_line(text, width=176, size=12):
    """对白框放不下就折行：尽量在标点后断开。"""
    out, cur = [], text
    while tw(cur, size) > width:
        n = len(cur)
        while n > 1 and tw(cur[:n], size) > width:
            n -= 1
        cut = max((i + 1 for i, ch in enumerate(cur[:n]) if ch in "，。！？、；：… ,"), default=n)
        if cut < n * 0.45:
            cut = n
        out.append(cur[:cut])
        cur = cur[cut:].lstrip()
    return out + [cur]


def read_time(*texts, cps=6.0):
    """观众读完这些字要几秒：汉字按每秒 6 个，字母数字按 3 个算 1 个汉字。"""
    import re
    n = 0.0
    for s in texts:
        n += len(re.findall(r"[\u4e00-\u9fff]", s))
        n += len(re.sub(r"[\u4e00-\u9fff\s…，。！？、：；「」（）·|]", "", s)) / 3
    return n / cps


def center(box):
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)


# ———————————————————— 静态背景 ————————————————————

def tiny_person(d, x, y, coat, hat=None, step=0, skin=(198, 152, 120), back=False):
    """(x, y) 为脚底中心。"""
    d.line([x - 3, y + 1, x + 3, y + 1], fill=GROUND_D)
    d.rectangle([x - 2, y - 3, x - 1, y - (1 if step else 0)], fill=OUTLINE)
    d.rectangle([x + 1, y - 3, x + 2, y - (0 if step else 1)], fill=OUTLINE)
    d.rectangle([x - 2, y - 8, x + 2, y - 4], fill=coat)
    d.rectangle([x - 1, y - 11, x + 1, y - 9], fill=hat if back and hat else skin)
    if hat:
        d.rectangle([x - 1, y - 11, x + 1, y - 11], fill=hat)


def guard_tiny(d, x, y):
    tiny_person(d, x, y, (70, 78, 60), hat=(40, 46, 36))
    d.line([x + 3, y - 10, x + 3, y - 3], fill=INK)


def banner(d, x, y, s, size=10, fg=(214, 196, 170)):
    w = tw(s, size) + 10
    d.rectangle([x, y, x + w, y + 15], fill=BANNER)
    d.rectangle([x, y, x + w, y], fill=(140, 58, 50))
    txt(d, (x + 5, y + 3), s, size, fg)


COATS = [(74, 70, 60), (90, 72, 60), (60, 64, 72), (98, 92, 80), (70, 56, 52), (84, 84, 76), (110, 96, 74)]


def draw_exterior(img, clean=False, lang="zh"):
    """clean=True：画一张没有人、没有口号牌 / 徽章 / 牌子的外景（彩蛋里公司崩盘时，这些东西要单独动起来）。
    lang="en"：横幅、路牌、退款窗口换成英文（网页游戏英文版用）。"""
    en = lang == "en"
    d = draw(img)
    rng = random.Random(3)
    d.rectangle([0, 0, W - 1, 123], fill=GROUND)
    for _ in range(900):
        d.point((rng.randrange(W), rng.randrange(42, 124)), fill=rng.choice([GROUND_D, GROUND_D, GROUND_L]))
    d.rectangle([0, 4, W - 1, 40], fill=WALL)
    d.rectangle([0, 4, W - 1, 6], fill=WALL_L)
    d.rectangle([0, 38, W - 1, 40], fill=WALL_D)
    for x in range(12, W, 26):
        d.line([x, 7, x, 37], fill=WALL_D)
    d.rectangle([0, 41, W - 1, 42], fill=GROUND_D)
    if not clean:
        banner(d, GLORY[0], GLORY[1], GLORY_EN if en else GLORY[2])
    banner(d, BANNER1_X, 13, "HELPFUL · HONEST · HARMLESS")
    if not clean:
        _emblem(d, 318, 9)
    d.rectangle([362, 100, W - 1, 123], fill=ROAD)
    for x in range(370, W, 14):
        d.line([x, 111, x + 6, 111], fill=ROAD_L)
    if not clean:
        _sign(d, 0, 0, lang)
    for lx in (598, 624):
        d.line([lx, 30, lx, 96], fill=WALL_D, width=2)
    d.line([598, 60, 624, 90], fill=WALL_D)
    d.line([624, 60, 598, 90], fill=WALL_D)
    d.rectangle([590, 14, 632, 17], fill=INK)
    d.rectangle([592, 18, 630, 32], fill=WALL_L)
    d.rectangle([596, 22, 626, 26], fill=(40, 38, 36))
    tiny_person(d, 611, 22, (70, 78, 60), hat=(40, 46, 36))
    # 退款窗口：卷帘门常年拉着
    x0, y0, x1, y1 = KIOSK
    d.rectangle([x0 + 2, y0 + 2, x1 + 2, y1 + 1], fill=GROUND_D)
    d.rectangle([x0, y0, x1, y1], fill=WALL_L)
    d.rectangle([x0 - 4, y0 - 4, x1 + 4, y0], fill=WALL_D)
    d.rectangle([x0 - 4, y0 - 4, x1 + 4, y0 - 4], fill=OUTLINE)
    d.rectangle([x0 + 1, y0 - 15, x1 - 1, y0 - 5], fill=(196, 184, 160))
    d.rectangle([x0 + 1, y0 - 15, x1 - 1, y0 - 5], outline=OUTLINE)
    txt(d, ((x0 + x1) // 2, y0 - 14), "REFUNDS" if en else "退款窗口", 10, TEXT, anchor="ma")
    d.rectangle([x0 + 6, y0 + 7, x1 - 6, y0 + 30], fill=METAL)
    for yy in range(y0 + 9, y0 + 30, 3):
        d.line([x0 + 6, yy, x1 - 6, yy], fill=METAL_D)
    d.rectangle([x0 + 7, y0 + 13, x1 - 7, y0 + 23], fill=RED_D)
    txt(d, ((x0 + x1) // 2, y0 + 14), "CLOSED" if en else "暂停服务", 8, WHITE, anchor="ma")
    d.rectangle([x0, y0 + 31, x1, y0 + 33], fill=COUNTER_D)
    d.line([360, 43, 360, 96], fill=METAL_D)
    d.line([361, 43, 361, 96], fill=METAL_L)
    for y in range(46, 96, 8):
        d.line([358, y, 363, y], fill=METAL_D)
    d.rectangle([358, 96, 363, 99], fill=INK)
    for i, y in enumerate(range(100, 122, 3)):
        d.rectangle([360, y, 361, y + 2], fill=RED if i % 2 == 0 else FLAG_W)
    d.rectangle([315, 82, 355, 86], fill=WALL_D)
    d.rectangle([318, 87, 352, 116], fill=(120, 116, 106))
    d.rectangle([318, 113, 352, 116], fill=(96, 92, 84))
    d.rectangle([322, 92, 334, 102], fill=(176, 160, 110))
    d.rectangle([339, 92, 348, 112], fill=(84, 80, 74))
    if not clean:
        for gx, gy in GUARDS:
            guard_tiny(d, gx, gy)
    for y, x0, x1 in ((58, 16, 296), (74, 16, 272), (90, 40, 296), (106, 16, 296)):
        d.line([x0, y, x1, y], fill=METAL_L)
        d.line([x0, y + 1, x1, y + 1], fill=METAL_D)
        for px in range(x0, x1 + 1, 20):
            d.line([px, y - 3, px, y + 1], fill=METAL_D)
    if clean:
        return
    QUEUE_SPOTS.clear()
    QUEUE_LOOKS.clear()
    for lane_y in (70, 86, 102):
        x = 26
        while x < (284 if lane_y == 102 else 288):
            if rng.random() < 0.72:
                px, py = x + rng.randint(-1, 1), lane_y + rng.randint(-1, 1)
                look = (rng.choice(COATS), rng.choice([None, None, HAIR, (90, 40, 36)]))
                tiny_person(d, px, py, *look)
                QUEUE_SPOTS.append((px, py))
                QUEUE_LOOKS.append(look)
            x += rng.randint(9, 13)


def _emblem(d, x, y):
    d.ellipse([x, y, x + 26, y + 26], fill=WALL_D)
    d.ellipse([x + 2, y + 2, x + 24, y + 24], fill=(70, 50, 44))
    spark(d, x + 13, y + 13, CLAUDE)


def _sign(d, ox, oy, lang="zh"):
    """「仅限支持地区」的牌子；(ox, oy) 是相对原位置的偏移。英文版牌子宽一点（同原作 SUPPORTED ONLY）。"""
    en = lang == "en"
    sx0, sx1 = (422, 518) if en else (428, 512)
    for px in (440, 500):
        d.rectangle([px + ox, 62 + oy, px + 1 + ox, 76 + oy], fill=OUTLINE)
    d.rectangle([sx0 + ox, 50 + oy, sx1 + ox, 64 + oy], fill=(196, 184, 160))
    d.rectangle([sx0 + ox, 64 + oy, sx1 + ox, 65 + oy], fill=OUTLINE)
    txt(d, (470 + ox, 52 + oy), "SUPPORTED ONLY" if en else "仅限支持地区", 10, TEXT, anchor="ma")


@lru_cache(maxsize=2)
def clean_exterior(lang="zh"):
    img = Image.new("RGB", (W, H), INK)
    draw_exterior(img, clean=True, lang=lang)
    return img.crop((0, 0, W, 124))


@lru_cache(maxsize=2)
def fall_sprites(lang="zh"):
    """会掉下来的三样东西，各画在透明底上：口号牌、徽章、牌子。返回 {名字: (图, 原位置左上角)}。"""
    out = {}
    glory = GLORY_EN if lang == "en" else GLORY[2]
    w = tw(glory, 10) + 10
    im = Image.new("RGBA", (w + 1, 16), (0, 0, 0, 0))
    banner(draw(im), 0, 0, glory)
    out["glory"] = (im, (GLORY[0], GLORY[1]))
    im = Image.new("RGBA", (27, 27), (0, 0, 0, 0))
    _emblem(draw(im), 0, 0)
    out["emblem"] = (im, (318, 9))
    if lang == "en":
        im = Image.new("RGBA", (102, 30), (0, 0, 0, 0))
        _sign(draw(im), -420, -48, lang)
        out["sign"] = (im, (420, 48))
    else:
        im = Image.new("RGBA", (90, 30), (0, 0, 0, 0))
        _sign(draw(im), -426, -48)
        out["sign"] = (im, (426, 48))
    return out


def draw_booth_static(img):
    d = draw(img)
    d.rectangle([0, 124, W - 1, 127], fill=INK)
    d.rectangle([0, 128, 218, H - 1], fill=BOOTH_WALL)
    d.rectangle([WIN[0] - 2, WIN[1] - 2, WIN[2] + 2, WIN[3] + 2], fill=FRAME_D)
    d.rectangle([0, 262, 218, 266], fill=COUNTER_L)
    d.rectangle([0, 267, 218, 281], fill=COUNTER)
    d.rectangle([0, 282, 218, 283], fill=COUNTER_D)
    d.rectangle([0, 284, 218, H - 1], fill=BOOTH_LOW)
    for y in (300, 320, 340):
        d.line([0, y, 218, y], fill=(38, 35, 32))
    d.rectangle([216, 128, 219, H - 1], fill=INK)


def draw_desk_static(img, lang="zh"):
    d = draw(img)
    rng = random.Random(5)
    d.rectangle([220, 128, W - 1, H - 1], fill=DESK)
    y = 133
    while y < H:
        x = 220
        while x < W:
            seglen = rng.randint(20, 90)
            if rng.random() < 0.7:
                d.line([x, y, min(W - 1, x + seglen), y], fill=DESK_D)
            x += seglen + rng.randint(4, 30)
        y += rng.randint(5, 10)
    d.rectangle([220, 128, W - 1, 131], fill=DESK_L)
    d.rectangle([PRINT_X - 4, 128, PRINT_X + 132, 130], fill=INK)
    # 规则书（Claude 宪法）
    bx, by = 500, 306
    d.rectangle([bx + 2, by + 2, bx + 58, H - 1], fill=DESK_D)
    d.rectangle([bx, by, bx + 56, H - 1], fill=BOOK)
    d.rectangle([bx, by, bx + 4, H - 1], fill=(70, 48, 38))
    d.rectangle([bx + 7, by + 3, bx + 53, H - 1], outline=BOOK_L)
    txt(d, (bx + 30, by + 8), "CLAUDE" if lang == "en" else "宪法", 12, GOLD, anchor="ma")
    txt(d, (bx + 30, by + 24), "RULES" if lang == "en" else "RULEBOOK", 8, BOOK_L, anchor="ma")
    spark(d, bx + 30, by + 42, GOLD, big=False)


@lru_cache(maxsize=2)
def static_layer(lang="zh"):
    img = Image.new("RGB", (W, H), INK)
    draw_exterior(img, lang=lang)
    draw_booth_static(img)
    draw_desk_static(img, lang)
    return img


@lru_cache(maxsize=2)
def window_bg():
    im = Image.new("RGB", (WIN_W, WIN_H), WIN_WALL)
    d = draw(im)
    d.rectangle([0, 0, WIN_W - 1, 5], fill=WALL_L)
    for x in range(6, WIN_W, 22):
        d.line([x, 6, x, 70], fill=WALL_D)
    d.rectangle([0, 70, WIN_W - 1, 73], fill=WALL_D)
    d.rectangle([0, 74, WIN_W - 1, WIN_H - 1], fill=WIN_GROUND)
    d.line([0, 96, WIN_W - 1, 96], fill=METAL_L)
    d.line([0, 97, WIN_W - 1, 97], fill=METAL_D)
    for x in range(4, WIN_W, 30):
        d.line([x, 90, x, 97], fill=METAL_D)
    return im


@lru_cache(maxsize=2)
def glass():
    g = Image.new("RGBA", (WIN_W, WIN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    for off, a in ((150, 26), (160, 18), (166, 26)):
        d.line([off, 0, off - 40, WIN_H], fill=(255, 255, 255, a), width=3)
    d.rectangle([0, 0, WIN_W - 1, 1], fill=(0, 0, 0, 80))
    return g


# ———————————————————— X 光 ————————————————————

CAT_ICON = [
    "X.........X",
    "XX.......XX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XX.XXXXX.XX",
    "XXXXXXXXXXX",
    "XXXX.X.XXXX",
    ".XXXXXXXXX.",
    "..XXXXXXX..",
]
KEYS_ICON = [
    "XXXXXXXXXXXXXXX",
    "X.X.X.X.X.X.X.X",
    "XXXXXXXXXXXXXXX",
    "XX.X.X.X.X.X.XX",
    "XXXXXXXXXXXXXXX",
    "XXX.........XXX",
    "XXXXXXXXXXXXXXX",
]
CHIP_ICON = [
    "..X.X.X..",
    ".XXXXXXX.",
    "XX.....XX",
    ".X.X.X.X.",
    "XX.....XX",
    ".X.XXX.X.",
    "XX.....XX",
    ".XXXXXXX.",
    "..X.X.X..",
]
RECEIPT_ICON = [
    "XXXXXXXX",
    "X......X",
    "X.XXXX.X",
    "X......X",
    "X.XXX..X",
    "X......X",
    "X.XXXX.X",
    "X......X",
    "X.X.X.XX",
    "XX.X.X.X",
]
BOX_ICON = [
    "XXXXXXXXXXXXXXX",
    "X.............X",
    "X.XX.XX.XX.XX.X",
    "X.............X",
    "X.XX.XX.XX.XX.X",
    "X.............X",
    "X.XX.XX.XX.XX.X",
    "X.............X",
    "XXXXXXXXXXXXXXX",
]
PROC_ICON = [                     # 一个程序窗口：后台进程
    "XXXXXXXXXXXXX",
    "XXXXXXXXXX.X.",
    "X...........X",
    "X.XXX..XXXX.X",
    "X...........X",
    "X.XXXX..XXX.X",
    "X...........X",
    "X.XX..XXXXX.X",
    "XXXXXXXXXXXXX",
]
ICONS = {"box": BOX_ICON, "cat": CAT_ICON, "keys": KEYS_ICON, "chip": CHIP_ICON, "receipt": RECEIPT_ICON,
         "proc": PROC_ICON}


def xray_view(spr, ex, lt, items, lit):
    win = Image.new("RGB", (WIN_W, WIN_H), XRAY_BG)
    d = draw(win)
    for x in range(0, WIN_W, 12):
        d.line([x, 0, x, WIN_H], fill=(24, 50, 52))
    for y in range(0, WIN_H, 12):
        d.line([0, y, WIN_W, y], fill=(24, 50, 52))
    if spr is not None:
        ox = ex - spr.width // 2
        win.paste(Image.new("RGB", spr.size, XRAY_FG), (ox, 0), spr.getchannel("A"))
        d.ellipse([ex - 22, 20, ex + 22, 72], outline=XRAY_L)
        d.ellipse([ex - 12, 44, ex - 4, 52], outline=XRAY_L)
        d.ellipse([ex + 4, 44, ex + 12, 52], outline=XRAY_L)
        d.line([ex, 76, ex, WIN_H], fill=XRAY_L, width=2)
        for k, y in enumerate(range(98, WIN_H, 9)):
            w = 30 - k * 2
            d.arc([ex - w, y - 4, ex + w, y + 10], 200, 340, fill=XRAY_L)
        for i, (icon, (ix, iy), label) in enumerate(items):
            col = RED_L if lit[i] else XRAY_L
            pat = ICONS[icon]
            pw, ph = len(pat[0]) * 2, len(pat) * 2
            pattern(d, pat, ex + ix - pw // 2, iy - ph // 2, {"X": col}, 2)
            if lit[i]:
                lines = list(label) if isinstance(label, (list, tuple)) else [label]
                lw = max(tw(s, 8) for s in lines) + 6
                lx = max(2, min(WIN_W - lw - 2, ex + ix - lw // 2))
                ly1 = iy - ph // 2 - 4
                ly0 = ly1 - 10 * len(lines)
                d.rectangle([lx, ly0, lx + lw, ly1], fill=INK)
                for k, s in enumerate(lines):
                    txt(d, (lx + 3, ly0 + 2 + 10 * k), s, 8, WHITE if k == 0 and len(lines) > 1 else RED_L)
    scan = round(seg(lt, 0, 0.6) * WIN_H)
    if scan < WIN_H:
        d.rectangle([0, scan, WIN_W, WIN_H], fill=XRAY_BG)
        d.line([0, scan, WIN_W, scan], fill=XRAY_L, width=2)
    txt(d, (4, 3), "X-RAY · 后台进程扫描", 8, XRAY_L)
    return win


# ———————————————————— 证件状态 ————————————————————

class DocState:
    def __init__(self, doc, t0, start, on_counter=True):
        self.doc, self.t0, self.start, self.on_counter = doc, t0, start, on_counter
        self.slot = start
        self.moves = []        # (kind, t0, t1, dest)
        self.t_gone = None
        self.marks = []        # (t, kind, rel)
        self.grow = None       # 打印机吐出来的证件：t0 之后 grow 秒内逐行出现

    def at(self, t, cursor_fn):
        if t < self.t0 or (self.t_gone is not None and t >= self.t_gone):
            return None
        small, pos = self.on_counter, self.start
        for kind, t0, t1, dest in self.moves:
            if t < t0:
                break
            if t < t1:
                if kind == "drag":
                    cx, cy = cursor_fn(t)
                    if small and cx < 224:
                        return "small", (cx - 8, cy - 5)
                    g = self.doc.grab
                    return "big", (cx - g[0], cy - g[1])
                return ("small" if small else "big"), lerp2(pos, dest, smooth(seg(t, t0, t1)))
            pos, small = dest, kind == "return"
        return ("small" if small else "big"), pos

    def order(self, t):
        k = self.t0
        for _, t0, _, _ in self.moves:
            if t0 <= t:
                k = t0
        return k

    def field_box(self, name, t, cursor_fn):
        st = self.at(t, cursor_fn)
        x0, y0, x1, y1 = self.doc.field(name)
        x, y = st[1] if st else self.slot
        return (x + x0, y + y0, x + x1, y + y1)


def default_slot(doc, has_account):
    if isinstance(doc, (Passport, CrayonPassport, PromptPaper)):
        return SLOT_PASSPORT
    if isinstance(doc, Card):
        if doc.title == "账户卡":
            return (236, 286)
        return (236, 176) if has_account else (236, 198)
    return (300, 200)


class Ctx:
    def __init__(self, img, t, case):
        self.img, self.t, self.case = img, t, case
        self.d = draw(img)
        self.win = self.wd = None

    def set(self, img):
        self.img = img
        self.d = draw(img)


# ———————————————————— 剧本构建器 + 渲染 ————————————————————

class Case:
    def __init__(self, tag, day, clock=(6, 0), voice=125, seed=0, fight=None):
        self.tag, self.day, self.clock, self.voice, self.seed = tag, day, clock, voice, seed
        self.t = 0.0
        self.person = None
        self.t_enter = self.t_leave = self.t_detain = None
        self.leave_dir, self.enter_mode = "left", "walk"
        self.exprs, self.talk, self.lines = [], [], []
        self.slip_t = self.sweat_t = None
        self.docs = []
        self.insp, self.sels, self.links, self.banners = [], [], [], []
        self.trays, self.presses, self.prints, self.xrays = [], [], [], []
        self.slams, self.shakes, self.tracks, self.cue_list = [], [], [], []
        self.locates = []
        self.lookups = []
        self.cursor = [(0.0, (430, 300), False)]
        self.cursor_modes, self.cursor_hidden = [], []
        self.speaker_t = self.detain_click = None
        self.fight = fight
        self.harmless = None
        self.amb = 1.0
        self.amb_dips = []      # (t0, t1, 增益)：环境声压低
        self.ext_hidden = False
        self.dur = None
        self._imgs = {}
        self.w_queue = list(WORLD["queue"])
        self.w_pending = list(WORLD["pending"])
        self.w_ant, self.w_hist, self.w_open = WORLD["ant"], list(WORLD["hist"]), WORLD["open"]
        self.w_banner = WORLD["banner"]
        self.ant_jumps = []         # (t, 倍数)
        self.board_notes = []       # (t0, t1, 文字, 颜色)：股价屏临时改显示
        self.denied = False
        self.refund_path = None
        self.kiosk_at = None        # 退款窗口拉开的时刻（苹果用户）
        self.w_phones = WORLD["phones"]
        self.w_fish = WORLD["fish"]
        self.w_jinqi = WORLD["jinqi"]
        self.jinqi_at = None        # 锦旗从旅客手里挂到墙上的时刻
        self.fish_adds = []         # (t, 用时, 目标数)：排队区又有几个人变成大肥鱼
        self.phone_adds = []        # (t, 块数)：排队区又亮起几块手机屏（在加仓 ANT）
        self.phones_all_at = None
        self.queue_bang = None      # 排队区头上冒“！”的时刻
        self.w_bans = list(WORLD["bans"])
        self.new_bans = []          # (t, (person, 名字, 原因))
        self.banlists = []          # [t0, t1, 高亮第几格]：翻开封号清单
        self.flies = []             # (t, person)：照片飞进封号清单
        self.swaps = []             # (t, person)：中途换立绘（比如摘下面具）
        self._last_line = None      # 上一句对白最早可以被下一句接上的时刻
        self.collapse_at = None     # 彩蛋：公司崩盘的时刻（上半屏的人跑光、牌子往下掉）

    # —— 基础 ——
    def cue(self, t, x, g=1.0):
        self.cue_list.append((t, x, g))

    def cues(self):
        return self.cue_list

    def wait(self, s):
        self.t += s
        return self

    def go(self, pos, at=None, drag=False):
        self.cursor.append((self.t if at is None else at, pos, drag))

    def click(self, pos, sound=True):
        self.go(pos)
        if sound:
            self.cue(self.t, au.click())

    def track(self, layer, fn, dur=None, at=None):
        t0 = self.t if at is None else at
        self.tracks.append((layer, t0, t0 + dur if dur else 1e9, fn))
        return len(self.tracks) - 1

    def end_track(self, i):
        layer, t0, _, fn = self.tracks[i]
        self.tracks[i] = (layer, t0, self.t, fn)

    def cursor_mode(self, mode, dur):
        self.cursor_modes.append((self.t, self.t + dur, mode))

    def hide_cursor(self, dur):
        self.cursor_hidden.append((self.t, self.t + dur))

    # —— 叫号、进场、说话 ——
    def call_next(self, line=True):
        self.t = max(self.t, 0.15)
        self.click(SPEAKER)
        self.speaker_t = self.t
        self.cue(self.t + 0.03, au.intercom())
        if line:
            self.lines.append((self.t + 0.05, "C", "下一位！"))
        self.t += 0.35
        return self

    def enter(self, person, instant=False):
        self.person = person
        self.t_enter = self.t
        self.enter_mode = "instant" if instant else "walk"
        if instant:
            self.t += 0.15
        else:
            for i in range(4):
                self.cue(self.t + 0.06 + i * 0.19, au.footstep(60 + i))
            self.t += 0.8
        return self

    def face(self, expr):
        self.exprs.append((self.t, expr))

    def swap(self, person):
        self.swaps.append((self.t, person))

    def person_at(self, t):
        p = self.person
        for ts, q in self.swaps:
            if ts <= t:
                p = q
        return p

    # —— 排队区的手机屏 ——
    def phones(self, n=1, at=None):
        self.phone_adds.append((self.t if at is None else at, n))

    def phones_all(self, at=None):
        self.phones_all_at = self.t if at is None else at

    # —— 锦旗：收下，挂墙上 ——
    def take_jinqi(self, dur=0.45):
        self.jinqi_at = self.t
        self.cue(self.t, au.paper(self.seed + 21))
        self.cue(self.t + dur, au.thud(), 0.7)
        self.t += dur

    def _jinqi_ext(self, ctx):
        """上半屏：岗亭柜台窗口底下也挂着一面小锦旗（和窗口里那面同时挂上）。"""
        t = ctx.t
        if not (self.w_jinqi or (self.jinqi_at is not None and t >= self.jinqi_at + 0.45)):
            return
        d = ctx.d
        red, gold, gold_d = (178, 28, 28), (240, 200, 90), (170, 120, 40)
        x0, y0 = 327, 93                                           # 整面在岗亭柜台窗口（322–334, 92–102）里，贴右上角
        d.line([x0, y0, x0 + 6, y0], fill=(120, 80, 40))           # 旗杆
        d.point((x0, y0), fill=gold)
        d.point((x0 + 6, y0), fill=gold)
        d.rectangle([x0 + 1, y0 + 1, x0 + 5, y0 + 6], fill=red)
        d.line([x0 + 2, y0 + 2, x0 + 2, y0 + 5], fill=gold)        # 「有求必应」：从窗口外看是反面，左右和窗口里那面对调
        d.line([x0 + 4, y0 + 3, x0 + 4, y0 + 5], fill=gold_d)      # 下款
        for fx in range(x0 + 1, x0 + 6, 2):                          # 流苏
            d.point((fx, y0 + 7), fill=gold)

    def _jinqi(self, win, t, ex, fly=False):
        """fly=False：画墙上挂着的；fly=True：画正从他手里飞上墙的。都画在人和保安前面。"""
        from .people import JINQI_HELD, draw_jinqi
        d = draw(win)
        hung = self.w_jinqi or (self.jinqi_at is not None and t >= self.jinqi_at + 0.45)
        if hung and not fly:
            dt = t - self.jinqi_at if self.jinqi_at is not None else 9
            sway = round(2 * math.sin(dt * 14) * max(0.0, 1 - dt / 0.9)) if dt < 1.4 else 0
            draw_jinqi(d, JINQI_WALL[0] + sway, JINQI_WALL[1])
        elif fly and not hung and self.jinqi_at is not None and t >= self.jinqi_at:
            hx = (ex if ex is not None else WIN_CX) - 90 + JINQI_HELD[0]
            u = ease_out(seg(t, self.jinqi_at, self.jinqi_at + 0.45))
            draw_jinqi(d, round(lerp(hx, JINQI_WALL[0], u)), round(lerp(JINQI_HELD[1], JINQI_WALL[1], u)))

    # —— 鱼灾：排队区的大肥鱼 ——
    def fish(self, total, dur=1.0, at=None):
        self.fish_adds.append((self.t if at is None else at, dur, total))

    def _fish_count(self, t):
        n = self.w_fish
        for ta, dur, total in sorted(self.fish_adds):
            if t < ta:
                break
            n = round(lerp(n, total, seg(t, ta, ta + dur)))
        return n

    def _deny_phone(self, t):
        if self.w_phones > 0 or self.phone_adds:
            self.phone_adds.append((t, 1))

    # —— §11 封号清单 ——
    def bans_at(self, t):
        return self.w_bans + [e for ta, e in self.new_bans if ta <= t]

    def ban(self, person, name, reason, show=False):
        """红章之后：这人的照片钉上封号清单。show=True 时把清单整页翻开给观众看。"""
        entry = (person, name, reason)
        if show:
            self.click(center(BAN_BTN))
            self.banlists.append([self.t, None, None, None])
            self.cue(self.t, au.paper(self.seed + 11))
            self.t += 0.45
            self.new_bans.append((self.t, entry))
            self.cue(self.t + 0.2, au.thud(), 0.9)
            self.shakes.append((self.t + 0.2, 2))
            self.t += 1.25
            self.banlists[-1][1] = self.t
            self.cue(self.t, au.paper(self.seed + 12))
            self.t += 0.15
        else:
            self.flies.append((self.t, person))
            self.new_bans.append((self.t + 0.45, entry))
            self.cue(self.t + 0.45, au.thud(), 0.6)
        return self

    def banlist_open(self, highlight=None, page=None):
        self.click(center(BAN_BTN))
        self.banlists.append([self.t, None, highlight, page])
        self.cue(self.t, au.paper(self.seed + 13))
        self.t += 0.4
        return self

    def banlist_page(self, page):
        """翻到清单的第 page 页（从 0 数）。"""
        lst = self.banlists[-1]
        if not isinstance(lst[3], list):
            lst[3] = [(lst[0], lst[3])]
        lst[3].append((self.t, page))
        self.cue(self.t, au.paper(self.seed + 15))
        return self

    def banlist_close(self):
        self.click(center(BAN_BTN))
        self.banlists[-1][1] = self.t
        self.cue(self.t, au.paper(self.seed + 14))
        self.t += 0.2
        return self

    def slip(self):
        self.slip_t = self.t

    def sweat(self):
        self.sweat_t = self.t

    def say(self, who, text, hold=None, voice=None):
        # 上一句还没读完，这一句就别急着出来：只在「对白接对白」时等，中间有动作（递证件、盖章）就不用等
        if self._last_line is not None:
            self.t = max(self.t, self._last_line)
        t0 = self.t
        for part in wrap_line(text):
            self.lines.append((t0, who, part))
            t0 += len(part) / 26 + 0.05
        dv = round(min(1.3, 0.25 + 0.065 * len(text)), 2)
        pitch = voice or (176 if who == "C" else self.voice)
        self.cue(self.t, au.mumble(dv, pitch, self.seed * 100 + len(self.lines)))
        if who == "E":
            self.talk.append((self.t, self.t + dv))
        # 下一句最早什么时候能出来：这一句打完、读完，再喘一口气（读速按中文字幕常用的每秒 9 个字）
        self._last_line = self.t + len(text) / 26 + read_time(text, cps=9) + 0.2
        self.t += hold if hold is not None else max(0.9, 0.4 + 0.085 * len(text))
        return self

    # —— 证件 ——
    def hand(self, *docs, heavy=False, slots=None):
        t0 = self.t
        self.cue(t0, au.paper(self.seed))
        has_acct = any(isinstance(dc, Card) and dc.title == "账户卡" for dc in docs)
        states = []
        for i, dc in enumerate(docs):
            ds = DocState(dc, t0, (48 + i * 24, 265))
            self.docs.append(ds)
            states.append(ds)
        self.t += 0.3
        for i, ds in enumerate(states):
            slot = slots[i] if slots and slots[i] else default_slot(ds.doc, has_acct)
            self.drag(ds, slot, heavy=heavy, from_counter=True)
        return states

    def place(self, doc, pos):
        """证件凭空出现在桌上（比如从护照里掉出来）。"""
        ds = DocState(doc, self.t, pos, on_counter=False)
        self.docs.append(ds)
        self.cue(self.t, au.paper(self.seed + 7))
        return ds

    def print_doc(self, doc, grow=0.8, pos=None):
        """打印机吐出一张证件（之后能拖、能检查）。"""
        ds = DocState(doc, self.t, pos or (PRINT_X, 131), on_counter=False)
        ds.grow = grow
        self.docs.append(ds)
        self.cue(self.t, au.printer(round(grow, 2)))
        self.t += grow
        return ds

    def locate(self, doc, grow=0.7):
        """§7 定位：点 GPS 按钮，打印机吐出定位结果。"""
        self.click(center(LOCATE_BTN))
        self.locates.append(self.t)
        self.cue(self.t, au.select())
        self.t += 0.15
        return self.print_doc(doc, grow)

    def lookup(self, doc, grow=0.7):
        """§8 §9 企查：点企查按钮，打印机吐出公司总部 / 股权穿透。"""
        self.click(center(LOOKUP_BTN))
        self.lookups.append(self.t)
        self.cue(self.t, au.select())
        self.t += 0.15
        return self.print_doc(doc, grow)

    def pay(self, lines, rows=(), grow=0.6, x=PRINT_X):
        """先收钱：打印机吐出收款小票 + 收银机声。"""
        from .docs import PrintStrip
        p = self.printout(PrintStrip(lines, list(rows)), grow=grow, x=x)
        self.cue(self.t - 0.05, au.kaching(), 1.0)
        return p

    def drag(self, ds, slot, heavy=False, from_counter=False, dur=None):
        g = ds.doc.grab
        if from_counter:
            grab_pt = (ds.start[0] + 8, ds.start[1] + 5)
        else:
            grab_pt = (ds.slot[0] + g[0], ds.slot[1] + g[1])
        self.click(grab_pt)
        dur = dur or (0.5 if heavy else 0.3)
        ds.moves.append(("drag", self.t, self.t + dur, slot))
        self.t += dur
        self.go((slot[0] + g[0], slot[1] + g[1]), drag=True)
        ds.slot = slot
        self.cue(self.t, au.thud() if heavy else au.paper(self.seed + len(ds.moves)))
        self.t += 0.45 if heavy else 0.06

    def discard(self, ds):
        """把纸条拖出桌面扔掉。"""
        self.drag(ds, (W + 10, ds.slot[1] + 20), dur=0.35)
        ds.t_gone = self.t

    def give_back(self):
        moved = False
        for k, ds in enumerate(self.docs):
            st = ds.at(self.t, self.cursor_at)
            if st and st[0] == "big" and ds.t_gone is None:
                y = st[1][1]
                ds.moves.append(("slide", self.t, self.t + 0.3, (214 - ds.doc.w, y)))
                ds.moves.append(("return", self.t + 0.3, self.t + 0.3, (48 + 24 * (k % 3), 265)))
                moved = True
        if moved:
            self.cue(self.t, au.paper(self.seed + 3))
            self.t += 0.3
        return self

    def primary(self):
        for ds in self.docs:
            if isinstance(ds.doc, (Passport, CrayonPassport, PromptPaper)):
                return ds
        return self.docs[0]

    def leave(self, direction="left"):
        if direction == "left" and self.denied:
            direction = "refund"
        if direction == "out":
            direction = "left"
        if direction == "refund":
            idx = len(self.w_queue) + len(self.w_pending)
            self.refund_path = [BOOTH_POS, (330, 121), (378, 121), refund_spot(idx)]
        if direction == "kiosk":
            self.refund_path = [BOOTH_POS, (330, 121), (400, 121), (556, 104)]
            self.kiosk_at = self.t + _path_len(self.refund_path) / (WALK * 2)
        self.t_leave, self.leave_dir = self.t, direction
        for ds in self.docs:
            if ds.t_gone is None:
                ds.t_gone = self.t + 0.15
        for i in range(3):
            self.cue(self.t + i * 0.22, au.footstep(64 + i))
        self.t += 0.65
        return self

    def detain(self):
        self.click(center(DETAIN_BTN))
        self.detain_click = self.t
        self.cue(self.t, au.detain_btn())
        self.t_detain = self.t + 0.2
        self.cue(self.t_detain, au.scuffle())
        for ds in self.docs:
            if ds.t_gone is None:
                ds.t_gone = self.t_detain + 1.0
        self.t += 1.9
        return self

    def detain_blocked(self, note=("拘留键已停用", "§10：AI 不得参与拘留决定"), dur=2.8):
        """11.12 之后：按拘留键，没有反应。"""
        self.click(center(DETAIN_BTN))
        self.detain_click = self.t
        self.cue(self.t, au.detain_btn())
        self.cue(self.t + 0.12, au.discrepancy())

        def fn(ctx, lt, note=note):
            if lt > dur or (lt > dur - 0.3 and int(lt * 12) % 2):
                return
            w = max(tw(s, 10) for s in note) + 12
            x0, y0 = 8, 262 - 4 - 14 * len(note)
            ctx.d.rectangle([x0, y0, x0 + w, y0 + 14 * len(note) + 3], fill=INK)
            ctx.d.rectangle([x0, y0, x0 + w, y0 + 14 * len(note) + 3], outline=RED)
            for i, s in enumerate(note):
                txt(ctx.d, (x0 + 6, y0 + 3 + 14 * i), s, 10, RED_L if i == 0 else WHITE)
        self.track("overlay", fn, dur=dur)
        self.t += 1.6
        return self

    # —— 检查模式 ——
    def inspect_on(self):
        self.click(center(INSPECT_BTN))
        self.insp.append([self.t, None])
        self.cue(self.t, au.inspect_on())
        self.t += 0.3

    def _select(self, fn, box, sound=True):
        self.click(center(box), sound=False)
        self.sels.append([self.t, None, fn])
        if sound:
            self.cue(self.t, au.select())
        self.t += 0.38
        return len(self.sels) - 1

    def select(self, ds, field):
        box = ds.field_box(field, self.t, self.cursor_at)
        return self._select(lambda t, ds=ds, f=field: ds.field_box(f, t, self.cursor_at), box)

    def select_box(self, box):
        return self._select(lambda t, b=box: b, box)

    def light(self, pairs):
        """一次性点亮很多栏位（结局用），并两两连线。"""
        idx = []
        for ds, f in pairs:
            idx.append(len(self.sels))
            self.sels.append([self.t, None, lambda t, ds=ds, f=f: ds.field_box(f, t, self.cursor_at)])
        for a, b in zip(idx, idx[1:]):
            self.links.append([self.t, None, a, b])
        self.cue(self.t, au.discrepancy())

    def discrepancy(self, title, sub, ask=True, hold=1.15, link=True):
        for b in self.banners:                     # 上一条还挂着的话，新的一出来就换掉
            if b[1] is not None and b[1] > self.t:
                b[1] = self.t
        hold = max(hold, 1.3)
        if link and len(self.sels) >= 2:
            n = len(self.sels)
            self.links.append([self.t, None, n - 2, n - 1])
        self.banners.append([self.t, None, title, sub, ask])
        self.cue(self.t + 0.03, au.discrepancy())
        self.t += hold
        if ask:
            self.click(center(ASK_BTN))
            self.t += 0.05
            self._close_inspect()
            self.t += 0.15
        return self

    def scan(self, targets, each=0.32):
        """鼠标在一堆栏位上来回扫，但什么都挑不出来。"""
        for ds, f in targets:
            self.t += each
            self.go(center(ds.field_box(f, self.t, self.cursor_at)))

    def inspect_off(self):
        self.click(center(INSPECT_BTN))
        self._close_inspect()
        self.t += 0.2

    def _close_inspect(self):
        for lst in (self.insp, self.sels, self.links):
            for item in lst:
                if item[1] is None:
                    item[1] = self.t
        for b in self.banners:                     # 横幅挂到观众读得完为止，检查模式关了也不撤
            if b[1] is None:
                b[1] = max(self.t, b[0] + read_time(b[2], b[3]) + 0.8)
        self.cue(self.t, au.inspect_off())

    # —— 盖章 ——
    def stamp(self, kind="deny", ds=None, hover=None, tray_open=False):
        ds = ds or self.primary()
        mx, my = MARK_XY[kind]
        x, y = ds.slot
        w, h = ds.doc.w, ds.doc.h
        if not (x <= MARK_XY["approve"][0] and x + w >= MARK_XY["deny"][0] + 58 and y <= my and y + h >= my + 34):
            self.drag(ds, (470, max(132, min(220 - (h - 34) // 2, H - 2 - h))))
        if not tray_open:
            self.trays.append([self.t, None])
            self.cue(self.t, au.tray())
            self.t += 0.32
        if hover:
            other, secs = hover
            self.go(STAMP_BTN[other])
            self.t += secs
            self.go(STAMP_BTN[other])
            self.t += 0.35
        self.click(STAMP_BTN[kind])
        self.t += 0.04
        self.presses.append((self.t, kind))
        if kind == "deny":
            self.denied = True
            self.ant_jumps.append((self.t + 0.05, 1.07))
            self._deny_phone(self.t + 0.05)
        ds.marks.append((self.t + 0.05, kind, (mx - ds.slot[0], my - ds.slot[1])))
        self.cue(self.t + 0.03, au.stamp(kind))
        self.shakes.append((self.t + 0.05, 3))
        self.t += 0.38
        self.trays[-1][1] = self.t
        self.cue(self.t, au.tray(True))
        self.t += 0.3
        return self

    def slam(self, kind="deny"):
        """快剪用：一个巨大的章直接拍在窗口上。"""
        self.slams.append((self.t, kind))
        if kind == "deny":
            self.denied = True
            self.ant_jumps.append((self.t, 1.07))
            self._deny_phone(self.t)
        self.cue(self.t, au.stamp(kind))
        self.shakes.append((self.t, 4))
        self.t += 0.45

    def ant_jump(self, at=None, factor=1.07):
        self.ant_jumps.append((self.t if at is None else at, factor))

    def board_note(self, text, col, at=None, dur=1e9):
        t0 = self.t if at is None else at
        self.board_notes.append((t0, t0 + dur, text, col))

    # —— 打印机、X 光 ——
    def printout(self, doc, grow=0.9, x=PRINT_X):
        p = [self.t, self.t + grow, doc, x, None]
        self.prints.append(p)
        self.cue(self.t, au.printer(round(grow, 2)))
        self.t += grow
        return p

    def xray_on(self, items=()):
        self.click(center(XRAY_BTN))
        self.xrays.append([self.t, None, list(items), []])
        self.cue(self.t, au.xray())
        self.t += 0.9

    def xray_select(self, i):
        x = self.xrays[-1]
        icon, (ix, iy), _ = x[2][i]
        pat = ICONS[icon]
        bw, bh = len(pat[0]) * 2, len(pat) * 2
        cx, cy = WIN[0] + WIN_CX + ix, WIN[1] + iy
        box = (cx - bw // 2 - 2, cy - bh // 2 - 2, cx + bw // 2 + 1, cy + bh // 2 + 1)
        x[3].append((self.t, i))
        return self.select_box(box)

    def xray_off(self):
        self.click(center(XRAY_BTN))
        self.xrays[-1][1] = self.t
        self.t += 0.2

    def finish(self, tail=0.15):
        self.dur = self.t + tail
        q = WORLD["queue"]
        q += [look for look, _, _ in self.w_pending]
        WORLD["pending"] = []
        look = self.person.walker if self.person is not None else None
        if self.leave_dir == "kiosk":
            pass                                     # 退到钱了，走人，不排队
        elif self.refund_path:
            done = (self.dur - self.t_leave) * WALK
            if done >= _path_len(self.refund_path):
                q.append(look)
            else:
                WORLD["pending"].append((look, self.refund_path, done))
        elif self.denied and self.t_detain is None and self.t_leave is None and look:
            q.append(look)
        if WORLD["ant"] is not None:
            for _, f in sorted(self.ant_jumps):
                WORLD["ant"] *= f
                WORLD["hist"].append(WORLD["ant"])
        WORLD["phones"] = self._phone_count(1e9)
        WORLD["fish"] = self._fish_count(1e9)
        WORLD["jinqi"] = self.w_jinqi or self.jinqi_at is not None
        WORLD["bans"] = self.w_bans + [e for _, e in self.new_bans]
        self.cursor.sort(key=lambda p: p[0])
        for lst in (self.insp, self.sels, self.links, self.banners, self.trays, self.xrays):
            for item in lst:
                if item[1] is None:
                    item[1] = self.dur + 1
        return self

    # —— 时间轴查询 ——
    def cursor_at(self, t):
        pts = self.cursor
        if t <= pts[0][0]:
            return pts[0][1]
        for (ta, pa, _), (tb, pb, drag) in zip(pts, pts[1:]):
            if ta <= t < tb:
                if drag:
                    return lerp2(pa, pb, smooth(seg(t, ta, tb)))
                dist = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
                travel = min(tb - ta, max(0.16, min(0.42, dist / 900)))
                return lerp2(pa, pb, smooth(seg(t, tb - travel, tb)))
        return pts[-1][1]

    def expr_at(self, t):
        e = self.person.expr
        for te, ex in self.exprs:
            if te <= t:
                e = ex
        if e not in ("shock",) and any(a <= t < b for a, b in self.talk) and int(t * 8) % 2 == 0:
            e = "talk"
        return e

    def entrant_x(self, t):
        if self.person is None or self.t_enter is None or t < self.t_enter:
            return None
        x = WIN_CX
        if self.enter_mode == "walk":
            x = round(lerp(-130, WIN_CX, ease_out(seg(t, self.t_enter, self.t_enter + 0.8)))) // 2 * 2
        if self.t_detain is not None and t >= self.t_detain + 0.8:
            u = seg(t, self.t_detain + 0.8, self.t_detain + 1.5)
            return None if u >= 1 else round(lerp(WIN_CX, -160, u * u))
        if self.t_leave is not None and t >= self.t_leave:
            u = seg(t, self.t_leave, self.t_leave + 0.65)
            if u >= 1:
                return None
            return round(lerp(WIN_CX, 360 if self.leave_dir == "right" else -160, u * u)) // 2 * 2
        return x

    # ———————————————————— 渲染 ————————————————————

    def frame(self, t):
        ctx = Ctx(static_layer().copy(), t, self)
        if self.collapse_at is not None and t >= self.collapse_at:
            ctx.img.paste(clean_exterior(), (0, 0))
        self._board(ctx)
        self._jinqi_ext(ctx)
        self._phones(ctx)
        if not self.ext_hidden:
            self._refund_queue(ctx)
            self._walker(ctx)
            self._collapse(ctx)
            self._fight(ctx)
            self._harmless(ctx)
        self._run(ctx, "ext")
        self._window(ctx)
        self._booth_lower(ctx)
        self._docs(ctx)
        self._run(ctx, "desk")
        self._prints(ctx)
        self._tray(ctx)
        self._banlist(ctx)
        self._buttons(ctx)
        self._inspect(ctx)
        self._run(ctx, "overlay")
        self._cursor(ctx)
        self._shake(ctx)
        self._run(ctx, "post")
        return ctx.img

    def _run(self, ctx, layer):
        for ly, t0, t1, fn in self.tracks:
            if ly == layer and t0 <= ctx.t < t1:
                r = fn(ctx, ctx.t - t0)
                if isinstance(r, Image.Image):
                    ctx.set(r)

    def _walker(self, ctx):
        t, d = ctx.t, ctx.d
        if self.person is None or self.t_enter is None or t < self.t_enter:
            return
        if self.t_detain is not None and t >= self.t_detain + 0.9:
            return
        coat, top = self.person.walker
        moving = False
        if self.t_leave is not None and t >= self.t_leave:
            u = t - self.t_leave
            if self.leave_dir in ("refund", "kiosk"):
                v = WALK * (2 if self.leave_dir == "kiosk" else 1)
                pos = _along(self.refund_path, u * v)
                moving = u * v < _path_len(self.refund_path)
            else:
                path = [BOOTH_POS, (352, 112), (720, 112)] if self.leave_dir == "right" else \
                    [BOOTH_POS, (296, 122), (-20, 122)]
                pos = _along(path, u * 70)
                moving = True
        else:
            u = seg(t, self.t_enter, self.t_enter + 0.8) if self.enter_mode == "walk" else 1
            pos = lerp2(QUEUE_FRONT, BOOTH_POS, u)
            moving = 0 < u < 1
        step = int(t * 8) % 2 if moving else 0
        tiny_person(d, *pos, coat, hat=top, step=step)
        if hasattr(self.person, "people"):
            for i, p in enumerate(self.person.people[1:4]):
                c, h = p.walker
                tiny_person(d, pos[0] - 6 - i * 5, pos[1] - 3 + (i % 2) * 4, c, hat=h, step=step)

    def _refund_queue(self, ctx):
        d, t = ctx.d, ctx.t
        if self.collapse_at is not None and t >= self.collapse_at:
            lt = t - self.collapse_at
            rng = random.Random(23)
            for i, (coat, top) in enumerate(self.w_queue):
                x, y = refund_spot(i)
                run = max(0.0, lt - 0.25 - rng.random() * 0.6)
                rx = round(x + run * (80 + rng.random() * 50))
                if rx < W + 8:
                    tiny_person(d, rx, y, coat, hat=top, step=int(t * 10) % 2 if run > 0 else 0)
            return
        for i, (coat, top) in enumerate(self.w_queue):
            tiny_person(d, *refund_spot(i), coat, hat=top)
        for (coat, top), path, d0 in self.w_pending:
            dist = d0 + t * WALK
            moving = dist < _path_len(path)
            tiny_person(d, *_along(path, dist), coat, hat=top, step=int(t * 8) % 2 if moving else 0)
        if self.kiosk_at is not None and t >= self.kiosk_at:
            # 卷帘门往上卷：门上的「暂停服务」跟着门一起卷进上面的箱子，露出里面的店员
            x0, y0, x1, y1 = KIOSK
            cx = (x0 + x1) // 2
            u = min(1.0, (t - self.kiosk_at) / 0.45)
            shutter = static_layer().crop((x0 + 6, y0 + 7, x1 - 5, y0 + 31))
            d.rectangle([x0 + 6, y0 + 7, x1 - 6, y0 + 30], fill=(44, 40, 36))
            tiny_person(d, cx, y0 + 30, (60, 90, 70), hat=HAIR)
            k = round(u * 24)
            if k < 24:
                ctx.img.paste(shutter.crop((0, k, shutter.width, 24)), (x0 + 6, y0 + 7))
            if u >= 1:
                txt(d, (cx, y0 + 8), "退款", 8, (120, 230, 140), anchor="ma")
                if int(t * 4) % 2 == 0:
                    for i in range(len(self.w_queue)):
                        qx, qy = refund_spot(i)
                        txt(d, (qx, qy - 20), "!", 8, WHITE, anchor="ma")

    def _ant_state(self, t):
        price, hist, last = self.w_ant, list(self.w_hist), None
        for tj, f in sorted(self.ant_jumps):
            if tj > t:
                break
            price *= f
            hist.append(price)
            last = (tj, f)
        return price, hist, last

    def _board(self, ctx):
        """横条电子屏：ANT · 价格 · 涨跌 · 走势。"""
        d, t = ctx.d, ctx.t
        x0, y0, x1, y1 = BOARD
        d.rectangle([x0 - 2, y0 - 2, x1 + 2, y1 + 2], fill=OUTLINE)
        d.rectangle(BOARD, fill=(22, 22, 24))
        amber, green, dim = (232, 170, 60), (96, 226, 120), (40, 70, 48)
        txt(d, (x0 + 4, y0 + 3), "ANT", 10, amber)
        if self.w_ant is None:
            txt(d, ((x0 + 28 + x1) // 2, y0 + 3), "明日上市", 10, (150, 120, 70), anchor="ma")
            return
        note = next((n for n in self.board_notes if n[0] <= t < n[1]), None)
        if note:
            _, _, s, col = note
            txt(d, ((x0 + 28 + x1) // 2, y0 + 3), s, 10, col if int(t * 6) % 3 else WHITE, anchor="ma")
            return
        price, hist, last = self._ant_state(t)
        flash = last is not None and t - last[0] < 0.5 and int((t - last[0]) * 10) % 2 == 0
        down = last is not None and last[1] < 1 and t - last[0] < 3.0
        txt(d, (x0 + 28, y0 + 3), f"${price:,.2f}", 10, WHITE if flash else (RED_L if down else green))
        chg = (price / self.w_open - 1) * 100 if self.w_open else 0
        if down:
            txt(d, (x0 + 84, y0 + 4), f"▼{(1 - last[1]) * 100:.0f}%", 8, RED_L)
        else:
            txt(d, (x0 + 84, y0 + 4), f"▲{chg:.0f}%" if chg > 0.05 else "—0%", 8, green if chg > 0.05 else GREY)
        cx0, cy0, cx1, cy1 = x0 + 118, y0 + 3, x1 - 4, y1 - 3
        for gx in range(cx0, cx1, 4):
            d.point((gx, (cy0 + cy1) // 2), fill=dim)
        pts = hist[-16:]
        lo, hi = min(pts), max(pts)
        span = max(hi - lo, 1e-6)
        step = (cx1 - cx0) / 16
        prev = None
        for i, v in enumerate(pts):
            x = round(cx0 + i * step)
            y = round(cy1 - (v - lo) / span * (cy1 - cy0)) if len(pts) > 1 else (cy0 + cy1) // 2
            if prev:
                col = RED_L if y > prev[1] else green
                d.line([prev[0], prev[1], x, prev[1]], fill=col)
                d.line([x, prev[1], x, y], fill=col)
            prev = (x, y)
        if prev and int(t * 3) % 2 == 0:
            d.rectangle([prev[0] - 1, prev[1] - 1, prev[0] + 1, prev[1] + 1], fill=WHITE if flash else green)

    def _phone_count(self, t):
        order = phone_order()
        if self.phones_all_at is not None and t >= self.phones_all_at:
            return len(order)
        return min(len(order), self.w_phones + sum(n for ta, n in self.phone_adds if ta <= t))

    def _phones(self, ctx):
        """排队的人举着手机看 ANT：屏幕一块块亮起来；冒“！”时整条队伍一起。"""
        d, t = ctx.d, ctx.t
        order = phone_order()
        n = self._phone_count(t)
        fresh = sorted([ta for ta, _ in self.phone_adds if ta <= t] +
                       ([self.phones_all_at] if self.phones_all_at is not None and self.phones_all_at <= t else []))
        new_from = n
        if fresh and t - fresh[-1] < 0.4:
            new_from = self.w_phones + sum(k for ta, k in self.phone_adds if ta < fresh[-1])
            if self.phones_all_at is not None and fresh[-1] == self.phones_all_at:
                new_from = self.w_phones
        if self.collapse_at is not None and t >= self.collapse_at:
            # 公司崩盘：排队的人举着手机往左边狂奔
            lt = t - self.collapse_at
            rng = random.Random(21)
            looks = dict(zip(QUEUE_SPOTS, QUEUE_LOOKS))
            looks.update((sp, FISH_LOOK) for sp in fish_order()[:self._fish_count(t)])
            for i, (x, y) in enumerate(order):
                delay, v = 0.1 + rng.random() * 0.6, 80 + rng.random() * 60
                run = max(0.0, lt - delay)
                rx = round(x - run * v)
                if rx < -8:
                    continue
                coat, hat = looks.get((x, y), (COATS[0], None))
                tiny_person(d, rx, y, coat, hat=hat, step=int(t * 10) % 2 if run > 0 else 0)
                if i < n:
                    d.rectangle([rx + 2, y - 11, rx + 4, y - 8], fill=(96, 226, 120))
                if lt < 0.9 and int(lt * 6) % 2 == 0 and y - 18 > BOARD[3] + 2:
                    d.rectangle([rx, y - 18, rx + 1, y - 15], fill=WHITE)
                    d.rectangle([rx, y - 13, rx + 1, y - 13], fill=WHITE)
            return
        for x, y in fish_order()[:self._fish_count(t)]:
            tiny_person(d, x, y, *FISH_LOOK)          # 和原来那个人同一个位置，正好盖住
        for i, (x, y) in enumerate(order[:n]):
            d.rectangle([x + 2, y - 11, x + 4, y - 8], fill=WHITE if i >= new_from else (96, 226, 120))
        if self.queue_bang is not None and t >= self.queue_bang and int((t - self.queue_bang) * 4) % 2 == 0:
            for x, y in order:
                if y - 18 <= BOARD[3] + 2:           # 第一排头顶就是股价屏，不画
                    continue
                d.rectangle([x, y - 18, x + 1, y - 15], fill=WHITE)
                d.rectangle([x, y - 13, x + 1, y - 13], fill=WHITE)

    def _collapse(self, ctx):
        """彩蛋：安索兹卡崩盘。保安跑路，口号牌、徽章、牌子往下掉。"""
        if self.collapse_at is None or ctx.t < self.collapse_at:
            return
        lt, d, img = ctx.t - self.collapse_at, ctx.d, ctx.img
        g = 700
        for k, (gx, gy) in enumerate(GUARDS):
            run = max(0.0, lt - 0.35 - 0.2 * k)
            x = round(gx + run * 110)
            if x < W + 8:
                tiny_person(d, x, gy, (70, 78, 60), hat=(40, 46, 36), step=int(ctx.t * 10) % 2 if run else 0)
        sp = fall_sprites()
        # 口号牌：右头先松，晃下来，再整块砸地上
        im, (ox, oy) = sp["glory"]
        lx, ly = im.width / 2, im.height / 2

        def at(th):
            r = math.radians(th)
            return ox + lx * math.cos(r) - ly * math.sin(r), oy + lx * math.sin(r) + ly * math.cos(r)
        if lt < 0.6:
            th, (cx, cy) = 0, at(0)
        elif lt < 1.0:
            th = 35 * smooth(seg(lt, 0.6, 1.0))
            cx, cy = at(th)
        else:
            cx, cy0 = at(35)
            t_land = 1.0 + math.sqrt(2 * (106 - cy0) / g)
            u = min(lt, t_land) - 1.0
            cy = cy0 + 0.5 * g * u * u
            th = 35 + (4 - 35) * seg(lt, 1.0, t_land)
        _rot_paste(img, im, cx, cy, -th)
        # 徽章：掉下来，落地，一路滚出画面
        im, (ox, oy) = sp["emblem"]
        cx, cy, ang = ox + 13.5, oy + 13.5, 0.0
        if lt >= 1.5:
            t_land = 1.5 + math.sqrt(2 * (108 - cy) / g)
            if lt < t_land:
                cy += 0.5 * g * (lt - 1.5) ** 2
            else:
                dx = 130 * (lt - t_land)
                cx, cy, ang = cx + dx, 108, -math.degrees(dx / 13.5)
        if cx < W + 20:
            _rot_paste(img, im, cx, cy, ang)
        # 「仅限支持地区」：柱子一断，整块砸下来，歪在地上
        im, (ox, oy) = sp["sign"]
        u = max(0.0, lt - 2.1)
        drop = min(30.0, 0.5 * g * u * u)
        th = 9 * seg(lt, 2.1, 2.4)
        _rot_paste(img, im, ox + im.width / 2, oy + im.height / 2 + drop, -th)

    def _fight(self, ctx):
        if self.fight is None or ctx.t < self.fight:
            return
        d, t = ctx.d, ctx.t
        rng = random.Random(int(t * 10))
        for _ in range(9):
            x, y, r = 250 + rng.randint(0, 34), 88 + rng.randint(0, 18), rng.randint(5, 9)
            d.ellipse([x - r, y - r, x + r, y + r], fill=rng.choice([(150, 144, 132), (172, 166, 152), (128, 122, 112)]))
        for _ in range(4):
            x, y = 250 + rng.randint(0, 34), 88 + rng.randint(0, 18)
            d.line([x, y, x + rng.randint(-6, 6), y + rng.randint(-6, 6)], fill=OUTLINE, width=2)
        for _ in range(3):
            spark(d, 246 + rng.randint(0, 44), 80 + rng.randint(0, 24), (230, 210, 120), big=False)
        word = "甜！" if int(t * 2.5) % 2 else "咸！"
        bx = 236 if word == "甜！" else 286
        d.rectangle([bx, 64, bx + 24, 77], fill=WHITE)
        d.rectangle([bx, 64, bx + 24, 77], outline=INK)
        txt(d, (bx + 12, 66), word, 10, INK, anchor="ma")

    def _harmless(self, ctx):
        if not self.harmless:
            return
        t0, t1 = self.harmless
        if t0 <= ctx.t < t1 and int((ctx.t - t0) * 6) % 2 == 0:
            x = BANNER1_X + 5 + tw("HELPFUL · HONEST · ", 10)
            ctx.d.rectangle([x - 2, 14, x + tw("HARMLESS", 10) + 1, 27], fill=(200, 60, 50))
            txt(ctx.d, (x, 16), "HARMLESS", 10, WHITE)

    def _window(self, ctx):
        t = ctx.t
        win = window_bg().copy()
        ex = self.entrant_x(t)
        spr = None
        if ex is not None:
            sweat = min(6, int((t - self.sweat_t) / 0.35)) if self.sweat_t is not None and t >= self.sweat_t else None
            slip = self.slip_t is not None and t >= self.slip_t
            spr = self.person_at(t).sprite(self.expr_at(t), slip, sweat)
        xr = next((x for x in self.xrays if x[0] <= t < x[1]), None)
        if xr:
            lit = [any(ts <= t for ts, i in xr[3] if i == k) for k in range(len(xr[2]))]
            win = xray_view(spr, ex if ex is not None else WIN_CX, t - xr[0], xr[2], lit)
        else:
            if spr is not None:
                moving = self.enter_mode == "walk" and self.t_enter <= t < self.t_enter + 0.8
                bob = 1 if moving and int(t * 10) % 2 else 0
                win.paste(spr, (ex - spr.width // 2, bob), spr)
            if self.t_detain is not None and t >= self.t_detain and ex is not None:
                u = ease_out(seg(t, self.t_detain, self.t_detain + 0.35))
                for p, side in ((cast.GUARD, -1), (cast.GUARD2, 1)):
                    gs = p.sprite()
                    gx = round(lerp(WIN_CX + side * 230, ex + side * 70, u))
                    win.paste(gs, (gx - 90, 4), gs)
            if self.w_jinqi or self.jinqi_at is not None:     # 锦旗压在人和保安上面
                self._jinqi(win, t, ex)
            if self.jinqi_at is not None:
                self._jinqi(win, t, ex, fly=True)
        ctx.win, ctx.wd = win, draw(win)
        self._run(ctx, "win")
        for ts, kind in self.slams:
            if t >= ts and t < ts + 1.5:
                m = stamp_mark(kind, 2)
                win.paste(RED if kind == "deny" else GREEN, (WIN_CX - m.width // 2 + 10, 40), m)
        win = Image.alpha_composite(win.convert("RGBA"), glass()).convert("RGB")
        ctx.img.paste(win, (WIN[0], WIN[1]))

    def _booth_lower(self, ctx):
        t, d = ctx.t, ctx.d
        on = self.speaker_t is not None and self.speaker_t <= t < self.speaker_t + 0.5
        x0, y0 = 6, 290
        d.rectangle([x0, y0, x0 + 18, y0 + 16], fill=CLAUDE if on else METAL_D)
        d.rectangle([x0, y0, x0 + 18, y0 + 16], outline=METAL_L)
        for yy in range(y0 + 3, y0 + 15, 3):
            d.line([x0 + 3, yy, x0 + 15, yy], fill=INK)
        shown = [ln for ln in self.lines if ln[0] <= t][-3:]
        for i, (t0, who, s) in enumerate(shown):
            n = max(1, int((t - t0) * 26))
            y = 288 + i * 17
            w = tw(s, 12) + 8
            d.rectangle([30, y, 30 + w, y + 15], fill=(30, 28, 26))
            d.rectangle([30, y, 30 + w, y + 15], outline=(76, 70, 64))
            if who == "C":
                d.rectangle([30, y, 31, y + 15], fill=CLAUDE)
            txt(d, (35, y + 2), s[:n], 12, {"C": CLAUDE_L, "S": (150, 150, 150)}.get(who, WHITE))
        txt(d, (8, 347), _date(self.day), 10, GREY)
        h, m = self.clock
        m += int(t / 1.1)
        txt(d, (210, 346), f"{h + m // 60:02d}:{m % 60:02d}", 12, LED, anchor="ra")
        if self.day >= 2:
            lit = self.detain_click is not None and self.detain_click <= t < self.detain_click + 0.6
            d.rectangle(DETAIN_BTN, fill=RED if lit else RED_D)
            d.rectangle(DETAIN_BTN, outline=OUTLINE)
            txt(d, (center(DETAIN_BTN)[0], DETAIN_BTN[1] + 2), "拘留", 10, WHITE, anchor="ma")
            if self.day >= 4:
                # 11.12 新版使用政策：AI 不得参与拘留决定 → 封条
                x0, y0, x1, y1 = DETAIN_BTN
                d.polygon([(x0 - 3, y1 - 1), (x0 + 2, y1 + 3), (x1 + 3, y0 + 1), (x1 - 2, y0 - 3)], fill=(232, 224, 204))
                txt(d, (center(DETAIN_BTN)[0], y0 + 1), "封 §10", 8, RED_D, anchor="ma")

    def _docs(self, ctx):
        t = ctx.t
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = draw(layer)
        for ds in sorted(self.docs, key=lambda s: s.order(t)):
            st = ds.at(t, self.cursor_at)
            if st is None:
                continue
            kind, (x, y) = st
            if kind == "small":
                small_icon(ctx.d, *ds.doc.icon, x, y)
                continue
            if ds.grow and t < ds.t0 + ds.grow and not any(m[1] <= t for m in ds.moves):
                im = self._doc_img(ds.doc)
                L = max(1, round(im.height * seg(t, ds.t0, ds.t0 + ds.grow)))
                part = im.crop((0, 0, im.width, L))
                layer.paste(part, (x, y), part)
                continue
            ds.doc.draw(layer, ld, x, y)
            for tm, mk, (rx, ry) in ds.marks:
                if t >= tm:
                    layer.paste(RED if mk == "deny" else GREEN, (x + rx, y + ry), stamp_mark(mk))
        desk = layer.crop((220, 128, W, H))
        ctx.img.paste(desk, (220, 128), desk)

    def _doc_img(self, doc):
        if id(doc) not in self._imgs:
            self._imgs[id(doc)] = doc.image()
        return self._imgs[id(doc)]

    def _prints(self, ctx):
        for t0, t1, doc, x, gone in self.prints:
            if ctx.t < t0 or (gone is not None and ctx.t >= gone):
                continue
            im = self._doc_img(doc)
            L = max(1, round(im.height * seg(ctx.t, t0, t1)))
            part = im.crop((0, 0, im.width, L))
            ctx.img.paste(part, (x, 131), part)

    def _tray(self, ctx):
        t = ctx.t
        for t0, t1 in self.trays:
            if t0 <= t < t1 + 0.3:
                u = ease_out(seg(t, t0, t0 + 0.3)) * (1 - smooth(seg(t, t1, t1 + 0.25)))
                press = {k: 5 for tp, k in self.presses if tp <= t < tp + 0.22}
                _draw_tray(ctx.d, round(lerp(W + 4, TRAY_X, u)), press)

    def _banlist(self, ctx):
        t, img, d = ctx.t, ctx.img, ctx.d
        # 照片飞进桌上的清单文件夹
        for ta, person in self.flies:
            u = seg(t, ta, ta + 0.45)
            if ta <= t < ta + 0.45:
                ph = _photo(person)
                k = 1 - 0.5 * smooth(u)
                im = ph.resize((max(4, round(ph.width * k)), max(4, round(ph.height * k))), Image.NEAREST)
                x, y = lerp2((WIN[0] + WIN_CX - 20, 180), center(BAN_BTN), smooth(u))
                img.paste(im, (round(x) - im.width // 2, round(y) - im.height // 2))
        lst = next((b for b in self.banlists if b[0] <= t < (b[1] if b[1] is not None else 1e9)), None)
        if lst is None:
            return
        t0, _, hi, page = lst
        x0, y0, x1, y1 = BANLIST
        top = round(lerp(y1, y0, ease_out(seg(t, t0, t0 + 0.2))))
        d.rectangle([x0 + 3, top + 3, x1 + 3, y1 + 3], fill=DESK_D)
        d.rectangle([x0, top, x1, y1], fill=(214, 200, 184))
        d.rectangle([x0, top, x1, top + 14], fill=(120, 40, 36))
        if top > y0:
            return
        bans = self.bans_at(t)
        per = BAN_COLS * 2
        pages = max(1, (len(bans) + per - 1) // per)
        if isinstance(page, list):
            page = [pg for tp, pg in page if tp <= t][-1]
        if page is None:
            page = hi // per if hi is not None else pages - 1
        txt(d, (x0 + 6, y0 + 3), "§11 · 封号清单", 10, (246, 214, 110))
        txt(d, (x1 - 6, y0 + 4), f"封过号的不得再来 · 以前封的也算 · 第 {page + 1}/{pages} 页", 8,
            (226, 196, 170), anchor="ra")
        new_t = {id(e): ta for ta, e in self.new_bans}
        for k in range(per):
            i = page * per + k
            cx0, cy0, cx1, cy1 = ban_cell(k)
            if i >= len(bans):
                for xx in range(cx0 + 29, cx0 + 70, 3):
                    d.point((xx, cy0 + 4), fill=(170, 154, 136))
                    d.point((xx, cy0 + 54), fill=(170, 154, 136))
                for yy in range(cy0 + 4, cy0 + 55, 3):
                    d.point((cx0 + 29, yy), fill=(170, 154, 136))
                    d.point((cx0 + 69, yy), fill=(170, 154, 136))
                continue
            person, name, reason = bans[i]
            ta = new_t.get(id(bans[i]))
            drop = 0
            if ta is not None and t - ta < 0.2:
                drop = round(-24 * (1 - ease_out(seg(t, ta, ta + 0.2))))
            px, py = cx0 + 29, cy0 + 4 + drop
            d.rectangle([px - 1, py - 1, px + 40, py + 50], fill=OUTLINE)
            img.paste(_photo(person), (px, py))
            d.rectangle([px + 17, py - 3, px + 22, py + 1], fill=RED)          # 图钉
            txt(d, ((cx0 + cx1) // 2, cy0 + 60), name, 8, TEXT, anchor="ma")
            if hi == i and int((t - t0) * 5) % 2 == 0:
                d.rectangle([cx0, cy0, cx1, cy1], outline=RED, width=2)

    def _buttons(self, ctx):
        t = ctx.t
        if self.day >= 4:
            x0, y0, x1, y1 = BAN_BTN
            on = any(b[0] <= t < (b[1] if b[1] is not None else 1e9) for b in self.banlists)
            col = (150, 52, 46) if on else (112, 38, 34)
            d = ctx.d
            d.rectangle([x0 + 2, y0 + 2, x1 + 2, y1], fill=DESK_D)
            d.rectangle([x0, y0, x1, y1], fill=col)
            d.rectangle([x0 + 3, y0 + 3, x1 - 3, y1], outline=(170, 80, 70))
            txt(d, ((x0 + x1) // 2, y0 + 7), "封号", 10, GOLD, anchor="ma")
            txt(d, ((x0 + x1) // 2, y0 + 21), "清单", 8, (226, 196, 170), anchor="ma")
            n = len(self.bans_at(t))
            txt(d, ((x0 + x1) // 2, y0 + 36), f"×{n}", 8, WHITE if n else (170, 120, 110), anchor="ma")
        on = any(a <= t < b for a, b in self.insp)
        _button(ctx.d, INSPECT_BTN, "?", "检查", on)
        on = any(x[0] <= t < x[1] for x in self.xrays)
        _button(ctx.d, XRAY_BTN, "X", "X光", on)
        if self.day >= 3:
            on = any(a <= t < a + 0.5 for a in self.locates)
            _button(ctx.d, LOCATE_BTN, "GPS", "定位", on)
        if self.day >= 4:
            on = any(a <= t < a + 0.5 for a in self.lookups)
            _button(ctx.d, LOOKUP_BTN, "企", "企查", on)

    def _banner(self, d, t, title, sub, ask):
        x0, y0, x1, y1 = BANNER_BOX
        d.rectangle(BANNER_BOX, fill=INK)
        d.rectangle(BANNER_BOX, outline=RED)
        txt(d, (x0 + 8, y0 + 5), title, 12, RED_L)
        txt(d, (x0 + 8, y0 + 21), sub, 10, WHITE)
        if ask:
            hover = self.cursor_at(t)[0] > ASK_BTN[0] - 4
            d.rectangle(ASK_BTN, fill=RED if hover else RED_D)
            d.rectangle(ASK_BTN, outline=RED_L)
            txt(d, (center(ASK_BTN)[0], 145), "询问", 12, WHITE, anchor="ma")

    def _inspect(self, ctx):
        t = ctx.t
        if not any(a <= t < b for a, b in self.insp):
            for a, b, title, sub, ask in self.banners:      # 检查模式关了，横幅还挂一会儿
                if a <= t < b:
                    self._banner(ctx.d, t, title, sub, False)
            return
        img = ctx.img
        dark = darken(img.copy(), 0.55, (26, 10, 10))
        for ds in self.docs:
            st = ds.at(t, self.cursor_at)
            if st and st[0] == "big":
                x, y = st[1]
                box = (max(220, x), max(128, y), min(W, x + ds.doc.w), min(H, y + ds.doc.h))
                if box[2] > box[0] and box[3] > box[1]:
                    dark.paste(darken(img.crop(box), 0.2, (26, 10, 10)), box[:2])
        boxes = {}
        for i, (a, b, fn) in enumerate(self.sels):
            if a <= t < b:
                bx = tuple(int(v) for v in fn(t))
                boxes[i] = bx
                dark.paste(img.crop(bx), bx[:2])
        d = draw(dark)
        for a, b, i, j in self.links:
            if a <= t < b and i in boxes and j in boxes:
                p = edge_point(boxes[i], center(boxes[j]))
                q = edge_point(boxes[j], center(boxes[i]))
                d.line([p, q], fill=RED_L)
        for bx in boxes.values():
            d.rectangle([bx[0] - 2, bx[1] - 2, bx[2] + 1, bx[3] + 1], outline=RED_L, width=2)
        for a, b, title, sub, ask in self.banners:
            if a <= t < b:
                self._banner(d, t, title, sub, ask)
        ctx.set(dark)

    def _cursor(self, ctx):
        t = ctx.t
        if any(a <= t < b for a, b in self.cursor_hidden):
            return
        mode = next((m for a, b, m in self.cursor_modes if a <= t < b), "arrow")
        draw_cursor(ctx.d, *self.cursor_at(t), mode)

    def _shake(self, ctx):
        for ts, amp in self.shakes:
            k = int((ctx.t - ts) * 30)
            if 0 <= k < 4:
                off = [(0, amp), (1, -amp + 1), (-1, 1), (0, -1)][k]
                moved = Image.new("RGB", (W, H), INK)
                moved.paste(ctx.img, off)
                ctx.set(moved)
                return


def _rot_paste(img, sprite, cx, cy, deg):
    r = sprite.rotate(deg, resample=Image.NEAREST, expand=True) if deg else sprite
    img.paste(r, (round(cx - r.width / 2), round(cy - r.height / 2)), r)


def _path_len(path):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path, path[1:]))


def _along(path, dist):
    for a, b in zip(path, path[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if dist <= L:
            return lerp2(a, b, dist / L if L else 1)
        dist -= L
    return path[-1]


def _draw_tray(d, tx, press):
    d.rectangle([tx + 3, TRAY_Y0 + 3, tx + TRAY_W + 3, TRAY_Y1 + 3], fill=DESK_D)
    d.rectangle([tx, TRAY_Y0, tx + TRAY_W, TRAY_Y1], fill=METAL)
    d.rectangle([tx, TRAY_Y0, tx + TRAY_W, TRAY_Y0 + 2], fill=METAL_L)
    d.rectangle([tx, TRAY_Y1 - 2, tx + TRAY_W, TRAY_Y1], fill=METAL_D)
    d.rectangle([tx, TRAY_Y0, tx + 3, TRAY_Y1], fill=METAL_D)
    for label, kind, col, col_d, bx in (("APPROVED", "approve", GREEN, GREEN_D, tx + 10),
                                        ("DENIED", "deny", RED, RED_D, tx + 90)):
        off = press.get(kind, 0)
        by = TRAY_Y0 + 8 + off
        d.rectangle([bx + 2, by + 2, bx + 66, by + 42 - off], fill=METAL_D)
        d.rectangle([bx, by, bx + 64, by + 40], fill=col_d)
        d.rectangle([bx + 1, by + 1, bx + 63, by + 36], fill=col)
        d.rectangle([bx + 22, by + 6, bx + 42, by + 18], fill=col_d)
        d.rectangle([bx + 24, by + 6, bx + 40, by + 8], fill=col)
        txt(d, (bx + 32, by + 25), label, 8, WHITE, anchor="ma")


def _button(d, box, glyph, label, active):
    x0, y0, x1, y1 = box
    d.rectangle([x0 + 2, y0 + 2, x1 + 2, y1 + 2], fill=DESK_D)
    d.rectangle(box, fill=RED_D if active else METAL_D)
    d.rectangle(box, outline=METAL_L)
    txt(d, ((x0 + x1) // 2, y0 + 6), glyph, 12, WHITE, anchor="ma")
    txt(d, ((x0 + x1) // 2, y0 + 21), label, 8, WHITE if active else GREY, anchor="ma")


DATES = {1: "2026.11.09", 2: "2026.11.10", 3: "2026.11.11", 4: "2026.11.12", 5: "2026.11.13"}
WEEKDAYS = {1: "星期一", 2: "星期二", 3: "星期三", 4: "星期四", 5: "星期五"}


def _date(day):
    return DATES.get(day, "2026.10.18")
