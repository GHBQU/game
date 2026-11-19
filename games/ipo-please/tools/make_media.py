"""README 和链接分享用的图：media/logo.png、media/og.png、media/gameplay-{zh,en}.gif。

先录帧（见 tools/record_gif.js），再：
  .venv/bin/python tools/make_media.py <中文帧目录> <英文帧目录>
og.png 的右半边是中文录制时另存的 still.png（Max 哥「那我的钱呢？！」）里的检查窗口。
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from pp.base import CLAUDE, CLAUDE_L, GREY, INK, WHITE, big_text, draw, spark, txt  # noqa: E402
from pp.screens import TITLE_BAND, TITLE_BAND_D, TITLE_EDGE, TITLE_GOLD, title_band  # noqa: E402

MEDIA = ROOT / "media"
BG = (26, 23, 23)
FPS = 15                     # 和 record_gif.js 一致


def emblem(d, cx, cy, r):
    """标题页的徽章：深绿圆 + 橙边 + 星芒（同 build_assets.title_emblem）。"""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TITLE_BAND_D, outline=CLAUDE)
    spark(d, cx, cy, CLAUDE_L, k=2)


def logo():
    """160×160：画在 80×80 上再放大 2 倍（同前作的 logo 版式，红换成封面的绿）。"""
    im = Image.new("RGB", (80, 80), TITLE_BAND)
    d = draw(im)
    emblem(d, 40, 26, 21)
    d.rectangle([0, 52, 79, 53], fill=TITLE_EDGE)
    txt(d, (40, 60), "IPO, PLEASE", 12, WHITE, anchor="ma")
    im.resize((160, 160), Image.NEAREST).save(MEDIA / "logo.png")


def og(frame):
    """1280×640 链接分享卡片：左边片名，右边游戏里的检查窗口。画在 640×320 上再放大 2 倍。"""
    im = Image.new("RGB", (640, 320), BG)
    band = title_band(54).crop((0, 0, 640, 54))
    im.paste(band, (0, 96))
    d = draw(im)
    cx = 168
    emblem(d, cx, 58, 22)
    big_text(im, cx, 109, "IPO, PLEASE", 12, 3, WHITE, shadow=INK)
    txt(d, (cx, 166), "A Papers, Please parody · the sequel", 10, CLAUDE_L, anchor="ma")
    txt(d, (cx, 182), "请出示资金证明", 12, TITLE_GOLD, anchor="ma")
    txt(d, (cx, 208), "Anthrotzka went public. Every ban is revenue.", 8, GREY, anchor="ma")
    txt(d, (cx, 220), "中文 / English · free, in your browser", 8, GREY, anchor="ma")
    txt(d, (cx, 252), "ipo-please.github.io", 10, WHITE, anchor="ma")
    # 右：录屏帧（1280×720 = 游戏 2 倍）里的检查窗口 + 对白框，缩回 1 倍
    f = Image.open(frame).convert("RGB").resize((640, 360), Image.NEAREST)
    win = f.crop((6, 132, 216, 346))
    x0, y0 = 384, 48
    d.rectangle([x0 - 6, y0 - 6, x0 + win.width + 5, y0 + win.height + 5], fill=(62, 56, 52))
    d.rectangle([x0 - 3, y0 - 3, x0 + win.width + 2, y0 + win.height + 2], fill=INK)
    im.paste(win, (x0, y0))
    im.resize((1280, 640), Image.NEAREST).save(MEDIA / "og.png")


def gif(frames, out):
    """15fps、1280×720；像素画不抖动，调色板按帧间变化统计，体积小。"""
    pal = out.with_suffix(".pal.png")
    src = ["-framerate", str(FPS), "-start_number", "0", "-i", str(Path(frames) / "f%04d.png")]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-vf", "palettegen=max_colors=96:stats_mode=diff", str(pal)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-i", str(pal), "-lavfi",
                    "[0:v][1:v]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", str(out)], check=True)
    pal.unlink()
    print(out.name, f"{out.stat().st_size / 1e6:.2f}MB")


def main():
    zh, en = sys.argv[1], sys.argv[2]
    MEDIA.mkdir(exist_ok=True)
    logo()
    og(Path(zh) / "still.png")
    gif(zh, MEDIA / "gameplay-zh.gif")
    gif(en, MEDIA / "gameplay-en.gif")


if __name__ == "__main__":
    main()
