/* ============================================================
 * 星野物语 — 物品 / 作物 / 配方 / 怪物 / 村民 数据库
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G;

  // 颜色主题（供程序化图标使用）：shape 决定绘制方式，color 主色
  const ITEMS = {
    // ---- 工具 ----
    hoe:      { name: '锄头', type: 'tool', shape: 'hoe', color: '#9a7040', desc: '翻整土地，准备播种', stamina: 2 },
    axe:      { name: '斧头', type: 'tool', shape: 'axe', color: '#9a7040', desc: '砍伐树木获取木材', stamina: 3 },
    pickaxe:  { name: '镐子', type: 'tool', shape: 'pick', color: '#9a7040', desc: '敲碎石块与矿石', stamina: 4 },
    watering: { name: '洒水壶', type: 'tool', shape: 'can', color: '#5b8fc8', desc: '给作物浇水', stamina: 2 },
    fishing:  { name: '钓竿', type: 'tool', shape: 'rod', color: '#8a6637', desc: '在水边钓鱼', stamina: 3 },
    sword:    { name: '铁剑', type: 'weapon', shape: 'sword', color: '#c8d0d8', desc: '基础武器，攻击 12', damage: 12, stamina: 3 },
    steelsword:{ name: '精钢剑', type: 'weapon', shape: 'sword', color: '#e0e8f0', desc: '攻击 24', damage: 24, stamina: 3 },
    runesword:{ name: '符文之刃', type: 'weapon', shape: 'sword', color: '#b06ce8', desc: '攻击 40，附带魔法', damage: 40, stamina: 4 },
    slingshot:{ name: '弹弓', type: 'weapon', shape: 'sling', color: '#7a5230', desc: '远程攻击 8', damage: 8, range: 90, stamina: 2 },

    // ---- 种子 ----
    seed_turnip: { name: '芜菁种子', type: 'seed', shape: 'seed', color: '#d8a040', crop: 'turnip', desc: '春作，生长 4 天' },
    seed_carrot: { name: '胡萝卜种子', type: 'seed', shape: 'seed', color: '#e08030', crop: 'carrot', desc: '生长 5 天' },
    seed_potato: { name: '马铃薯种子', type: 'seed', shape: 'seed', color: '#b08a50', crop: 'potato', desc: '生长 6 天' },
    seed_tomato: { name: '番茄种子', type: 'seed', shape: 'seed', color: '#d84040', crop: 'tomato', desc: '夏作，生长 7 天' },
    seed_corn:   { name: '玉米种子', type: 'seed', shape: 'seed', color: '#e8c040', crop: 'corn', desc: '夏作，生长 7 天' },
    seed_pumpkin:{ name: '南瓜种子', type: 'seed', shape: 'seed', color: '#e08020', crop: 'pumpkin', desc: '秋作，生长 8 天' },
    seed_wheat:  { name: '小麦种子', type: 'seed', shape: 'seed', color: '#d8c870', crop: 'wheat', desc: '生长 4 天' },
    seed_strawberry:{ name: '草莓种子', type: 'seed', shape: 'seed', color: '#e04868', crop: 'strawberry', desc: '春作，生长 6 天' },
    seed_blueberry:{ name: '蓝莓种子', type: 'seed', shape: 'seed', color: '#4868c8', crop: 'blueberry', desc: '夏作，生长 7 天' },
    seed_pine:   { name: '松树种子', type: 'seed', shape: 'seed', color: '#4a7a40', crop: 'pine', desc: '四季可种，长成松树' },
    seed_grass:  { name: '牧草种子', type: 'seed', shape: 'seed', color: '#7ab84a', crop: 'grass', desc: '喂牲畜用' },

    // ---- 作物 ----
    turnip:    { name: '芜菁', type: 'crop', shape: 'turnip', color: '#d8d8e8', price: 60, desc: '清爽的根茎作物' },
    carrot:    { name: '胡萝卜', type: 'crop', shape: 'carrot', color: '#e87828', price: 90, desc: '营养丰富的橙色根茎' },
    potato:    { name: '马铃薯', type: 'crop', shape: 'potato', color: '#b89058', price: 80, desc: '饱腹感强' },
    tomato:    { name: '番茄', type: 'crop', shape: 'tomato', color: '#e04040', price: 110, desc: '多汁的红色果实' },
    corn:      { name: '玉米', type: 'crop', shape: 'corn', color: '#e8c840', price: 130, desc: '金黄的谷物' },
    pumpkin:   { name: '南瓜', type: 'crop', shape: 'pumpkin', color: '#e88420', price: 200, desc: '巨大的秋季果实' },
    wheat:     { name: '小麦', type: 'crop', shape: 'wheat', color: '#dcc864', price: 45, desc: '制作面粉的原料' },
    strawberry:{ name: '草莓', type: 'crop', shape: 'strawberry', color: '#e04868', price: 150, desc: '甜美的红色浆果' },
    blueberry: { name: '蓝莓', type: 'crop', shape: 'blueberry', color: '#5068c8', price: 140, desc: '酸甜的蓝色浆果' },

    // ---- 采集物 ----
    wood:      { name: '木材', type: 'material', shape: 'wood', color: '#8a6038', price: 10, desc: '砍树得来的木头' },
    stone:     { name: '石头', type: 'material', shape: 'stone', color: '#9a9a9a', price: 8, desc: '普通的石块' },
    fiber:     { name: '纤维', type: 'material', shape: 'fiber', color: '#7ab84a', price: 5, desc: '野草编织而成' },
    coal:      { name: '煤炭', type: 'material', shape: 'coal', color: '#3a3a3a', price: 25, desc: '冶炼所需' },
    copper:    { name: '铜矿石', type: 'ore', shape: 'ore', color: '#c87840', price: 45, desc: '常见的金属矿' },
    iron:      { name: '铁矿石', type: 'ore', shape: 'ore', color: '#b0b8c0', price: 80, desc: '制作工具的好材料' },
    silver:    { name: '银矿石', type: 'ore', shape: 'ore', color: '#d8e0e8', price: 140, desc: '闪亮的稀有金属' },
    gold:      { name: '金矿石', type: 'ore', shape: 'ore', color: '#e8c840', price: 260, desc: '闪闪发光的宝物' },
    prismatic: { name: '棱镜碎片', type: 'ore', shape: 'gem', color: '#b06ce8', price: 800, desc: '矿洞深处的神秘结晶' },
    mushroom:  { name: '蘑菇', type: 'forage', shape: 'mushroom', color: '#d06050', price: 35, desc: '森林里采到的蘑菇', edible: 12 },
    berry:     { name: '野莓', type: 'forage', shape: 'berry', color: '#c04070', price: 25, desc: '酸甜的野生浆果', edible: 10 },
    flower:    { name: '野花', type: 'forage', shape: 'flower', color: '#e8c840', price: 20, desc: '漂亮的野花，适合送礼', gift: 20 },
    acorn:     { name: '橡果', type: 'forage', shape: 'acorn', color: '#9a7040', price: 12, desc: '松鼠的最爱' },
    sage:      { name: '鼠尾草', type: 'forage', shape: 'herb', color: '#7ab88a', price: 40, desc: '有药用价值的香草', gift: 25 },
    snowdrop:  { name: '雪滴花', type: 'forage', shape: 'flower', color: '#e8f0f8', price: 60, desc: '寒冬中绽放的花', gift: 35 },

    // ---- 鱼类 ----
    fish_carp: { name: '鲤鱼', type: 'fish', shape: 'fish', color: '#c87840', price: 45, desc: '常见的淡水鱼', edible: 15 },
    fish_trout:{ name: '鳟鱼', type: 'fish', shape: 'fish', color: '#8ab8c8', price: 90, desc: '清澈溪流中的鱼', edible: 20 },
    fish_salmon:{name: '鲑鱼', type: 'fish', shape: 'fish', color: '#e08060', price: 130, desc: '洄游的红色大鱼', edible: 25 },
    fish_tuna: { name: '金枪鱼', type: 'fish', shape: 'fish', color: '#6080b8', price: 200, desc: '海里的庞然大物', edible: 30 },
    fish_star: { name: '星鱼', type: 'fish', shape: 'fish', color: '#b06ce8', price: 500, desc: '传说中闪耀的鱼' },

    // ---- 怪物掉落 ----
    slime:     { name: '史莱姆凝胶', type: 'drop', shape: 'slime', color: '#60c878', price: 15, desc: '黏糊糊的绿色凝胶' },
    bat_wing:  { name: '蝙蝠翅膀', type: 'drop', shape: 'wing', color: '#8a6a9a', price: 30, desc: '轻薄的翅膀' },
    skeleton_bone:{ name: '骨头', type: 'drop', shape: 'bone', color: '#e0d8c0', price: 20, desc: '疑似 skeletons 的遗骸' },
    void_essence:{ name: '虚空精华', type: 'drop', shape: 'gem', color: '#8040b0', price: 300, desc: '来自异界的能量' },
    fire_crystal:{ name: '火焰结晶', type: 'drop', shape: 'gem', color: '#e85030', price: 180, desc: '炽热的力量结晶' },

    // ---- 食物 / 药剂 ----
    bread:     { name: '面包', type: 'food', shape: 'bread', color: '#d8a860', price: 50, edible: 40, desc: '香喷喷的主食' },
    soup:      { name: '蔬菜汤', type: 'food', shape: 'soup', color: '#c87840', price: 90, edible: 60, desc: '暖心暖胃' },
    milk:      { name: '牛奶', type: 'food', shape: 'potion', color: '#f0f0e8', price: 60, edible: 20, desc: '新鲜的牛奶' },
    cake:      { name: '草莓蛋糕', type: 'food', shape: 'cake', color: '#f0b0c0', price: 200, edible: 80, desc: '甜品中的极品', gift: 60 },
    potion_hp: { name: '生命药水', type: 'potion', shape: 'potion', color: '#e84040', price: 120, heal: 50, desc: '恢复 50 点生命' },
    potion_mp: { name: '魔法药水', type: 'potion', shape: 'potion', color: '#4080e8', price: 100, mana: 30, desc: '恢复 30 点魔力' },
    potion_st: { name: '体力药水', type: 'potion', shape: 'potion', color: '#e8c840', price: 80, stamina: 60, desc: '恢复 60 点体力' },
    elixir:    { name: '万能药', type: 'potion', shape: 'potion', color: '#b06ce8', price: 500, heal: 200, mana: 100, stamina: 200, desc: '全属性大幅恢复' },

    // ---- 礼物 / 特殊 ----
    ring:      { name: '戒指', type: 'special', shape: 'ring', color: '#e8c840', price: 2000, desc: '向心仪的人求婚吧', gift: 200 },
    key:       { name: '生锈的钥匙', type: 'special', shape: 'key', color: '#b8a060', price: 0, desc: '也许能打开什么' },
    chest:     { name: '宝箱', type: 'special', shape: 'chest', color: '#a07030', price: 0, desc: '打开看看里面有什么' },
  };

  // 作物定义
  const CROPS = {
    turnip:     { seed: 'seed_turnip', days: 4, seasons: ['春'], sprite: 'turnip', regrow: 0 },
    carrot:     { seed: 'seed_carrot', days: 5, seasons: ['春','秋'], sprite: 'carrot', regrow: 0 },
    potato:     { seed: 'seed_potato', days: 6, seasons: ['春'], sprite: 'potato', regrow: 0 },
    tomato:     { seed: 'seed_tomato', days: 7, seasons: ['夏'], sprite: 'tomato', regrow: 3 },
    corn:       { seed: 'seed_corn', days: 7, seasons: ['夏','秋'], sprite: 'corn', regrow: 3 },
    pumpkin:    { seed: 'seed_pumpkin', days: 8, seasons: ['秋'], sprite: 'pumpkin', regrow: 0 },
    wheat:      { seed: 'seed_wheat', days: 4, seasons: ['春','夏','秋'], sprite: 'wheat', regrow: 0 },
    strawberry: { seed: 'seed_strawberry', days: 6, seasons: ['春'], sprite: 'strawberry', regrow: 3 },
    blueberry:  { seed: 'seed_blueberry', days: 7, seasons: ['夏'], sprite: 'blueberry', regrow: 3 },
    pine:       { seed: 'seed_pine', days: 9, seasons: ['春','夏','秋','冬'], sprite: 'pine', regrow: 0, tree: true },
    grass:      { seed: 'seed_grass', days: 3, seasons: ['春','夏','秋'], sprite: 'grass', regrow: 0 },
  };

  // 制作配方
  const RECIPES = [
    { id: 'r_sword', name: '铁剑', out: 'sword', need: { wood: 3, stone: 5, copper: 2 }, skill: 'combat', level: 1 },
    { id: 'r_steel', name: '精钢剑', out: 'steelsword', need: { iron: 5, wood: 3, coal: 2 }, skill: 'combat', level: 3 },
    { id: 'r_rune', name: '符文之刃', out: 'runesword', need: { silver: 4, gold: 2, prismatic: 1 }, skill: 'combat', level: 6 },
    { id: 'r_sling', name: '弹弓', out: 'slingshot', need: { wood: 5, fiber: 4 }, skill: 'combat', level: 1 },
    { id: 'r_hp', name: '生命药水', out: 'potion_hp', need: { berry: 3, fiber: 2 }, skill: 'foraging', level: 2 },
    { id: 'r_mp', name: '魔法药水', out: 'potion_mp', need: { mushroom: 2, sage: 2 }, skill: 'foraging', level: 3 },
    { id: 'r_st', name: '体力药水', out: 'potion_st', need: { wheat: 3, fiber: 2 }, skill: 'farming', level: 2 },
    { id: 'r_elixir', name: '万能药', out: 'elixir', need: { potion_hp: 2, potion_mp: 2, prismatic: 1 }, skill: 'foraging', level: 7 },
    { id: 'r_bread', name: '面包', out: 'bread', need: { wheat: 3 }, skill: 'cooking', level: 1 },
    { id: 'r_soup', name: '蔬菜汤', out: 'soup', need: { carrot: 1, potato: 1, mushroom: 1 }, skill: 'cooking', level: 1 },
    { id: 'r_cake', name: '草莓蛋糕', out: 'cake', need: { strawberry: 3, wheat: 2, milk: 1 }, skill: 'cooking', level: 3 },
    { id: 'r_chest', name: '木箱', out: 'chest', need: { wood: 10, stone: 4 }, skill: 'foraging', level: 1 },
    { id: 'r_ring', name: '戒指', out: 'ring', need: { gold: 5, silver: 3, prismatic: 1 }, skill: 'mining', level: 6 },
  ];

  // 怪物定义
  const MONSTERS = {
    slime:     { name: '史莱姆', hp: 30, dmg: 6, speed: 26, xp: 8, gold: [5, 15], drops: [[1,'slime',0.8]], color: '#60c878', w: 14, h: 12, layer: 0 },
    bat:       { name: '洞穴蝙蝠', hp: 22, dmg: 9, speed: 44, xp: 10, gold: [6, 18], drops: [[1,'bat_wing',0.6]], color: '#8a6a9a', w: 12, h: 10, layer: 1, fly: true },
    mushroom_m:{ name: '毒蘑菇怪', hp: 42, dmg: 10, speed: 18, xp: 14, gold: [8, 20], drops: [[1,'mushroom',0.7]], color: '#c86070', w: 14, h: 14, layer: 0 },
    skeleton:  { name: '骷髅兵', hp: 60, dmg: 15, speed: 30, xp: 22, gold: [15, 35], drops: [[1,'skeleton_bone',0.9],[1,'iron',0.3]], color: '#d8d0b8', w: 14, h: 16, layer: 0 },
    ghost:     { name: '幽灵', hp: 50, dmg: 18, speed: 36, xp: 26, gold: [20, 40], drops: [[1,'void_essence',0.35]], color: '#a8c8e8', w: 14, h: 16, layer: 1, fly: true },
    fire_imp:  { name: '火焰小鬼', hp: 55, dmg: 20, speed: 38, xp: 30, gold: [25, 50], drops: [[1,'fire_crystal',0.5]], color: '#e86830', w: 14, h: 14, layer: 0 },
    golem:     { name: '石魔像', hp: 140, dmg: 28, speed: 16, xp: 70, gold: [60, 120], drops: [[1,'stone',0.9],[1,'gold',0.4],[1,'prismatic',0.15]], color: '#8a8a8a', w: 20, h: 20, layer: 0, boss: true },
    void_lord: { name: '虚空领主', hp: 320, dmg: 38, speed: 26, xp: 250, gold: [300, 500], drops: [[1,'void_essence',1],[1,'prismatic',0.8],[1,'runesword',0.3]], color: '#8040b0', w: 24, h: 26, layer: 1, boss: true },
  };

  // 村民定义（名字、颜色、喜好、住所、职业）
  const NPCS = [
    { id:'elena',  name:'艾琳娜', color:'#e8a0b0', role:'农夫',   home:[20,24], likes:['flower','strawberry','cake'], giftLine:'谢谢你！我最喜欢花了！' },
    { id:'marcus', name:'马库斯', color:'#7a9ac8', role:'铁匠',   home:[27,22], likes:['iron','copper','gold','stone'], giftLine:'好料子！打铁正需要这个！' },
    { id:'lucy',   name:'露西',   color:'#e8d070', role:'杂货店主',home:[34,26], likes:['berry','mushroom','pumpkin'], giftLine:'哎呀，你太贴心啦！' },
    { id:'gordon', name:'戈登',   color:'#9a7ac8', role:'渔夫',   home:[16,40], likes:['fish_carp','fish_trout','fish_salmon'], giftLine:'嘿！这也是我喜欢的！' },
    { id:'mary',   name:'玛丽',   color:'#c8a0e8', role:'医生',   home:[40,20], likes:['sage','mushroom','berry'], giftLine:'真是贴心的礼物，谢谢你。' },
    { id:'thomas', name:'托马斯', color:'#80b890', role:'牧场主', home:[44,34], likes:['carrot','wheat','potato'], giftLine:'哈哈哈！够实在！' },
    { id:'ruby',   name:'露比',   color:'#e87878', role:'酒馆老板',home:[30,34], likes:['tomato','corn','cake'], giftLine:'来，这杯我请客！' },
    { id:'owen',   name:'欧文',   color:'#8a9ab0', role:'探险家', home:[24,18], likes:['coal','silver','prismatic','key'], giftLine:'你懂 explorer 的浪漫！' },
  ];

  G.DB = {
    items: ITEMS,
    crops: CROPS,
    recipes: RECIPES,
    monsters: MONSTERS,
    npcs: NPCS,
    item(id) { return ITEMS[id] || { name: id, type:'misc', shape:'stone', color:'#888', desc:'' }; },
    getSeeds() { return Object.keys(ITEMS).filter(k => ITEMS[k].type === 'seed'); },
    getFishes() { return Object.keys(ITEMS).filter(k => ITEMS[k].type === 'fish'); },
  };
})(window);
