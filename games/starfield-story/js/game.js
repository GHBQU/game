/* ============================================================
 * 星野物语 — 主游戏循环 / 状态管理 / 存档
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C, DB = G.DB;

  class Game {
    constructor() {
      this.state = 'title';
      this.paused = false;
      this.gameTime = 7 * 60;   // 07:00
      this.timeScale = 1;       // 游戏内 1 秒 ≈ 现实 1 秒 → 1 游戏分钟
      this.weatherTick = 0;
      this.footstepTimer = 0;
      this.lastTime = performance.now();
      this.dt = 0;
      this.area = 'village';
      this.mineLevel = 1;
      this.spawnMonsterTimer = 5;
      this.autoSaveTimer = 0;
      this.init();
    }

    init() {
      this.canvas = document.getElementById('gameCanvas');
      this.renderer = new G.Renderer(this.canvas);
      this.renderer.buildSprites();
      G.particles = new G.ParticleSystem();
      this.setupTitle();
      this.bindGlobal();
      this.startWatchdog();
      this.lastFrameAt = performance.now();
      requestAnimationFrame(t => this.loop(t));
    }

    setupTitle() {
      const tc = document.getElementById('titleCanvas');
      const ctx = tc.getContext('2d'); ctx.imageSmoothingEnabled = false;
      // 画一个像素风景
      const W=200,H=150;tc.width=W;tc.height=H;
      ctx.fillStyle='#1a2a44';ctx.fillRect(0,0,W,H);
      // 星星
      for(let i=0;i<80;i++)ctx.fillStyle=U.chance(.3)?'#fff':'#8ab0d8',ctx.fillRect(U.randInt(0,W),U.randInt(0,80),1,1);
      // 月亮
      ctx.fillStyle='#f8e8a0';ctx.beginPath();ctx.arc(150,30,14,0,6.3);ctx.fill();
      ctx.fillStyle='#1a2a44';ctx.beginPath();ctx.arc(156,26,12,0,6.3);ctx.fill();
      // 远山
      for(let x=0;x<W;x++){const h=70+Math.sin(x*.05)*12+Math.sin(x*.13)*6;ctx.fillStyle='#2a3a4a';ctx.fillRect(x,H-h,1,h);}
      ctx.fillStyle='#233340';for(let x=0;x<W;x++){const h=88+Math.sin(x*.04+2)*8;ctx.fillRect(x,H-h,1,h);}
      // 地面
      ctx.fillStyle='#2a5a30';ctx.fillRect(0,110,W,40);
      ctx.fillStyle='#356a38';for(let i=0;i<300;i++)ctx.fillRect(U.randInt(0,W),U.randInt(110,H),1,1);
      // 小屋
      ctx.fillStyle='#d8b888';ctx.fillRect(80,86,36,24);
      ctx.fillStyle='#a04040';ctx.fillRect(76,78,44,9);ctx.fillRect(82,72,32,7);
      ctx.fillStyle='#8a6238';ctx.fillRect(96,96,8,14);
      ctx.fillStyle='#f8d860';ctx.fillRect(84,92,8,7);ctx.fillRect(106,92,8,7);
      // 树
      [24,52,170].forEach(tx=>{ctx.fillStyle='#5a4028';ctx.fillRect(tx,92,4,18);ctx.fillStyle='#2e6e32';ctx.fillRect(tx-8,72,20,22);ctx.fillStyle='#3e8e3e';ctx.fillRect(tx-5,75,12,12);});
      // 萤火虫
      this.fireflies=Array.from({length:12},()=>({x:U.rand(0,W),y:U.rand(60,130),p:U.rand(0,6.3)}));
      this.titleCtx=ctx;this.titleW=W;this.titleH=H;this.titleTime=0;

      document.getElementById('btnNew').onclick=()=>this.newGame();
      document.getElementById('btnContinue').onclick=()=>this.loadGame();
      document.getElementById('btnHelp').onclick=()=>{document.getElementById('helpScreen').classList.add('active');};
      document.getElementById('btnHelpClose').onclick=()=>{
        document.getElementById('helpScreen').classList.remove('active');
        if(this.state==='playing')document.getElementById('gameScreen').classList.add('active');
      };
      document.getElementById('btnContinue').disabled=!U.hasSave('save');
    }

    bindGlobal() {
      // 对话推进
      window.addEventListener('keydown',e=>{
        if((e.key===' '||e.key.toLowerCase()==='e')&&this.ui&&this.ui.dialogueOpen){
          e.preventDefault();this.ui.nextDialogue();
        }
      });
      // 失焦暂停
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.lastTime=performance.now();});
    }

    newGame() {
      G.Audio.init(); G.Audio.startBgm();
      this.world=new G.World().generate(Date.now());
      this.player=new G.Player(32*16+8,32*16+8);
      // 初始物品
      this.player.addItem('hoe',1);
      this.player.addItem('axe',1);
      this.player.addItem('pickaxe',1);
      this.player.addItem('watering',1);
      this.player.addItem('fishing',1);
      this.player.addItem('sword',1);
      this.player.addItem('seed_turnip',15);
      this.player.addItem('seed_potato',8);
      this.player.addItem('potion_hp',3);
      this.player.addItem('bread',3);
      this.player.selected=0;
      this.startGame(true);
      G.toast('欢迎来到星野村！先去南边的农场种点东西吧');
      setTimeout(()=>this.ui.showDialogueQueue([
        {name:'村长 · 欧文',text:'欢迎来到星野村，年轻人！这里虽然不大，但机会很多。'},
        {name:'村长 · 欧文',text:'南边有块地是你的农场。先用锄头耕地，再播种、浇水。'},
        {name:'村长 · 欧文',text:'晚上小心怪物。北边的矿洞里有珍贵的矿石……也有危险。'},
        {name:'村长 · 欧文',text:'和村民们聊聊吧，说不定能找到志同道合的伙伴。祝你玩得开心！'},
      ]),600);
    }

    loadGame() {
      const d=U.load('save');
      if(!d){G.toast('没有找到存档');return;}
      G.Audio.init();G.Audio.startBgm();
      this.world=G.World.deserialize(d.world);
      this.player=G.Player.deserialize(d.player);
      this.gameTime=d.gameTime||420;
      this.area=d.area||'village';
      this.mineLevel=d.mineLevel||1;
      this.world.weather=d.weather||'晴';
      this.world.weatherTimer=d.weatherTimer||0;
      this.startGame(false);
      G.toast('欢迎回来！');
    }

    startGame(fresh) {
      this.state='playing';this.paused=false;
      this.pets=[];this.monsters=[];this.projectiles=[];
      this.ui=new G.UI(this);
      this.input=new G.Input(this);
      this.systems=new G.Systems(this);
      // 村民
      this.npcs=DB.npcs.map(data=>new G.NPC(data));
      // 设置天气（读档时已在 loadGame 中恢复）
      this.world.weather=this.world.weather||'晴';
      this.world.weatherTimer=this.world.weatherTimer||0;
      // 生成初始怪物
      if(fresh)this.spawnInitialMonsters();
      else this.spawnInitialMonsters();
      // 初始化任务
      if(fresh){
        this.player.quests=[{id:'q_meet',progress:0,done:false},{id:'q_farm',progress:0,done:false},{id:'q_kill',progress:0,done:false}];
      }
      document.getElementById('titleScreen').classList.remove('active');
      document.getElementById('gameScreen').classList.add('active');
      this.checkQuests();
      this.ui.updateHUD();
      this.lastTime=performance.now();
      this.lastFrameAt=performance.now();
      // iframe 中面板尺寸在切换后才确定：重新测量并立即渲染，避免黑屏
      this.renderer.resize();
      this.render();
      setTimeout(()=>{ this.renderer.resize(); this.render(); }, 50);
      setTimeout(()=>{ this.renderer.resize(); this.render(); }, 300);
    }

    spawnInitialMonsters(){
      const w=this.world;
      // 地表夜间怪物
      for(let i=0;i<10;i++){
        const x=U.randInt(55,w.w-3)*16,y=U.randInt(60,w.h-3)*16;
        if(w.terrainWalkable(Math.floor(x/16),Math.floor(y/16)))this.spawnMonster(U.pick(['slime','slime','bat','mushroom_m']),x,y,0,'village');
      }
      // 矿洞怪物
      for(let lv=1;lv<=5;lv++){
        const ml=w.mineLevels[lv];
        if(!ml)continue;
        const count=4+lv*2;
        for(let i=0;i<count;i++){
          const rx=U.randInt(2,ml.w-3),ry=U.randInt(2,ml.h-3);
          if(ml.tiles[ry*ml.w+rx]!==G.T.CAVE_FLOOR)continue;
          const pool=lv<=1?['slime','bat']:lv<=2?['slime','bat','skeleton']:lv<=3?['bat','skeleton','ghost','mushroom_m']:['skeleton','ghost','fire_imp'];
          const type=U.pick(pool);
          this.spawnMonster(type,rx*16+8,ry*16+8,lv,'mine',lv);
        }
        if(lv===5)this.spawnMonster('void_lord',ml.start.x+80,ml.start.y-48,3,'mine',5);
        if(lv===3)this.spawnMonster('golem',ml.start.x+64,ml.start.y+32,2,'mine',3);
      }
    }

    spawnMonster(type,x,y,bonus=0,area='village',floor=1){
      const m=new G.Monster(type,x,y,bonus,floor);
      m.area=area;
      this.monsters.push(m);
      return m;
    }

    loop(t) {
      const dt=Math.min(.05,Math.max(0,(t-this.lastTime)/1000));
      this.lastTime=t;
      this.lastFrameAt=performance.now();
      this.dt=dt;
      this.step(dt);
      this.rafId=requestAnimationFrame(tt=>this.loop(tt));
    }

    step(dt){
      if(this.state==='title'){this.animateTitle(dt);}
      else if(this.state==='playing'&&!this.paused){this.update(dt);this.render();}
      else if(this.state==='playing'&&this.paused){this.render();}
    }

    // 看门狗：rAF 在部分 iframe/后台环境会被暂停，用定时器兜底驱动
    startWatchdog(){
      if(this.watchdogId)return;
      this.watchdogId=setInterval(()=>{
        if(this.state!=='playing')return;
        const now=performance.now();
        // rAF 超过 250ms 没推进 => 手动补一帧
        if(!this.lastFrameAt||now-this.lastFrameAt>250){
          this.lastFrameAt=now;
          this.step(1/30);
        }
      },100);
    }

    animateTitle(dt){
      this.titleTime+=dt;
      const ctx=this.titleCtx,W=this.titleW,H=this.titleH;
      // 重绘星空的闪烁 & 萤火虫
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle='#1a2a44';ctx.fillRect(0,0,W,H);
      for(let i=0;i<80;i++){const b=U.hash(i,1,3);ctx.fillStyle=b>.7?'#fff':'#7aa0c8';ctx.globalAlpha=.5+.5*Math.sin(this.titleTime*2+i);ctx.fillRect(U.randInt(0,W),Math.floor(U.hash(i,2,3)*80),1,1);}
      ctx.globalAlpha=1;
      ctx.fillStyle='#f8e8a0';ctx.beginPath();ctx.arc(150,30,14,0,6.3);ctx.fill();
      ctx.fillStyle='#1a2a44';ctx.beginPath();ctx.arc(156,26,12,0,6.3);ctx.fill();
      for(let x=0;x<W;x++){const h=70+Math.sin(x*.05)*12+Math.sin(x*.13)*6;ctx.fillStyle='#2a3a4a';ctx.fillRect(x,H-h,1,h);}
      ctx.fillStyle='#233340';for(let x=0;x<W;x++){const h=88+Math.sin(x*.04+2)*8;ctx.fillRect(x,H-h,1,h);}
      ctx.fillStyle='#2a5a30';ctx.fillRect(0,110,W,40);
      ctx.fillStyle='#356a38';for(let i=0;i<300;i++)ctx.fillRect(U.randInt(0,W),U.randInt(110,H),1,1);
      ctx.fillStyle='#d8b888';ctx.fillRect(80,86,36,24);ctx.fillStyle='#a04040';ctx.fillRect(76,78,44,9);ctx.fillRect(82,72,32,7);
      ctx.fillStyle='#8a6238';ctx.fillRect(96,96,8,14);ctx.fillStyle='#f8d860';ctx.fillRect(84,92,8,7);ctx.fillRect(106,92,8,7);
      [24,52,170].forEach(tx=>{ctx.fillStyle='#5a4028';ctx.fillRect(tx,92,4,18);ctx.fillStyle='#2e6e32';ctx.fillRect(tx-8,72,20,22);ctx.fillStyle='#3e8e3e';ctx.fillRect(tx-5,75,12,12);});
      this.fireflies.forEach(f=>{f.p+=dt;ctx.fillStyle='#e8e860';ctx.globalAlpha=.4+.6*Math.sin(f.p*3);ctx.fillRect(f.x+Math.sin(f.p)*4,f.y+Math.cos(f.p*.7)*4,2,2);});
      ctx.globalAlpha=1;
    }

    update(dt) {
      const p=this.player,w=this.world;
      // 输入
      this.input.update();
      // 时间推进：现实 1 秒 = 游戏 1 分钟（白天快一点）
      this.systems.advanceTime(dt * (this.gameTime>20*60||this.gameTime<6*60?1:1.2) * this.timeScale);
      this.weatherTick+=dt*60;
      // 钓鱼
      this.systems.updateFishing(dt);
      // 实体
      p.update(dt,this);
      this.npcs.forEach(n=>n.update(dt,this));
      this.pets.forEach(pet=>pet.update(dt,this));
      this.monsters.forEach(m=>{if(m.area===this.area&&m.floor===this.mineLevel)m.update(dt,this);});
      this.monsters=this.monsters.filter(m=>!m.dead);
      this.projectiles.forEach(pr=>{
        pr.update(dt);
        // 命中怪物
        if(pr.owner==='player')for(const m of this.monsters){
          if(m.dead||m.area!==this.area)continue;
          if(U.dist(pr.x,pr.y,m.x,m.y)<12){m.hurt(pr.damage,{x:Math.sign(pr.vx),y:Math.sign(pr.vy)});pr.dead=true;if(m.dead)this.systems.onMonsterDead(m);break;}
        }
      });
      this.projectiles=this.projectiles.filter(pr=>!pr.dead);
      G.particles.update(dt);
      // 天气变化
      w.weatherTimer=(w.weatherTimer||0)+dt;
      if(w.weatherTimer>120){
        w.weatherTimer=0;
        const pool=w.season===3?['晴','多云','雪','雪','雾']:w.season===1?['晴','晴','雷雨','多云']:['晴','晴','多云','雨'];
        w.weather=U.pick(pool);
      }
      // 怪物刷新（矿洞）
      this.spawnMonsterTimer-=dt;
      if(this.spawnMonsterTimer<=0){
        this.spawnMonsterTimer=20;
        const alive=this.monsters.filter(m=>m.area===this.area&&m.floor===this.mineLevel).length;
        const cap=this.area==='village'?6:10;
        if(alive<cap&&(this.area!=='village'||this.gameTime>19*60||this.gameTime<6*60)){
          const x=p.x+U.rand(-200,200),y=p.y+U.rand(-160,160);
          if(this.isBlocked(x,y,p)===false){
            const pool=this.area==='village'?['slime','bat']:this.mineLevel<=2?['slime','bat','skeleton']:['bat','skeleton','ghost','fire_imp','mushroom_m'];
            this.spawnMonster(U.pick(pool),x,y,this.mineLevel-1,this.area,this.mineLevel);
          }
        }
      }
      // 自动存档（每 60 秒）
      this.autoSaveTimer+=dt;
      if(this.autoSaveTimer>60){this.autoSaveTimer=0;this.save(true);}
      // HUD 每 6 帧更新一次
      this.hudTick=(this.hudTick||0)+1;
      if(this.hudTick%6===0)this.ui.updateHUD();
    }

    render(){this.renderer.draw(this);}

    // ---------- 碰撞 / 交互 ----------
    isBlocked(x,y,entity) {
      const w=this.world;
      // 当前地图碰撞
      let mapW,mapH,tiles,objs;
      const isMine=this.area!=='village';
      if(isMine&&w.mineLevels[this.mineLevel]){
        const ml=w.mineLevels[this.mineLevel];mapW=ml.w;mapH=ml.h;tiles=ml.tiles;objs=ml.objects;
        const tx=Math.floor(x/16),ty=Math.floor(y/16);
        if(tx<0||ty<0||tx>=mapW||ty>=mapH)return true;
        if(tiles[ty*mapW+tx]===G.T.WALL)return true;
        for(const o of objs){if(!o.dead&&o.solid&&Math.abs(o.x-tx)<1&&Math.abs(o.y-ty)<1)return true;}
        return false;
      }
      const tx=Math.floor(x/16),ty=Math.floor(y/16);
      if(!w.inBounds(tx,ty))return true;
      if(w.isWater(tx,ty))return true;
      // 建筑等
      for(const o of w.objects){
        if(o.dead||!o.solid||o.passable)continue;
        if(o.building){
          if(x>o.x*16+2&&x<(o.x+o.w)*16-2&&y>o.y*16+2&&y<(o.y+o.h)*16-2)return true;
        } else if(Math.abs(o.x-tx)<1&&Math.abs(o.y-ty)<1)return true;
      }
      return false;
    }

    enterPortal(portal){
      const p=this.player;
      G.Audio.play('door');
      if(portal.from){this.area='village';}
      else {
        this.area=portal.to;
        if(portal.to==='mine')this.mineLevel=1;
      }
      const spots={
        village:[32*16,34*16],
        mine:[this.world.mineLevels[1].start.x,this.world.mineLevels[1].start.y],
        forest:[89*16,42*16],lake:[13*16,100*16],snow:[32*16,12*16],beach:[66*16,116*16],
      };
      const s=spots[this.area]||spots.village;
      p.x=s[0];p.y=s[1];
      this.renderer.camX=p.x-this.renderer.vw/2;this.renderer.camY=p.y-this.renderer.vh/2;
      G.toast(`来到了 ${({village:'星野村',mine:'幽暗矿洞',forest:'枫叶森林',lake:'星落湖畔',snow:'霜雪高地',beach:'南湾海滩'})[this.area]}`);
      G.particles.burst(p.x,p.y,'#b060d0',16,60,3,0);
    }

    enterStairs(obj){
      const p=this.player;
      G.Audio.play('door');
      if(obj.type==='exit'){
        this.area='village';p.x=52*16;p.y=18*16;
        G.toast('回到了地面');
      } else {
        this.mineLevel=obj.to;
        const ml=this.world.mineLevels[obj.to];
        if(!ml){G.toast('无法前往');return;}
        p.x=ml.start.x;p.y=ml.start.y;
        G.toast(`进入幽暗矿洞 B${obj.to} 层`);
        if(obj.to===5)this.systems.track('minelevel',5);
      }
      this.renderer.camX=p.x-this.renderer.vw/2;this.renderer.camY=p.y-this.renderer.vh/2;
      G.particles.burst(p.x,p.y,'#d8c8a0',14,50,3,0);
    }

    enterBuilding(b){
      const p=this.player;
      G.Audio.play('door');
      const name=b.name||'建筑';
      if(b.type==='shop'){
        this.ui.showShop('露西的杂货店',[
          ['seed_turnip',20],['seed_carrot',30],['seed_potato',25],['seed_tomato',40],['seed_corn',45],['seed_pumpkin',60],['seed_wheat',15],['seed_strawberry',50],['seed_blueberry',55],
          ['potion_hp',120],['potion_mp',100],['potion_st',80],['bread',50],['fishing',300],['hoe',150],['axe',150],['pickaxe',200],['watering',120],
        ]);
      } else if(b.type==='smith'){
        this.ui.showShop('马库斯铁匠铺',[['sword',400],['steelsword',900],['copper',60],['iron',120],['coal',35],['slingshot',250]]);
      } else if(b.type==='tavern'){
        this.ui.showShop('露比酒馆',[['soup',90],['cake',200],['bread',50],['milk',60]]);
      } else if(b.type==='clinic'){
        this.ui.showShop('玛丽诊所',[['potion_hp',100],['potion_mp',90],['elixir',500],['sage',50]]);
      } else if(b.type==='barn'){
        this.ui.showDialogue('谷仓','这里可以领养宠物。打开「人际」面板领养吧！');
      } else if(b.type==='house'&&name==='你的小屋'){
        this.ui.showDialogueQueue([
          {name:'你的小屋',text:'这里温馨而整洁。桌子上放着一封未拆的信……'},
          {name:'信件',text:'「亲爱的星野：如果你看到这封信，说明你已经开始了自己的旅程。记住，生活不只是种田和战斗，还有诗和远方。—— 之前的冒险者」'},
        ]);
      } else {
        const npc=this.npcs.find(n=>b.x<=n.home[0]&&n.home[0]<b.x+b.w&&b.y<=n.home[1]&&n.home[1]<b.y+b.h);
        if(npc)this.systems.talk(npc);
        else this.ui.showDialogue(name,'这里暂时没有人。');
      }
    }

    openChest(obj){
      if(obj.opened)return;
      obj.opened=true;
      G.Audio.play('coin');
      const loot=obj.loot||[{id:'gold',n:0}];
      // gold 作为货币处理
      let msg=[];
      loot.forEach(l=>{
        if(l.id==='gold'){this.player.money+=l.n;msg.push(`${l.n} G`);}
        else{this.player.addItem(l.id,l.n);msg.push(`${DB.item(l.id).name}×${l.n}`);}
      });
      G.particles.burst(obj.x*16,obj.y*16,'#e8c840',20,70,3,0);
      this.ui.showDialogue('宝箱','你打开了宝箱！获得：'+msg.join('、'));
    }

    checkQuests(){
      // 任务完成时弹出提示（已由 systems.track 处理）
    }

    onNewDay(){
      const p=this.player;
      p.talkedToday={};
      p.stamina=p.maxStamina;p.mana=p.maxMana;p.hp=p.maxHp;
      G.toast(`☀ 新的一天开始了！第 ${this.world.year} 年 ${C.SEASONS[this.world.season]} ${this.world.day} 日`);
      // 更新天气
      this.world.weather=U.pick(this.world.season===3?['晴','雪','雪','雾']:['晴','晴','多云','雨']);
      // 村民重置位置
      this.npcs.forEach(n=>{n.x=n.homeX;n.y=n.homeY;});
      this.save(true);
    }

    togglePause(){
      this.paused=!this.paused;
      if(this.paused){this.save(true);G.toast('游戏已暂停并保存');}
      else G.toast('继续游戏');
    }

    save(silent){
      const d={world:this.world.serialize(),player:this.player.serialize(),gameTime:this.gameTime,area:this.area,mineLevel:this.mineLevel,weather:this.world.weather,weatherTimer:this.world.weatherTimer,version:1};
      U.save('save',d);
      if(!silent)G.toast('游戏已保存');
    }
  }

  // 全局辅助
  G.toast=function(msg){
    const area=document.getElementById('toastArea');
    if(!area)return;
    const d=document.createElement('div');d.className='toast';d.textContent=msg;
    area.appendChild(d);
    setTimeout(()=>d.remove(),3100);
  };
  G.dialogue=function(name,text){
    if(G.game&&G.game.ui)G.game.ui.showDialogue(name,text);
  };

  function boot() {
    try {
      if (G.game) return;
      G.game = new Game();
      window.G = G;
    } catch (e) {
      console.error('星野物语启动失败:', e);
      // 兜底：即使初始化失败，也让标题画面可见并给出提示
      const hint = document.createElement('div');
      hint.style.cssText = 'position:absolute;top:8%;left:0;right:0;text-align:center;color:#f5e6c8;font-size:14px;z-index:99';
      hint.textContent = '初始化遇到问题：' + e.message;
      document.getElementById('titleScreen').appendChild(hint);
    }
  }
  window.G = G;
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot);
  } else {
    // DOM 已就绪（预览/注入环境常见），立即启动
    boot();
  }
})(window);
