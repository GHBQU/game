/* ============================================================
 * 星野物语 — 渲染器：程序化像素贴图、地形、实体、天气、光照
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C, T = G.T;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.scale = 3;
      this.vw = 320; this.vh = 200;
      this.camX = 0; this.camY = 0;
      this.sprites = {};
      this.iconCache = {};
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      // iframe / 隐藏面板环境下 innerWidth 可能为 0，必须兜底
      let w = window.innerWidth, h = window.innerHeight;
      if (!w || w < 100) w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 800;
      if (!h || h < 100) h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 500;
      w = Math.max(320, w); h = Math.max(240, h);
      const scale = Math.max(2, Math.min(5, Math.floor(Math.min(w / 400, h / 250))));
      this.scale = scale;
      this.vw = Math.max(160, Math.floor(w / scale));
      this.vh = Math.max(120, Math.floor(h / scale));
      // 只有尺寸真正变化时才重设 canvas（避免清空画面）
      if (this.canvas.width !== this.vw || this.canvas.height !== this.vh) {
        this.canvas.width = this.vw; this.canvas.height = this.vh;
      }
      this.canvas.style.imageRendering = 'pixelated';
    }

    // ---------- 像素画布助手 ----------
    pc(w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      return { c, x };
    }
    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
      r = U.clamp(r,0,255); g = U.clamp(g,0,255); b = U.clamp(b,0,255);
      return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
    }

    // ---------- 生成所有精灵 ----------
    buildSprites() {
      this.sprites = {};
      this.buildTerrainSprites();
      this.buildObjectSprites();
      this.buildCharacterSprites();
      this.buildMonsterSprites();
      this.buildItemSprites();
    }

    buildTerrainSprites() {
      const S = {};
      const mk = (key, draw, w=16, h=16) => { const {c,x} = this.pc(w,h); draw(x,w,h); S[key] = c; };

      // 草地（带季节变化由绘制时调色）
      mk('grass', (x) => {
        x.fillStyle = '#5a9e4b'; x.fillRect(0,0,16,16);
        for (let i=0;i<14;i++) {
          const px = Math.floor(U.hash(i,0,7)*16), py = Math.floor(U.hash(i,1,7)*16);
          x.fillStyle = U.hash(i,2,7)>.5 ? '#6eb458' : '#4a8a3f';
          x.fillRect(px,py,1,2);
        }
      });
      // 季节性草地
      S.grass_summer=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#4a9040';x.fillRect(0,0,16,16);for(let i=0;i<14;i++){const px=Math.floor(U.hash(i,0,7)*16),py=Math.floor(U.hash(i,1,7)*16);x.fillStyle=U.hash(i,2,7)>.5?'#64a848':'#3a7a34';x.fillRect(px,py,1,2);}return c;})();
      S.grass_autumn=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#8a8a3a';x.fillRect(0,0,16,16);for(let i=0;i<14;i++){const px=Math.floor(U.hash(i,0,7)*16),py=Math.floor(U.hash(i,1,7)*16);x.fillStyle=U.hash(i,2,7)>.5?'#b0a040':'#6a7030';x.fillRect(px,py,1,2);}return c;})();
      S.grass_winter=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#d8e4ec';x.fillRect(0,0,16,16);for(let i=0;i<14;i++){const px=Math.floor(U.hash(i,0,7)*16),py=Math.floor(U.hash(i,1,7)*16);x.fillStyle=U.hash(i,2,7)>.5?'#eef4f8':'#c0d0dc';x.fillRect(px,py,1,2);}return c;})();
      S.forest_summer=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#2e6028';x.fillRect(0,0,16,16);for(let i=0;i<18;i++){x.fillStyle=U.pick(['#245020','#387832','#2c682c']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,2);}return c;})();
      S.forest_autumn=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#6a5a28';x.fillRect(0,0,16,16);for(let i=0;i<18;i++){x.fillStyle=U.pick(['#7a6020','#8a7028','#5a5020']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,2);}return c;})();
      S.forest_winter=(()=>{const {c,x}=this.pc(16,16);x.fillStyle='#c8d8e4';x.fillRect(0,0,16,16);for(let i=0;i<18;i++){x.fillStyle=U.pick(['#dce8f0','#b8c8d8','#e8f0f8']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,2);}return c;})();
      mk('tallgrass', (x) => {
        x.fillStyle='#4a8a3f'; x.fillRect(0,0,16,16);
        for(let i=0;i<8;i++){const px=U.randInt(0,15),py=U.randInt(4,14);x.fillStyle=U.pick(['#6eb458','#7ac860','#5aa84a']);x.fillRect(px,py,1,5);x.fillRect(px+1,py+2,1,2);}
      });
      mk('dirt', (x) => {
        x.fillStyle='#9a7048'; x.fillRect(0,0,16,16);
        for(let i=0;i<20;i++){const px=U.randInt(0,15),py=U.randInt(0,15);x.fillStyle=U.pick(['#8a6038','#a88058','#7a5430']);x.fillRect(px,py,1,1);}
      });
      mk('tilled', (x) => {
        x.fillStyle='#7a4e2c'; x.fillRect(0,0,16,16);
        for(let i=0;i<4;i++){x.fillStyle='#8a5c34';x.fillRect(0,i*4+1,16,2);x.fillStyle='#5e3a20';x.fillRect(0,i*4+3,16,1);}
      });
      mk('water', (x) => {
        x.fillStyle='#3878b8'; x.fillRect(0,0,16,16);
        x.fillStyle='#4a90d0'; x.fillRect(0,2,8,1); x.fillRect(4,9,9,1); x.fillRect(11,5,5,1);
        x.fillStyle='#2c6098'; x.fillRect(2,6,6,1); x.fillRect(9,13,5,1);
      });
      mk('sand', (x) => {
        x.fillStyle='#e0d0a0'; x.fillRect(0,0,16,16);
        for(let i=0;i<14;i++){x.fillStyle=U.pick(['#d4c48c','#e8dcb0','#c8b880']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,1);}
      });
      mk('path', (x) => {
        x.fillStyle='#b09868'; x.fillRect(0,0,16,16);
        for(let i=0;i<12;i++){x.fillStyle=U.pick(['#a08858','#c0a878','#9a8050']);x.fillRect(U.randInt(0,15),U.randInt(0,15),U.randInt(1,3),1);}
      });
      mk('wood', (x) => {
        x.fillStyle='#a07848'; x.fillRect(0,0,16,16);
        for(let i=0;i<4;i++){x.fillStyle='#8a6238';x.fillRect(0,i*4+3,16,1);x.fillStyle='#b88a58';x.fillRect(0,i*4,16,1);}
      });
      mk('snow', (x) => {
        x.fillStyle='#e8f0f8'; x.fillRect(0,0,16,16);
        x.fillStyle='#d0e0f0';
        for(let i=0;i<10;i++) x.fillRect(U.randInt(0,15),U.randInt(0,15),1,1);
        x.fillStyle='#ffffff'; x.fillRect(3,4,4,1); x.fillRect(10,11,4,1);
      });
      mk('forest', (x) => {
        x.fillStyle='#3a6e38'; x.fillRect(0,0,16,16);
        for(let i=0;i<18;i++){const px=U.randInt(0,15),py=U.randInt(0,15);x.fillStyle=U.pick(['#2e5e2e','#488042','#356a34']);x.fillRect(px,py,1,2);}
      });
      mk('cave', (x) => {
        x.fillStyle='#5a5050'; x.fillRect(0,0,16,16);
        for(let i=0;i<14;i++){x.fillStyle=U.pick(['#4a4242','#6a5e5e','#4e4646']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,1);}
      });
      mk('stonefloor', (x) => {
        x.fillStyle='#8a8a8a'; x.fillRect(0,0,16,16);
        x.strokeStyle='#6a6a6a';x.strokeRect(.5,.5,15,15);x.fillStyle='#9a9a9a';x.fillRect(1,1,6,6);x.fillRect(9,9,5,5);
      });
      mk('gravel', (x) => {
        x.fillStyle='#989080'; x.fillRect(0,0,16,16);
        for(let i=0;i<18;i++){x.fillStyle=U.pick(['#888070','#a8a090','#787060']);x.fillRect(U.randInt(0,15),U.randInt(0,15),1,1);}
      });
      mk('wall', (x) => {
        x.fillStyle='#3a3636'; x.fillRect(0,0,16,16);
        x.fillStyle='#4a4444'; for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(U.hash(c,r,3)>.4)x.fillRect(c*4,r*4,3,3);
      });
      mk('lava', (x) => {
        x.fillStyle='#d84020'; x.fillRect(0,0,16,16);
        x.fillStyle='#f88030'; x.fillRect(0,3,10,2);x.fillRect(6,11,10,2);
        x.fillStyle='#ffd050'; x.fillRect(2,4,5,1);x.fillRect(10,12,4,1);
      });
      mk('flowers', (x) => {
        x.fillStyle='#5a9e4b'; x.fillRect(0,0,16,16);
        const cols=['#f0e040','#e86070','#e8e8f0','#b060d0','#f0a040'];
        for(let i=0;i<4;i++){const px=U.randInt(2,13),py=U.randInt(2,13);x.fillStyle='#3a7a34';x.fillRect(px,py+2,1,3);x.fillStyle=cols[i];x.fillRect(px-1,py,3,2);x.fillRect(px,py-1,1,4);x.fillStyle='#fff8c0';x.fillRect(px,py+1,1,1);}
      });
      mk('bridge', (x) => {
        x.fillStyle='#8a6238';x.fillRect(0,0,16,16);
        for(let i=0;i<5;i++){x.fillStyle='#a07848';x.fillRect(0,i*3,16,2);x.fillStyle='#6a4828';x.fillRect(0,i*3+2,16,1);}
      });
      this.terrainSprites = S;
    }

    buildObjectSprites() {
      const S = this.sprites;
      const mk = (key,w,h,draw) => { const {c,x} = this.pc(w,h); draw(x,w,h); S[key]=c; };

      // 树
      mk('tree', 32, 40, (x)=>{
        // 树干
        x.fillStyle='#6a4828';x.fillRect(13,22,6,18);x.fillStyle='#8a6238';x.fillRect(14,22,2,18);
        // 树冠
        x.fillStyle='#2e6e32';x.fillRect(6,6,20,18);x.fillRect(4,12,24,8);x.fillRect(9,2,14,6);
        x.fillStyle='#3e8e3e';x.fillRect(8,6,14,8);x.fillRect(6,14,10,5);
        x.fillStyle='#52a848';x.fillRect(10,8,8,5);x.fillRect(14,14,6,3);
        x.fillStyle='#276028';x.fillRect(4,18,24,2);x.fillRect(22,10,4,6);
        // 果实点缀
        x.fillStyle='#e05040';x.fillRect(11,13,2,2);x.fillRect(21,16,2,2);x.fillRect(17,9,2,2);
      });
      mk('pine', 32, 44, (x)=>{
        x.fillStyle='#5a4028';x.fillRect(14,30,5,14);
        for(let i=0;i<4;i++){const y=4+i*8,w=24-i*4;x.fillStyle='#1e5630';x.fillRect(16-w/2,y,w,10);x.fillStyle='#2e7840';x.fillRect(16-w/2+2,y+1,w-6,5);x.fillStyle='#3e9850';x.fillRect(16-w/2+4,y+2,w-10,3);}
        x.fillStyle='#e8f0f8';x.fillRect(8,8,6,2);x.fillRect(20,20,5,2);
      });
      mk('rock', 20, 16, (x)=>{
        x.fillStyle='#6a6a6a';x.fillRect(4,8,12,7);x.fillRect(6,5,8,4);
        x.fillStyle='#909090';x.fillRect(5,9,6,3);x.fillRect(7,6,4,2);
        x.fillStyle='#4a4a4a';x.fillRect(13,11,3,3);
      });
      mk('ore', 20, 18, (x)=>{
        x.fillStyle='#6a6a6a';x.fillRect(3,8,14,9);x.fillRect(5,5,10,4);
        x.fillStyle='#c87840';x.fillRect(6,9,3,3);x.fillRect(12,11,3,3);x.fillRect(9,6,2,2);
        x.fillStyle='#f0b070';x.fillRect(6,9,1,1);x.fillRect(12,11,1,1);
      });
      mk('bush', 16, 14, (x)=>{
        x.fillStyle='#2e6e32';x.fillRect(2,5,12,8);x.fillRect(4,3,8,3);
        x.fillStyle='#3e8e3e';x.fillRect(3,6,6,4);x.fillStyle='#5aae4a';x.fillRect(5,7,3,2);
        x.fillStyle='#d04060';x.fillRect(4,8,2,2);x.fillRect(10,9,2,2);x.fillRect(7,6,2,2);
      });
      mk('fence', 16, 16, (x)=>{
        x.fillStyle='#8a6238';x.fillRect(2,2,3,14);x.fillRect(11,2,3,14);
        x.fillStyle='#a07848';x.fillRect(0,5,16,2);x.fillRect(0,11,16,2);
        x.fillStyle='#6a4828';x.fillRect(2,2,1,14);x.fillRect(11,2,1,14);
      });
      mk('chest', 18, 16, (x)=>{
        x.fillStyle='#6a4828';x.fillRect(1,4,16,11);
        x.fillStyle='#a07030';x.fillRect(2,3,14,4);x.fillRect(2,10,14,4);
        x.fillStyle='#d8b040';x.fillRect(2,8,14,2);x.fillRect(8,4,2,10);
        x.fillStyle='#f0d060';x.fillRect(8,8,2,2);
      });
      mk('sign', 16, 18, (x)=>{
        x.fillStyle='#6a4828';x.fillRect(7,8,2,10);
        x.fillStyle='#a07848';x.fillRect(1,2,14,9);x.fillStyle='#c09860';x.fillRect(2,3,12,7);
        x.fillStyle='#6a4828';x.fillRect(4,5,8,1);x.fillRect(4,7,6,1);
      });
      mk('mailbox', 16, 18, (x)=>{
        x.fillStyle='#6a4828';x.fillRect(7,12,2,6);
        x.fillStyle='#c04040';x.fillRect(2,4,12,8);x.fillStyle='#e06060';x.fillRect(3,5,10,3);
        x.fillStyle='#3a3a3a';x.fillRect(4,7,8,1);
        x.fillStyle='#f0f0f0';x.fillRect(3,3,3,5);
      });
      mk('portal_mine', 32, 32, (x)=>{
        x.fillStyle='#2a2028';x.fillRect(4,14,24,18);
        x.fillStyle='#1a1218';x.beginPath();x.ellipse(16,20,11,10,0,0,6.3);x.fill();
        x.fillStyle='#6a5a70';for(let i=0;i<6;i++)x.fillRect(4+i*4,10+U.randInt(0,6),2,2);
        x.fillStyle='#b078d0';x.fillRect(13,4,6,12);x.fillStyle='#e0b0f0';x.fillRect(15,2,2,12);
        x.fillStyle='#f0e0ff';x.fillRect(15,0,1,4);
      });
      mk('portal_forest', 32, 32, (x)=>{
        x.fillStyle='#3a6e2e';x.fillRect(4,12,24,20);x.fillStyle='#2a5220';x.fillRect(7,8,18,8);
        x.fillStyle='#1e3e18';x.beginPath();x.ellipse(16,20,10,11,0,0,6.3);x.fill();
        x.fillStyle='#7ac850';x.fillRect(6,4,5,4);x.fillRect(22,6,5,4);x.fillRect(13,2,5,3);
      });
      mk('portal_lake', 32, 32, (x)=>{
        x.fillStyle='#3878b8';x.beginPath();x.ellipse(16,22,14,9,0,0,6.3);x.fill();
        x.fillStyle='#5aa0d8';x.fillRect(6,20,8,2);x.fillRect(16,24,8,2);
        x.fillStyle='#a0d8f0';x.fillRect(10,15,6,1);x.fillRect(20,18,4,1);
      });
      mk('portal_snow', 32, 32, (x)=>{
        x.fillStyle='#d8e8f8';x.fillRect(4,14,24,18);
        x.fillStyle='#c0d8f0';x.beginPath();x.ellipse(16,20,11,10,0,0,6.3);x.fill();
        x.fillStyle='#ffffff';for(let i=0;i<8;i++)x.fillRect(U.randInt(6,26),U.randInt(4,14),2,2);
        x.fillStyle='#a0c0e0';x.fillRect(15,2,2,8);x.fillRect(12,5,8,2);
      });
      mk('portal_beach', 32, 32, (x)=>{
        x.fillStyle='#e0d0a0';x.fillRect(4,16,24,16);x.fillStyle='#5ab8d8';x.fillRect(0,18,32,14);
        x.fillStyle='#80d0e8';x.fillRect(4,22,10,2);x.fillRect(18,26,10,2);
        x.fillStyle='#a07848';x.fillRect(14,6,2,12);x.fillStyle='#e8e0c0';x.fillRect(8,4,14,3);
      });
      mk('stairs', 18, 16, (x)=>{
        x.fillStyle='#4a4038';x.fillRect(1,3,16,12);
        for(let i=0;i<4;i++){x.fillStyle=i%2?'#7a6a58':'#8a7a68';x.fillRect(2+i*3,4+i*2,12-i*3,2);}
        x.fillStyle='#302820';x.fillRect(2,14,14,2);
      });
      mk('exit', 18, 16, (x)=>{
        x.fillStyle='#4a4038';x.fillRect(1,3,16,12);
        for(let i=0;i<4;i++){x.fillStyle=i%2?'#7a6a58':'#8a7a68';x.fillRect(2+i*3,4+i*2,12-i*3,2);}
        x.fillStyle='#7ad858';x.fillRect(8,4,2,10);x.fillStyle='#c0f8a0';x.fillRect(8,4,1,4);
      });
      // 建筑
      const buildingSprite = (key, wall, roof, door, windows, w=96, h=80) => mk(key,w,h,(x)=>{
        x.fillStyle=wall;x.fillRect(8,24,w-16,h-24);
        x.fillStyle=this.shade(wall,-20);x.fillRect(8,h-8,w-16,8);
        // 屋顶
        x.fillStyle=roof;x.fillRect(4,16,w-8,12);x.fillRect(10,8,w-20,10);x.fillRect(18,2,w-36,8);
        x.fillStyle=this.shade(roof,-25);
        for(let i=0;i<5;i++)x.fillRect(6+i*(w-12)/5,16,2,12);
        x.fillStyle=this.shade(roof,25);x.fillRect(8,17,w-16,2);
        // 门
        x.fillStyle=door;x.fillRect(w/2-8,h-28,16,28);
        x.fillStyle=this.shade(door,-30);x.fillRect(w/2-8,h-28,16,3);
        x.fillStyle='#e8c840';x.fillRect(w/2+4,h-16,2,2);
        // 窗
        x.fillStyle='#a0d8e8';x.fillRect(16,h-42,14,12);x.fillRect(w-30,h-42,14,12);
        x.fillStyle='#6a4828';x.strokeStyle='#6a4828';x.strokeRect(16.5,h-41.5,13,11);x.strokeRect(w-29.5,h-41.5,13,11);
        x.fillRect(22,h-42,2,12);x.fillRect(w-24,h-42,2,12);
        x.fillStyle='#e8f8ff';x.fillRect(17,h-41,5,4);x.fillRect(w-29,h-41,5,4);
        // 窗户光
        if(windows){x.fillStyle='rgba(255,220,120,.35)';x.fillRect(16,h-42,14,12);x.fillRect(w-30,h-42,14,12);}
      });
      buildingSprite('b_house','#d8b888','#a04040','#8a6238',true, 96,72);
      buildingSprite('b_shop','#c8d0d8','#4878a8','#6a4828',true, 88,68);
      buildingSprite('b_smith','#a8a8a8','#7a4040','#4a3020',false,88,68);
      buildingSprite('b_tavern','#d0a868','#8a4030','#5a3820',true,96,72);
      buildingSprite('b_clinic','#e0e0d8','#6088a0','#8a6238',true,88,68);
      buildingSprite('b_barn','#b04040','#7a3030','#6a4828',false,88,68);
      buildingSprite('b_tent','#c8b890','#6a8a5a','#6a4828',false,72,56);
      // 作物
      const cropSprite = (key, draw) => mk('crop_'+key, 16, 20, draw);
      cropSprite('sprout',(x)=>{x.fillStyle='#5a9e4b';x.fillRect(7,13,2,6);x.fillRect(4,12,4,2);x.fillRect(9,11,4,2);});
      cropSprite('small',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(7,9,2,10);x.fillStyle='#6eb458';x.fillRect(4,8,4,3);x.fillRect(9,7,4,3);x.fillRect(6,4,3,3);});
      cropSprite('turnip',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(5,4,3,5);x.fillRect(9,3,3,6);x.fillStyle='#d8d8e8';x.fillRect(5,11,6,7);x.fillStyle='#f0f0f8';x.fillRect(6,12,2,4);});
      cropSprite('carrot',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(7,3,2,8);x.fillRect(4,4,4,2);x.fillRect(9,5,4,2);x.fillStyle='#e87828';x.fillRect(6,10,4,8);x.fillRect(7,17,2,2);});
      cropSprite('potato',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(4,4,8,7);x.fillStyle='#b89058';x.fillRect(5,11,6,6);x.fillStyle='#d0a870';x.fillRect(6,12,2,2);});
      cropSprite('tomato',(x)=>{x.fillStyle='#3a7a34';x.fillRect(7,3,2,15);x.fillRect(3,7,5,2);x.fillRect(9,9,5,2);x.fillStyle='#e04040';x.fillRect(4,11,4,4);x.fillRect(9,12,4,4);x.fillStyle='#f06060';x.fillRect(5,12,1,1);});
      cropSprite('corn',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(7,2,2,17);x.fillRect(4,6,4,2);x.fillRect(9,10,4,2);x.fillStyle='#e8c840';x.fillRect(6,6,4,8);x.fillStyle='#f0e070';x.fillRect(7,7,1,6);x.fillStyle='#a06020';x.fillRect(6,14,4,2);});
      cropSprite('pumpkin',(x)=>{x.fillStyle='#4a8a3f';x.fillRect(7,5,2,5);x.fillStyle='#e88420';x.fillRect(3,10,10,8);x.fillStyle='#f0a040';x.fillRect(5,11,2,6);x.fillRect(9,11,2,6);x.fillStyle='#6a8a3a';x.fillRect(7,5,2,3);});
      cropSprite('wheat',(x)=>{x.fillStyle='#a08040';x.fillRect(7,3,2,16);for(let i=0;i<5;i++){x.fillStyle='#dcc864';x.fillRect(5,4+i*2,3,2);x.fillRect(8,5+i*2,3,2);}});
      cropSprite('strawberry',(x)=>{x.fillStyle='#3a7a34';x.fillRect(4,5,8,6);x.fillRect(7,10,2,9);x.fillStyle='#e04868';x.fillRect(5,11,6,6);x.fillStyle='#f08098';x.fillRect(6,12,1,1);x.fillRect(9,14,1,1);x.fillStyle='#f8e0a0';x.fillRect(6,13,1,1);});
      cropSprite('blueberry',(x)=>{x.fillStyle='#3a7a34';x.fillRect(4,4,8,8);x.fillStyle='#5068c8';x.fillRect(5,10,3,3);x.fillRect(9,12,3,3);x.fillStyle='#8090e8';x.fillRect(5,10,1,1);});
      cropSprite('pine',(x)=>{x.fillStyle='#5a4028';x.fillRect(7,12,2,8);x.fillStyle='#2e7840';x.fillRect(3,3,10,10);x.fillStyle='#3e9850';x.fillRect(5,4,6,6);});
      cropSprite('grass',(x)=>{x.fillStyle='#7ab84a';for(let i=0;i<6;i++)x.fillRect(U.randInt(3,12),U.randInt(6,18),1,5);});
      cropSprite('dead',(x)=>{x.fillStyle='#8a7048';x.fillRect(7,11,2,8);x.fillRect(4,10,4,2);x.fillRect(9,9,4,2);});
    }

    buildCharacterSprites() {
      const S = this.sprites;
      // 玩家（4方向 × 4帧）—— 用像素绘制
      const drawPerson = (x, color, hair, skin, frame, dir, acc) => {
        const bob = frame % 2 === 0 ? 0 : 1;
        x.clearRect(0,0,16,20);
        // 影子在外部绘制
        // 腿
        x.fillStyle='#3a4a6a';
        if(dir==='down'){x.fillRect(5,14+bob,2,4);x.fillRect(9,14-bob,2,4);}
        else {x.fillRect(5,14,2,4);x.fillRect(9,14,2,4);}
        x.fillStyle='#4a3020';x.fillRect(4,17+bob,3,2);x.fillRect(9,17-bob,3,2);
        // 身体
        x.fillStyle=color;x.fillRect(4,8+bob,8,7);
        x.fillStyle=this.shade(color,20);x.fillRect(5,9+bob,3,5);
        x.fillStyle=this.shade(color,-20);x.fillRect(10,9+bob,2,5);
        // 手臂
        const armY = frame%2===0?9:10;
        x.fillStyle=skin;x.fillRect(2,armY+bob,2,5);x.fillRect(12,armY-bob,2,5);
        // 头
        x.fillStyle=skin;x.fillRect(5,3+bob,6,6);
        // 头发
        x.fillStyle=hair;x.fillRect(4,1+bob,8,4);
        if(dir==='down'){x.fillRect(4,3+bob,2,4);x.fillRect(10,3+bob,2,4);}
        else if(dir==='up'){x.fillRect(4,1+bob,8,6);}
        else {x.fillRect(4,2+bob,8,3);x.fillRect(dir==='left'?10:4,3+bob,2,4);}
        // 眼睛
        x.fillStyle='#2b1d0e';
        if(dir==='down'){x.fillRect(6,6+bob,1,1);x.fillRect(9,6+bob,1,1);}
        else if(dir==='left'){x.fillRect(6,6+bob,1,1);}
        else if(dir==='right'){x.fillRect(9,6+bob,1,1);}
        if(acc==='hat'){x.fillStyle='#8a6238';x.fillRect(3,0+bob,10,2);x.fillRect(5,-1+bob,6,2);}
        if(acc==='cat'){x.fillStyle='#e0a0b0';x.fillRect(4,0+bob,2,3);x.fillRect(10,0+bob,2,3);}
      };
      for (const dir of ['down','up','left','right']) {
        for (let f=0;f<4;f++) {
          const {c,x}=this.pc(16,20); drawPerson(x,'#4878b8','#6a4838','#f0c8a0',f,dir);
          S['player_'+dir+'_'+f]=c;
          const {c:c2,x:x2}=this.pc(16,20); drawPerson(x2,'#d86080','#e8c860','#f0c8a0',f,dir,'hat');
          S['spouse_'+dir+'_'+f]=c2;
        }
      }
      // NPC 精灵（不同颜色）
      G.DB.npcs.forEach((npc,i)=>{
        for (const dir of ['down','up','left','right']) {
          const {c,x}=this.pc(16,20);
          drawPerson(x,npc.color, U.pick(['#4a3828','#6a4838','#3a3028','#8a7048']),'#f0c8a0',0,dir,i%2?'hat':null);
          S['npc_'+npc.id+'_'+dir]=c;
        }
      });
      // 宠物
      const mk=(key,w,h,draw)=>{const {c,x}=this.pc(w,h);draw(x,w,h);S[key]=c;};
      mk('dog', 14,12,(x)=>{x.fillStyle='#c8a060';x.fillRect(3,5,8,5);x.fillRect(2,3,3,4);x.fillRect(9,4,3,3);x.fillStyle='#8a6a38';x.fillRect(4,3,2,3);x.fillStyle='#2b1d0e';x.fillRect(9,5,1,1);x.fillRect(3,5,1,1);x.fillStyle='#e0b878';x.fillRect(4,6,4,2);});
      mk('cat', 14,12,(x)=>{x.fillStyle='#e8e0d8';x.fillRect(3,5,8,5);x.fillRect(2,2,3,4);x.fillRect(9,2,3,4);x.fillStyle='#e8a0b0';x.fillRect(2,3,1,2);x.fillRect(11,3,1,2);x.fillStyle='#2b1d0e';x.fillRect(3,6,1,1);x.fillRect(10,6,1,1);x.fillStyle='#f0a0a0';x.fillRect(6,7,2,1);});
      mk('bird', 12,12,(x)=>{x.fillStyle='#60b8d8';x.fillRect(3,5,6,5);x.fillRect(8,6,3,2);x.fillStyle='#e8c840';x.fillRect(9,6,2,1);x.fillStyle='#4080a8';x.fillRect(4,6,4,3);x.fillStyle='#2b1d0e';x.fillRect(8,6,1,1);x.fillStyle='#f0e0a0';x.fillRect(2,8,3,2);});
    }

    buildMonsterSprites() {
      const S = this.sprites;
      const mk=(key,w,h,draw)=>{const {c,x}=this.pc(w,h);draw(x,w,h);S[key]=c;};
      mk('m_slime',16,14,(x)=>{
        x.fillStyle='#40a858';x.fillRect(3,5,10,8);x.fillRect(4,3,8,3);x.fillRect(2,9,12,4);
        x.fillStyle='#68d080';x.fillRect(4,5,4,4);x.fillStyle='#e8f8e8';x.fillRect(5,6,2,2);x.fillRect(10,6,2,2);
        x.fillStyle='#2b1d0e';x.fillRect(5,7,1,1);x.fillRect(10,7,1,1);x.fillStyle='#2e7a3e';x.fillRect(3,12,10,1);
      });
      mk('m_bat',16,14,(x)=>{
        x.fillStyle='#6a4a80';x.fillRect(4,4,8,7);x.fillRect(1,3,4,3);x.fillRect(11,3,4,3);x.fillRect(0,5,3,4);x.fillRect(13,5,3,4);
        x.fillStyle='#9a70b0';x.fillRect(5,5,3,2);x.fillRect(9,5,2,2);x.fillStyle='#e84040';x.fillRect(6,6,1,1);x.fillRect(9,6,1,1);
        x.fillStyle='#e0d0e8';x.fillRect(6,9,1,2);x.fillRect(9,9,1,2);
      });
      mk('m_mushroom',16,16,(x)=>{
        x.fillStyle='#e0d0b8';x.fillRect(6,8,4,7);x.fillStyle='#c05060';x.fillRect(2,3,12,6);x.fillRect(4,1,8,3);
        x.fillStyle='#f0e0e8';x.fillRect(4,4,2,2);x.fillRect(9,3,2,2);x.fillRect(7,6,2,2);
        x.fillStyle='#2b1d0e';x.fillRect(6,10,1,1);x.fillRect(9,10,1,1);
      });
      mk('m_skeleton',16,18,(x)=>{
        x.fillStyle='#e0d8c0';x.fillRect(5,2,6,6);x.fillRect(4,9,8,5);x.fillStyle='#c8c0a8';x.fillRect(3,10,2,5);x.fillRect(11,10,2,5);
        x.fillStyle='#2b1d0e';x.fillRect(6,4,2,2);x.fillRect(9,4,2,2);x.fillRect(7,7,2,1);
        x.fillStyle='#b0a888';x.fillRect(6,10,4,3);
        x.fillStyle='#e0d8c0';x.fillRect(5,14,2,4);x.fillRect(9,14,2,4);
      });
      mk('m_ghost',16,18,(x)=>{
        x.fillStyle='rgba(168,200,232,0.85)';x.fillRect(4,2,8,10);x.fillRect(2,7,12,6);
        x.fillStyle='rgba(200,230,255,0.9)';x.fillRect(5,3,4,5);
        x.fillStyle='#2b3a5a';x.fillRect(5,7,2,2);x.fillRect(9,7,2,2);
        x.fillStyle='rgba(168,200,232,0.6)';x.fillRect(3,13,2,3);x.fillRect(7,13,2,4);x.fillRect(11,13,2,3);
      });
      mk('m_fire_imp',16,16,(x)=>{
        x.fillStyle='#d84020';x.fillRect(4,5,8,8);x.fillRect(3,7,10,4);
        x.fillStyle='#f88030';x.fillRect(5,6,3,4);x.fillStyle='#ffd050';x.fillRect(6,7,1,2);
        x.fillStyle='#f8c040';x.fillRect(4,1,2,4);x.fillRect(10,1,2,4);x.fillRect(7,0,2,3);
        x.fillStyle='#2b1d0e';x.fillRect(6,8,1,1);x.fillRect(9,8,1,1);
      });
      mk('m_golem',24,24,(x)=>{
        x.fillStyle='#7a7a7a';x.fillRect(5,7,14,12);x.fillRect(2,9,4,8);x.fillRect(18,9,4,8);
        x.fillStyle='#9a9a9a';x.fillRect(7,2,10,7);x.fillRect(6,9,4,4);x.fillRect(14,9,4,4);
        x.fillStyle='#5a5a5a';x.fillRect(8,4,3,3);x.fillRect(13,4,3,3);x.fillRect(7,18,4,4);x.fillRect(13,18,4,4);
        x.fillStyle='#70e0a0';x.fillRect(9,5,2,1);x.fillRect(14,5,2,1);
        x.fillStyle='#b0b0b0';x.fillRect(8,13,8,2);
      });
      mk('m_void_lord',28,30,(x)=>{
        x.fillStyle='#4a2070';x.fillRect(7,7,14,16);x.fillRect(3,10,5,12);x.fillRect(20,10,5,12);
        x.fillStyle='#6a30a0';x.fillRect(9,2,10,7);x.fillRect(6,9,4,4);x.fillRect(18,9,4,4);
        x.fillStyle='#a060d8';x.fillRect(5,3,3,6);x.fillRect(20,3,3,6);x.fillRect(11,0,3,4);x.fillRect(15,0,2,4);
        x.fillStyle='#ff4080';x.fillRect(10,5,2,2);x.fillRect(16,5,2,2);
        x.fillStyle='#e0a0ff';x.fillRect(11,14,6,3);
        x.fillStyle='#2a0840';x.fillRect(9,23,4,5);x.fillRect(15,23,4,5);
        x.fillStyle='#d0a0f0';x.fillRect(12,1,1,2);x.fillRect(17,2,1,2);
      });
    }

    buildItemSprites() {
      const mk=(key,draw)=>{const {c,x}=this.pc(24,24);draw(x);this.iconCache[key]=c;};
      const I=this.iconCache;
      const itemDraw=(def,x)=>{
        const s=def.shape, col=def.color, dk=this.shade(col,-30), lt=this.shade(col,30);
        // 工具
        if(s==='hoe'){x.fillStyle='#8a6238';x.fillRect(11,6,2,15);x.fillStyle=col;x.fillRect(4,4,12,3);x.fillStyle=dk;x.fillRect(4,7,12,2);}
        else if(s==='axe'){x.fillStyle='#8a6238';x.fillRect(12,5,2,16);x.fillStyle=col;x.fillRect(5,4,9,7);x.fillStyle=dk;x.fillRect(5,10,9,2);x.fillStyle=lt;x.fillRect(6,5,6,4);}
        else if(s==='pick'){x.fillStyle='#8a6238';x.fillRect(11,7,2,14);x.fillStyle=col;x.fillRect(3,4,18,3);x.fillRect(4,7,3,2);x.fillRect(17,7,3,2);x.fillStyle=lt;x.fillRect(4,4,14,1);}
        else if(s==='can'){x.fillStyle=col;x.fillRect(6,9,11,10);x.fillStyle=lt;x.fillRect(7,10,4,6);x.fillStyle=dk;x.fillRect(6,17,11,2);x.fillRect(16,11,5,2);x.fillRect(18,9,2,6);x.fillRect(4,7,5,2);}
        else if(s==='rod'){x.fillStyle='#8a6238';x.fillRect(5,3,2,18);x.fillStyle='#c8d8e8';x.fillRect(6,4,1,14);x.fillStyle='#606060';x.fillRect(4,2,4,2);x.fillStyle='#e8c840';x.fillRect(7,17,1,3);}
        else if(s==='sword'){x.fillStyle=col;x.fillRect(11,2,2,12);x.fillRect(10,4,4,8);x.fillStyle=lt;x.fillRect(11,2,1,10);x.fillStyle='#8a6238';x.fillRect(8,14,8,2);x.fillStyle='#6a4828';x.fillRect(11,16,2,5);x.fillStyle='#e8c840';x.fillRect(10,14,4,1);}
        else if(s==='sling'){x.fillStyle='#6a4828';x.fillRect(8,4,2,10);x.fillRect(14,4,2,10);x.fillStyle=col;x.fillRect(10,10,4,3);x.fillStyle='#d0b070';x.fillRect(9,6,1,6);x.fillRect(14,6,1,6);}
        // 种子
        else if(s==='seed'){x.fillStyle=dk;x.fillRect(9,9,6,8);x.fillStyle=col;x.fillRect(10,7,4,10);x.fillStyle=lt;x.fillRect(10,8,2,4);x.fillStyle='#5a9e4b';x.fillRect(12,5,2,3);}
        // 作物
        else if(s==='turnip'){x.fillStyle=col;x.fillRect(7,9,10,10);x.fillStyle=lt;x.fillRect(8,10,3,6);x.fillStyle='#5a9e4b';x.fillRect(11,4,2,5);x.fillRect(8,5,4,2);}
        else if(s==='carrot'){x.fillStyle=col;x.fillRect(9,8,6,11);x.fillRect(10,18,4,3);x.fillStyle=lt;x.fillRect(10,9,2,7);x.fillStyle='#5a9e4b';x.fillRect(10,3,4,6);x.fillRect(7,4,4,2);x.fillRect(13,5,4,2);}
        else if(s==='potato'){x.fillStyle=col;x.fillRect(6,9,12,9);x.fillStyle=lt;x.fillRect(8,11,3,3);x.fillStyle=dk;x.fillRect(14,14,3,3);}
        else if(s==='tomato'){x.fillStyle=col;x.fillRect(6,8,12,11);x.fillStyle=lt;x.fillRect(8,10,3,4);x.fillStyle='#4a8a3f';x.fillRect(10,4,4,5);x.fillRect(7,5,6,2);}
        else if(s==='corn'){x.fillStyle=col;x.fillRect(10,4,5,15);x.fillStyle=lt;x.fillRect(11,5,2,12);x.fillStyle='#5a9e4b';x.fillRect(7,6,4,8);x.fillRect(14,9,3,7);}
        else if(s==='pumpkin'){x.fillStyle=col;x.fillRect(5,8,14,11);x.fillStyle=lt;x.fillRect(7,9,3,8);x.fillRect(13,9,3,8);x.fillStyle='#5a9e4b';x.fillRect(11,4,2,4);}
        else if(s==='wheat'){x.fillStyle=col;x.fillRect(11,3,2,18);for(let i=0;i<5;i++){x.fillRect(8,4+i*3,4,2);x.fillRect(12,i*3+5,4,2);}}
        else if(s==='strawberry'||s==='berry'){x.fillStyle=col;x.fillRect(7,9,10,10);x.fillRect(9,18,6,2);x.fillStyle=lt;x.fillRect(9,11,2,3);x.fillStyle='#f0e0a0';x.fillRect(10,12,1,1);x.fillRect(14,15,1,1);x.fillStyle='#5a9e4b';x.fillRect(8,5,8,4);}
        else if(s==='blueberry'){x.fillStyle=col;x.fillRect(7,9,4,4);x.fillRect(13,12,4,4);x.fillRect(10,15,4,4);x.fillStyle=lt;x.fillRect(7,9,1,1);x.fillRect(13,12,1,1);}
        // 材料
        else if(s==='wood'){x.fillStyle=col;x.fillRect(4,9,16,7);x.fillStyle=lt;x.fillRect(4,10,16,2);x.fillStyle=dk;x.fillRect(4,15,16,1);x.fillStyle='#6a4828';x.fillRect(9,9,2,7);x.fillStyle='#c8a878';x.fillRect(4,12,4,2);}
        else if(s==='stone'){x.fillStyle=col;x.fillRect(5,9,14,9);x.fillStyle=lt;x.fillRect(6,10,6,3);x.fillStyle=dk;x.fillRect(15,15,4,2);}
        else if(s==='fiber'){x.fillStyle=col;for(let i=0;i<5;i++){x.fillRect(5+i*3,6,2,13);}x.fillStyle=lt;x.fillRect(8,6,2,13);}
        else if(s==='coal'){x.fillStyle=col;x.fillRect(6,10,12,8);x.fillStyle='#555';x.fillRect(8,11,4,3);x.fillStyle='#1a1a1a';x.fillRect(14,15,4,2);}
        else if(s==='ore'||s==='gem'){x.fillStyle=dk;x.fillRect(5,10,14,8);x.fillRect(7,7,10,4);x.fillStyle=col;x.fillRect(6,11,5,5);x.fillRect(13,12,4,4);x.fillRect(9,8,4,3);x.fillStyle=lt;x.fillRect(7,11,2,2);x.fillRect(14,12,1,2);if(s==='gem'){x.fillStyle='#fff';x.fillRect(11,7,2,2);}}
        else if(s==='mushroom'){x.fillStyle='#e0d0b8';x.fillRect(10,11,4,8);x.fillStyle=col;x.fillRect(5,6,14,6);x.fillRect(8,4,8,3);x.fillStyle=lt;x.fillRect(7,7,3,2);x.fillRect(13,6,2,2);}
        else if(s==='flower'){x.fillStyle='#5a9e4b';x.fillRect(11,12,2,9);x.fillRect(8,15,4,2);x.fillStyle=col;x.fillRect(9,6,6,6);x.fillStyle='#fff8c0';x.fillRect(11,8,2,2);}
        else if(s==='herb'){x.fillStyle=col;x.fillRect(9,6,6,14);x.fillRect(6,9,4,3);x.fillRect(14,12,4,3);x.fillStyle=lt;x.fillRect(10,8,2,8);}
        else if(s==='acorn'){x.fillStyle=col;x.fillRect(8,8,8,8);x.fillStyle='#6a4828';x.fillRect(7,5,10,5);x.fillStyle=lt;x.fillRect(9,9,2,4);}
        // 鱼
        else if(s==='fish'){x.fillStyle=col;x.fillRect(5,9,12,7);x.fillRect(2,11,4,3);x.fillRect(16,7,5,10);x.fillStyle=lt;x.fillRect(7,10,6,2);x.fillStyle='#2b1d0e';x.fillRect(8,11,2,2);x.fillStyle='#f0f0f0';x.fillRect(3,12,3,1);}
        // 掉落
        else if(s==='slime'){x.fillStyle=col;x.fillRect(6,8,12,9);x.fillStyle=lt;x.fillRect(8,9,4,4);x.fillStyle='#2b1d0e';x.fillRect(9,11,1,1);x.fillRect(14,11,1,1);}
        else if(s==='wing'){x.fillStyle=col;x.fillRect(5,6,7,5);x.fillRect(12,11,7,5);x.fillStyle=lt;x.fillRect(6,7,4,2);x.fillRect(14,12,4,2);}
        else if(s==='bone'){x.fillStyle=col;x.fillRect(8,8,8,3);x.fillRect(6,6,3,3);x.fillRect(6,15,3,3);x.fillRect(15,6,3,3);x.fillRect(15,15,3,3);}
        // 食物
        else if(s==='bread'){x.fillStyle=col;x.fillRect(5,9,14,8);x.fillStyle=lt;x.fillRect(6,8,12,3);x.fillStyle=dk;x.fillRect(6,15,12,2);x.fillStyle='#f0e0c0';x.fillRect(8,10,2,1);x.fillRect(14,11,2,1);}
        else if(s==='soup'){x.fillStyle='#8a6238';x.fillRect(5,10,14,9);x.fillStyle=col;x.fillRect(6,8,12,4);x.fillStyle=lt;x.fillRect(8,9,3,2);x.fillStyle='#f0e0c0';x.fillRect(10,5,2,3);}
        else if(s==='cake'){x.fillStyle=col;x.fillRect(5,11,14,7);x.fillStyle='#f8e8d0';x.fillRect(6,8,12,4);x.fillStyle=col;x.fillRect(11,5,2,3);x.fillRect(10,6,4,2);x.fillStyle='#e04060';x.fillRect(15,8,2,2);}
        else if(s==='potion'){x.fillStyle='#c8d8e8';x.fillRect(9,4,6,4);x.fillStyle=col;x.fillRect(7,8,10,11);x.fillStyle=lt;x.fillRect(8,10,3,6);x.fillStyle='#fff';x.fillRect(9,11,1,2);x.fillStyle='#6a4828';x.fillRect(10,3,4,2);}
        // 特殊
        else if(s==='ring'){x.fillStyle=col;x.beginPath();x.arc(12,14,6,0,6.3);x.fill();x.fillStyle='#9a7040';x.beginPath();x.arc(12,14,3.5,0,6.3);x.fill();x.fillStyle='#e080b0';x.fillRect(11,4,2,4);x.fillStyle='#f0a0c0';x.fillRect(10,5,4,2);}
        else if(s==='key'){x.fillStyle=col;x.beginPath();x.arc(8,8,4,0,6.3);x.fill();x.fillStyle='#9a7040';x.beginPath();x.arc(8,8,2,0,6.3);x.fill();x.fillStyle=col;x.fillRect(11,10,8,2);x.fillRect(16,12,2,4);x.fillRect(18,10,2,4);}
        else if(s==='chest'){x.fillStyle='#6a4828';x.fillRect(4,9,16,10);x.fillStyle=col;x.fillRect(5,7,14,4);x.fillStyle='#d8b040';x.fillRect(5,12,14,2);x.fillRect(11,9,2,8);}
        // 默认宝石
        else {x.fillStyle=col;x.fillRect(7,8,10,10);x.fillStyle=lt;x.fillRect(8,9,4,4);}
      };
      for (const id in G.DB.items) mk(id, (x) => itemDraw(G.DB.items[id], x));
      // 货币图标
      mk('money',(x)=>{x.fillStyle='#d8b040';x.beginPath();x.arc(12,12,8,0,6.3);x.fill();x.fillStyle='#f0d060';x.beginPath();x.arc(12,12,6,0,6.3);x.fill();x.fillStyle='#a07820';x.fillRect(11,7,2,10);x.fillRect(9,9,6,1);});
    }

    // ---------- 绘制世界 ----------
    draw(game) {
      const ctx=this.ctx, w=game.world;
      const p=game.player;
      // 相机
      const targetX = p.x - this.vw/2, targetY = p.y - this.vh/2;
      this.camX = U.lerp(this.camX, targetX, .16);
      this.camY = U.lerp(this.camY, targetY, .16);
      const isMine = game.area !== 'village';
      let mapW, mapH, tiles, objs;
      if (isMine && w.mineLevels[game.mineLevel]) {
        const ml = w.mineLevels[game.mineLevel];
        mapW=ml.w;mapH=ml.h;tiles=ml.tiles;objs=ml.objects;
      } else { mapW=w.w;mapH=w.h;tiles=w.terrain;objs=w.objects; }

      // 背景
      ctx.fillStyle = isMine ? '#151015' : (w.season===3?'#a8bcc8':'#2a5a30');
      ctx.fillRect(0,0,this.vw,this.vh);

      const startX = Math.max(0, Math.floor(this.camX/16)-1);
      const startY = Math.max(0, Math.floor(this.camY/16)-1);
      const endX = Math.min(mapW, Math.ceil((this.camX+this.vw)/16)+1);
      const endY = Math.min(mapH, Math.ceil((this.camY+this.vh)/16)+1);
      const ox = -Math.floor(this.camX), oy = -Math.floor(this.camY);

      // 地形
      const S = this.terrainSprites;
      // 使用季节性地块图集：不同的草地/雪地/森林贴图
      const grassKey = w.season===3?'grass_winter':w.season===2?'grass_autumn':w.season===1?'grass_summer':'grass';
      const forestKey= w.season===3?'forest_winter':w.season===2?'forest_autumn':w.season===1?'forest_summer':'forest';
      for (let ty=startY;ty<endY;ty++) for (let tx=startX;tx<endX;tx++) {
        const t=tiles[ty*mapW+tx];
        let key=this.terrainKey(t);
        if(key==='grass')key=grassKey;
        if(key==='forest')key=forestKey;
        const sx=tx*16+ox, sy=ty*16+oy;
        const sprite=S[key]||S[this.terrainKey(t)];
        if(sprite) ctx.drawImage(sprite,sx,sy);
        else {ctx.fillStyle='#5a9e4b';ctx.fillRect(sx,sy,16,16);}
        // 耕地
        if(!isMine && w.getTilled(tx,ty)){
          ctx.drawImage(S.tilled,sx,sy);
          if(w.getTilled(tx,ty)===2){ctx.fillStyle='rgba(60,140,220,.35)';ctx.fillRect(sx,sy,16,16);
            ctx.fillStyle='rgba(140,210,255,.5)';ctx.fillRect(sx+3,sy+4,3,2);ctx.fillRect(sx+10,sy+10,3,2);}
        }
        // 作物
        if(!isMine && w.cropAt(tx,ty)) this.drawCrop(ctx,w.cropAt(tx,ty),sx,sy);
      }

      // 物体（按 y 排序）
      const visibleObjs = objs.filter(o => !o.dead && Math.abs(o.x*16+ox)>-40 && Math.abs(o.x*16+ox)<this.vw+40 && Math.abs(o.y*16+oy)>-50 && Math.abs(o.y*16+oy)<this.vh+50);
      visibleObjs.sort((a,b)=> (a.y*16+(a.type==='tree'?0:8)) - (b.y*16+(b.type==='tree'?0:8)));
      for (const o of visibleObjs) this.drawObject(ctx,o,ox,oy,isMine,game);

      // 宝箱（地表）
      if(!isMine) for(const c of w.chests){
        if(!c.opened){ctx.drawImage(this.sprites.chest,c.x*16+ox,c.y*16+oy-2);}
        else {ctx.fillStyle='#6a4828';ctx.fillRect(c.x*16+ox+2,c.y*16+oy+8,14,6);}
      }

      // 实体
      const entities=[];
      if(!isMine){
        game.npcs.forEach(n=>entities.push({e:n,kind:'npc'}));
        game.pets.forEach(pet=>entities.push({e:pet,kind:'pet'}));
      }
      game.monsters.forEach(m=>{if(m.area===game.area && m.floor===game.mineLevel)entities.push({e:m,kind:'monster'});});
      entities.push({e:p,kind:'player'});
      if(p.spouse){const sp=game.npcs.find(n=>n.id===p.spouse);if(sp)entities.push({e:sp,kind:'spouse'});}
      entities.sort((a,b)=>a.e.y-b.e.y);
      for(const ent of entities){
        // 影子
        ctx.fillStyle='rgba(0,0,0,.25)';
        ctx.beginPath();ctx.ellipse(ent.e.x+ox,ent.e.y+oy+6,7,3,0,0,6.3);ctx.fill();
        if(ent.kind==='player') this.drawPlayer(ctx,p,ox,oy,game);
        else if(ent.kind==='npc'||ent.kind==='spouse') this.drawNPC(ctx,ent.e,ox,oy,ent.kind==='spouse');
        else if(ent.kind==='pet') this.drawPet(ctx,ent.e,ox,oy);
        else this.drawMonster(ctx,ent.e,ox,oy);
      }

      // 抛射物
      for(const pr of game.projectiles){ctx.fillStyle=pr.color;ctx.fillRect(pr.x+ox-2,pr.y+oy-2,4,4);}

      // 粒子
      for(const pt of G.particles.list){
        const a=pt.life/pt.maxLife;
        ctx.globalAlpha=a;
        if(pt.isText){ctx.font='bold 9px monospace';ctx.fillStyle=pt.color;ctx.textAlign='center';ctx.fillText(pt.text,pt.x+ox,pt.y+oy);ctx.textAlign='left';}
        else{ctx.fillStyle=pt.color;ctx.fillRect(pt.x+ox,pt.y+oy,pt.size,pt.size);}
        ctx.globalAlpha=1;
      }

      // 交互提示 & 目标高亮
      this.drawTarget(ctx,game,ox,oy);

      // 天气 & 光照
      this.drawWeather(ctx,game);
      this.drawLighting(ctx,game,ox,oy);

      // 暗角
      const grad=ctx.createRadialGradient(this.vw/2,this.vh/2,Math.min(this.vw,this.vh)*.3,this.vw/2,this.vh/2,Math.max(this.vw,this.vh)*.7);
      grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,.35)');
      ctx.fillStyle=grad;ctx.fillRect(0,0,this.vw,this.vh);
    }

    terrainKey(t){
      return {0:'grass',1:'tallgrass',2:'dirt',3:'tilled',4:'water',5:'sand',6:'stonefloor',7:'path',8:'wood',9:'snow',10:'forest',11:'cave',12:'bridge',13:'flowers',14:'gravel',15:'wall',16:'lava'}[t]||'grass';
    }

    drawCrop(ctx,crop,sx,sy){
      const def=G.DB.crops[crop.type];
      if(!def)return;
      const ratio=crop.day/def.days;
      let sprite;
      if(crop.day>=def.days) sprite=this.sprites['crop_'+def.sprite];
      else if(ratio>.5) sprite=this.sprites.crop_small;
      else sprite=this.sprites.crop_sprout;
      if(sprite)ctx.drawImage(sprite,sx,sy-4);
    }

    drawObject(ctx,o,ox,oy,isMine,game){
      const x=o.x*16+ox,y=o.y*16+oy,S=this.sprites;
      const key=o.type==='pine'?'pine':o.type==='portal'?'portal_'+(o.to||'mine'):o.type==='house'?'b_house':o.type==='shop'?'b_shop':o.type==='smith'?'b_smith':o.type==='tavern'?'b_tavern':o.type==='clinic'?'b_clinic':o.type==='barn'?'b_barn':o.type==='sign'?'sign':o.type==='portal'?'portal_mine':o.type;
      const sprite=S[key]||S[o.type];
      if(o.building){
        // 建筑精灵锚点在门的位置
        if(sprite)ctx.drawImage(sprite,x-sprite.width/2+8,y-sprite.height+24);
        // 门牌
        if(o.name){ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(o.name,x+8,y-sprite.height+20);ctx.textAlign='left';}
      } else if(sprite){
        // 树/矿石锚定底部
        const oy2=sprite.height>18?y-sprite.height+18:y-sprite.height+16;
        if(o.type==='ore'&&o.ore){
          // 矿石颜色微调
          ctx.drawImage(sprite,x-2,oy2);
        } else ctx.drawImage(sprite,x-(sprite.width-16)/2,oy2);
      } else {
        ctx.fillStyle='#8a6238';ctx.fillRect(x,y,16,16);
      }
      // 矿物闪光提示
      if(o.type==='ore'&&!isMine){
        const t=performance.now()/500;
        ctx.fillStyle=`rgba(255,220,120,${.3+.3*Math.sin(t+o.x)})`;
        ctx.fillRect(x+4,y+4,3,3);
      }
    }

    drawPlayer(ctx,p,ox,oy,game){
      const x=Math.round(p.x+ox),y=Math.round(p.y+oy);
      let dir=p.swing>0?p.swingDir:p.dir;
      if(dir.includes('left'))dir='left';else if(dir.includes('right'))dir='right';
      else if(dir.includes('up'))dir='up';else if(dir.includes('down'))dir='down';
      const sprite=this.sprites['player_'+dir+'_'+p.frame]||this.sprites.player_down_0;
      const blink=p.invuln>0&&Math.floor(p.invuln*15)%2===0;
      if(!blink)ctx.drawImage(sprite,x-8,y-14);
      // 挥舞效果
      if(p.swing>0){
        const nx=p.swingDir==='left'?-1:p.swingDir==='right'?1:0;
        const ny=p.swingDir==='up'?-1:p.swingDir==='down'?1:0;
        ctx.strokeStyle='rgba(255,255,220,.7)';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(x+nx*8,y-4+ny*4,12,0,Math.PI*1.2*(p.swing));ctx.stroke();
      }
      // 钓鱼线
      if(p.fishing){
        ctx.strokeStyle='#e8e8e8';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x+8,y-8);ctx.lineTo(x+24,y+8);ctx.stroke();
        ctx.fillStyle='#e8c840';ctx.fillRect(x+22,y+6,3,3);
      }
    }

    drawNPC(ctx,n,ox,oy,spouse){
      let nd=n.dir||'down';
      if(nd.includes('left'))nd='left';else if(nd.includes('right'))nd='right';
      else if(nd.includes('up'))nd='up';else if(nd.includes('down'))nd='down';
      const key=(spouse?'spouse':'npc_'+n.id)+'_'+nd;
      const sprite=this.sprites[key]||this.sprites['npc_'+n.id+'_down']||this.sprites.npc_elena_down;
      ctx.drawImage(sprite,Math.round(n.x+ox)-8,Math.round(n.y+oy)-14);
      // 头顶标记
      if(spouse){ctx.fillStyle='#ff9fc0';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('❤',n.x+ox,n.y+oy-18);ctx.textAlign='left';}
      else if(U.dist(n.x,n.y,G.game.player.x,G.game.player.y)<28){ctx.fillStyle='#ffd040';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('!',n.x+ox,n.y+oy-18);ctx.textAlign='left';}
    }

    drawPet(ctx,pet,ox,oy){
      const sprite=this.sprites[pet.type];
      if(sprite)ctx.drawImage(sprite,Math.round(pet.x+ox)-7,Math.round(pet.y+oy)-10+Math.sin(pet.bob)*1);
    }

    drawMonster(ctx,m,ox,oy){
      const sprite=this.sprites['m_'+m.type];
      const x=Math.round(m.x+ox),y=Math.round(m.y+oy);
      const bob=m.def.fly?Math.sin(m.bob)*3:0;
      if(m.hurtFlash>0){ctx.globalAlpha=.5;}
      if(sprite)ctx.drawImage(sprite,x-sprite.width/2,y-sprite.height+8+bob);
      ctx.globalAlpha=1;
      // 血条
      if(m.hp<m.maxHp){
        const bw=Math.max(16,m.w);
        ctx.fillStyle='#000';ctx.fillRect(x-bw/2,y-m.h-6,bw,3);
        ctx.fillStyle='#e8524b';ctx.fillRect(x-bw/2+1,y-m.h-5,(bw-2)*(m.hp/m.maxHp),1);
      }
      if(m.def.boss){ctx.fillStyle='#ffd040';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText(m.def.name,x,y-m.h-10);ctx.textAlign='left';}
    }

    drawTarget(ctx,game,ox,oy){
      const p=game.player;
      const tx=Math.floor((p.x+(p.dir==='left'?-16:p.dir==='right'?16:0))/16);
      const ty=Math.floor((p.y+(p.dir==='up'?-16:p.dir==='down'?16:0))/16);
      // 仅高亮可交互目标
      const isMine=game.area!=='village';
      const w=game.world;
      let obj=null;
      if(isMine){const ml=w.mineLevels[game.mineLevel];obj=ml.objects.find(o=>!o.dead&&o.x===tx&&o.y===ty);}
      else obj=w.objectAt(tx,ty);
      if(obj||w.cropAt(tx,ty)){
        ctx.strokeStyle=`rgba(255,220,100,${.5+.3*Math.sin(performance.now()/200)})`;
        ctx.lineWidth=1;ctx.strokeRect(tx*16+ox+.5,ty*16+oy+.5,15,15);
      }
    }

    drawWeather(ctx,game){
      const w=game.world, weather=w.weather||'晴';
      if(weather==='雨'||weather==='雷雨'){
        ctx.strokeStyle='rgba(160,200,255,.5)';ctx.lineWidth=1;
        for(let i=0;i<80;i++){
          const x=(i*67+game.weatherTick*7)%this.vw;
          const y=(i*43+game.weatherTick*13)%this.vh;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+6);ctx.stroke();
        }
        if(weather==='雷雨'&&game.weatherTick%180<3){ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(0,0,this.vw,this.vh);}
      } else if(weather==='雪'){
        ctx.fillStyle='rgba(255,255,255,.8)';
        for(let i=0;i<60;i++){
          const x=(i*71+Math.sin(game.weatherTick*.02+i)*10+game.weatherTick*.5)%this.vw;
          const y=(i*37+game.weatherTick*1.2)%this.vh;
          ctx.fillRect(x,y,2,2);
        }
      } else if(weather==='雾'){
        ctx.fillStyle='rgba(200,210,220,.12)';ctx.fillRect(0,0,this.vw,this.vh);
      }
      // 夜晚遮罩
      const hour=game.gameTime/60;
      let dark=0;
      if(hour<5)dark=.55;
      else if(hour<7)dark=.55*(7-hour)/2;
      else if(hour>19)dark=Math.min(.6,(hour-19)*.15);
      if(game.area!=='village')dark=Math.max(dark,.4);
      //  FLASH光照
      if(dark>0){
        ctx.fillStyle=`rgba(10,15,40,${dark})`;ctx.fillRect(0,0,this.vw,this.vh);
      }
    }

    drawLighting(ctx,game,ox,oy){
      const hour=game.gameTime/60;
      const isDark=hour<6||hour>20||game.area!=='village';
      if(!isDark)return;
      ctx.globalCompositeOperation='lighter';
      const p=game.player;
      const radius=game.area!=='village'?70:52;
      const g=ctx.createRadialGradient(p.x+ox,p.y+oy-4,2,p.x+ox,p.y+oy-4,radius);
      g.addColorStop(0,'rgba(255,220,140,.28)');g.addColorStop(1,'rgba(255,220,140,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x+ox,p.y+oy-4,radius,0,6.3);ctx.fill();
      ctx.globalCompositeOperation='source-over';
    }
  }

  G.Renderer = Renderer;
})(window);
