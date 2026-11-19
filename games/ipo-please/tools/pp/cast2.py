"""《IPO, PLEASE》新角色（和 video/film.py 里的一模一样，游戏和视频长得一样）。"""
from . import cast
from .people import Person

MAXGUY = Person(skin="light", face="square", hair="slick", hair_color=(60, 46, 40), eyes="rimless",
                top="shirt_tie", top_color=(206, 204, 196), tie=(40, 90, 140), expr="smile")
CODER = cast.SLANG[3].but(expr="grin")
# 蓝色大肥鱼：蓝发呆毛、头鳍、蓝白女仆装、鲸尾
FISH = Person(skin="light", face="round", hair="long", hair_color=(70, 112, 214), top="maid", top_color=(64, 96, 200),
              acc="fishgirl", expr="smile")
RESELLER = cast.RELAY.but(expr="smile")
TOKYO = Person(skin="light", face="oval", hair="side", hair_color=(30, 26, 24), eyes="glasses", top="jacket",
               top_color=(110, 90, 70), expr="smile")
SG1 = Person(skin="mid", face="square", hair="buzz", top="jacket", top_color=(60, 70, 60), expr="smile")
SG2 = Person(skin="tan", face="oval", hair="side", top="polo", top_color=(170, 60, 60), expr="smile")
SG3 = Person(skin="light", face="long", hair="slick", hair_color=(30, 26, 24), eyes="rimless", top="suit",
             top_color=(40, 46, 64), tie=(140, 40, 40), expr="smile")
# 真新加坡人（快剪里说新加坡英语的，应该放行）
SG_REAL1 = Person(skin="deep", face="oval", hair="short", hair_color=(30, 26, 24), top="polo", top_color=(70, 100, 130),
                  expr="smile")
SG_REAL2 = Person(skin="light", face="round", hair="bun", hair_color=(40, 32, 30), eyes="glasses", top="cardigan",
                  top_color=(150, 110, 120), inner=(220, 214, 204), expr="smile")
APPLE = Person(skin="light", face="oval", hair="side", hair_color=(40, 34, 30), eyes="rimless", top="tee",
               top_color=(214, 214, 218), expr="smile")
XIANYU = Person(skin="light", face="round", hair="dreads", hair_color=(34, 28, 26), top="jersey",
                top_color=(24, 128, 72), expr="smile")      # 闲鱼「尼日利亚身份全套」：送球衣、送脏辫假发
XIANYU_REAL = XIANYU.but(hair="buzz", hair_color=(40, 30, 26))   # 假发掉了：自己的寸头
TEXAN = Person(skin="light", face="square", hair="short", hair_color=(170, 120, 70), beard="stubble",
               beard_color=(150, 110, 70), hat="cowboy", hat_color=(110, 74, 46), top="jacket",
               top_color=(64, 88, 130), inner=(220, 214, 200), expr="grin")
GRUMPY = Person(skin="mid", face="square", hair="buzz", hair_color=(36, 30, 28), top="tee", top_color=(70, 74, 82),
                eyebags=True, expr="smile")   # 暴躁老哥：Claude 先降智，他再骂，被拘留
BOSS = Person(skin="light", face="square", hair="slick", hair_color=(30, 28, 26), eyes="rimless", top="suit",
              top_color=(44, 48, 60), tie=(150, 120, 40), expr="smile")   # 双十一电商老板：放行之后一句话被拘留
JINQI = Person(skin="mid", face="round", hair="slick", hair_color=(60, 56, 54), top="tangzhuang",
               top_color=(176, 32, 30), acc="jinqi", expr="grin")   # 注册即封：唐装 + 锦旗，来道谢的
JINQI_BARE = JINQI.but(acc=None)
FISH_MASK = FISH.but(hair="none", hat="balaclava", hat_color=(52, 56, 72), acc="fishtail")   # 头套套住了脸，尾巴还露着
JORJI_MASK = cast.JORJI_SUIT.but(eyes="mask")                                                  # 乔治换了身份，戴了个眼罩
JORJI_NOSE = cast.JORJI_SUIT.but(eyes="groucho")                                               # 第三个身份：大鼻子眼镜
