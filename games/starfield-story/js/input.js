/* ============================================================
 * 星野物语 — 输入处理
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U;

  class Input {
    constructor(game) {
      this.game = game;
      this.keys = {};
      this.pressed = {};
      this.mouse = { x:0, y:0, left:false, right:false, leftPressed:false, rightPressed:false };
      this.wheel = 0;
      this.setup();
    }

    setup() {
      window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if (['arrowup','arrowdown','arrowleft','arrowright',' ','tab'].includes(k)) e.preventDefault();
        // 阻断浏览器快捷键
        if (['1','2','3','4','5','6','7','8','9','0'].includes(k) && e.metaKey) return;
      });
      window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });

      const cv = document.getElementById('gameCanvas');
      cv.addEventListener('mousemove', e => {
        const r = cv.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) / r.width * G.game.renderer.vw;
        this.mouse.y = (e.clientY - r.top) / r.height * G.game.renderer.vh;
      });
      cv.addEventListener('mousedown', e => {
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
        if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
        G.Audio.init();
      });
      window.addEventListener('mouseup', e => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive:false });

      // 点击快捷栏
      document.getElementById('toolbar').addEventListener('click', e => {
        const slot = e.target.closest('.slot');
        if (slot) { this.game.player.selected = Number(slot.dataset.i); this.game.ui.updateToolbar(); }
      });
    }

    isDown(k) { return !!this.keys[k]; }
    wasPressed(k) { return !!this.pressed[k]; }
    consume(k) { this.pressed[k] = false; }

    update() {
      const g = this.game, p = g.player;
      if (g.state !== 'playing' || g.ui.dialogueOpen || g.ui.panelOpen) {
        // 菜单中的输入
        if (this.wasPressed('escape') || this.wasPressed('tab')) {
          if (g.ui.dialogueOpen) g.ui.closeDialogue();
          else if (g.ui.panelOpen) g.ui.closePanel();
          else if (g.state==='playing') g.ui.togglePanel('inventory');
        }
        if (g.ui.panelOpen) {
          if (this.wasPressed('i')) g.ui.closePanel();
          if (this.wasPressed('c')) g.ui.switchTab('craft');
          if (this.wasPressed('q')) g.ui.switchTab('quests');
        }
        this.pressed = {};
        this.mouse.leftPressed = false; this.mouse.rightPressed = false; this.wheel = 0;
        return;
      }

      // --- 移动 ---
      let dx = 0, dy = 0;
      if (this.isDown('w') || this.isDown('arrowup')) dy -= 1;
      if (this.isDown('s') || this.isDown('arrowdown')) dy += 1;
      if (this.isDown('a') || this.isDown('arrowleft')) dx -= 1;
      if (this.isDown('d') || this.isDown('arrowright')) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len; dy /= len;
        const running = this.isDown('shift');
        const speed = (running ? 96 : 60) * (p.stamina > 5 ? 1 : .6);
        if (running && p.stamina > 2) p.stamina = Math.max(0, p.stamina - .02);
        if (!g.isBlocked(p.x + dx * speed * g.dt, p.y, p)) p.x += dx * speed * g.dt;
        if (!g.isBlocked(p.x, p.y + dy * speed * g.dt, p)) p.y += dy * speed * g.dt;
        p.dir = U.dir8(dx, dy);
        p.stats.steps++;
        if (Math.random() < g.dt * (running?4:2)) G.Audio.play('step');
        g.footstepTimer += g.dt;
      } else g.footstepTimer = 0;

      // --- 动作 ---
      if (this.wasPressed('j') || this.mouse.leftPressed) this.actionPrimary();
      if (this.wasPressed('k') || this.mouse.rightPressed) this.actionSecondary();
      if (this.wasPressed('f')) this.actionPlace();
      if (this.wasPressed(' ')) this.actionSpace();
      if (this.wasPressed('e')) this.actionInteract();
      if (this.wasPressed('i') || this.wasPressed('tab')) g.ui.togglePanel('inventory');
      if (this.wasPressed('c')) g.ui.togglePanel('craft');
      if (this.wasPressed('q')) g.ui.togglePanel('quests');
      if (this.wasPressed('p')) g.togglePause();
      if (this.wasPressed('m')) g.ui.showMap();
      if (this.wasPressed('h')) g.ui.showHelp();

      // 物品栏切换
      for (let i=1;i<=9;i++) if (this.wasPressed(String(i))) { p.selected = i-1; g.ui.updateToolbar(); }
      if (this.wheel !== 0) {
        p.selected = (p.selected + this.wheel + 24) % 12;
        g.ui.updateToolbar();
      }

      this.pressed = {};
      this.mouse.leftPressed = false; this.mouse.rightPressed = false; this.wheel = 0;
    }

    actionPrimary() {
      const g = this.game, p = g.player;
      const sel = p.selectedItem();
      if (p.fishing) { g.systems.reelFish(); return; }
      // 鼠标点击时朝向鼠标
      if (this.mouse.leftPressed) {
        const r = g.renderer;
        const wx = this.mouse.x + r.camX, wy = this.mouse.y + r.camY;
        const dx = wx - p.x, dy = wy - p.y;
        if (Math.hypot(dx,dy) > 4) p.dir = U.dir8(dx,dy);
      }
      if (sel && G.DB.item(sel.id).type === 'seed') {
        const tx = Math.floor((p.x + (p.dir.includes('left')?-12:p.dir.includes('right')?12:0))/16);
        const ty = Math.floor((p.y + (p.dir.includes('up')?-12:p.dir.includes('down')?12:0))/16);
        if (g.systems.plant(tx,ty,sel)) p.actionTimer=.2;
        return;
      }
      const dirs = { left:[-1,0], right:[1,0], up:[0,-1], down:[0,1], 'up-left':[-1,-1], 'up-right':[1,-1], 'down-left':[-1,1], 'down-right':[1,1] };
      const d = dirs[p.dir] || [0,1];
      g.systems.attack(d[0], d[1], sel);
    }

    actionSecondary() {
      const g = this.game, p = g.player;
      // 靠近 NPC 则互动，否则使用选中物品
      const near = g.npcs.find(n => U.dist(n.x,n.y,p.x,p.y) < 26);
      if (near) { g.systems.talk(near); return; }
      if (p.selectedItem()) g.systems.useItem(p.selected);
    }

    actionPlace() {
      const g = this.game, p = g.player;
      const tx = Math.floor((p.x + (p.dir.includes('left')?-14:p.dir.includes('right')?14:0))/16);
      const ty = Math.floor((p.y + (p.dir.includes('up')?-14:p.dir.includes('down')?14:0))/16);
      // 收获优先
      if (g.world.cropAt(tx,ty) && g.systems.harvest(tx,ty)) return;
      // 交互物体
      const obj = g.world.objectAt(tx,ty);
      if (obj) {
        if (obj.type === 'bush') { g.systems.breakObject(obj); return; }
        if (obj.type === 'chest' && !obj.opened) { g.openChest(obj); return; }
        if (obj.type === 'sign') { g.ui.showDialogue('路标', obj.text); return; }
        if (obj.type === 'stairs' || obj.type === 'exit') { g.enterStairs(obj); return; }
        if (obj.type === 'portal') { g.enterPortal(obj); return; }
        if (obj.type === 'building') { g.enterBuilding(obj); return; }
        if ((obj.type === 'tree'||obj.type==='pine'||obj.type==='rock'||obj.type==='ore')) { g.systems.useTool(tx,ty,'pick'); return; }
      }
      // 收获作物
      const sel = p.selectedItem();
      if (sel && G.DB.item(sel.id).type === 'seed') g.systems.plant(tx,ty,sel);
    }

    actionSpace() {
      const g = this.game;
      if (g.ui.dialogueOpen) { g.ui.closeDialogue(); return; }
      // 跳跃效果（轻微位移）
      const p=g.player,p2=p;
      G.particles.burst(p.x,p.y+4,'#d8c8a0',4,30,2,100);
    }

    actionInteract() {
      const g=this.game,p=g.player;
      // 与最近村民对话
      const near=g.npcs.find(n=>U.dist(n.x,n.y,p.x,p.y)<30);
      if(near){g.systems.talk(near);return;}
      // 进入建筑
      const tx=Math.floor(p.x/16),ty=Math.floor(p.y/16);
      const obj=g.world.objectAt(tx,ty)||g.world.objectsNear(tx,ty,1).find(o=>o.type==='building');
      if(obj&&obj.type==='building'){g.enterBuilding(obj);return;}
      // 没有可交互对象时，执行放置/收获/播种
      this.actionPlace();
    }
  }

  G.Input = Input;
})(window);
