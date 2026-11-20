/* ============================================================
 * 星野物语 — UI：HUD / 背包 / 制作 / 技能 / 社交 / 任务 / 商店 / 地图
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C, DB = G.DB;

  class UI {
    constructor(game) {
      this.game = game;
      this.panelOpen = false;
      this.dialogueOpen = false;
      this.tab = 'inventory';
      this.dialogueQueue = [];
      this.setupTabs();
      this.buildToolbar();
    }

    setupTabs() {
      document.querySelectorAll('.tab').forEach(btn=>{
        btn.addEventListener('click',()=>this.switchTab(btn.dataset.tab));
      });
      document.getElementById('panelContent').addEventListener('click',e=>{
        const act=e.target.dataset.act;
        if(!act)return;
        this.handleAction(act, e.target.dataset);
      });
    }

    buildToolbar() {
      const bar=document.getElementById('toolbar');
      bar.innerHTML='';
      for(let i=0;i<12;i++){
        const d=document.createElement('div');
        d.className='slot'+(i===0?' selected':'');d.dataset.i=i;
        d.innerHTML=`<span class="key">${i<9?i+1:''}</span><span class="qty"></span>`;
        bar.appendChild(d);
      }
    }

    updateToolbar() {
      const p=this.game.player;
      document.querySelectorAll('#toolbar .slot').forEach((el,i)=>{
        el.classList.toggle('selected',i===p.selected);
        const slot=p.inventory[i];
        const icon=el.querySelector('canvas');
        if(icon)icon.remove();
        const qty=el.querySelector('.qty');
        if(slot){
          const c=G.game.renderer.iconCache[slot.id]?this.copyIcon(G.game.renderer.iconCache[slot.id]):document.createElement('canvas');
          c.width=24;c.height=24;
          if(!G.game.renderer.iconCache[slot.id])this.drawFallback(c.getContext('2d'),slot.id);
          el.insertBefore(c,qty);
          qty.textContent=slot.n>1?slot.n:'';
        } else qty.textContent='';
      });
    }
    copyIcon(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c;}
    drawFallback(ctx,id){ctx.fillStyle=DB.item(id).color;ctx.fillRect(4,4,16,16);}

    updateHUD() {
      const g=this.game,p=g.player,w=g.world;
      const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
      set('hpText',`${Math.ceil(p.hp)}/${p.maxHp}`);
      set('staminaText',`${Math.ceil(p.stamina)}/${p.maxStamina}`);
      set('manaText',`${Math.ceil(p.mana)}/${p.maxMana}`);
      document.getElementById('hpBar').style.width=(p.hp/p.maxHp*100)+'%';
      document.getElementById('staminaBar').style.width=(p.stamina/p.maxStamina*100)+'%';
      document.getElementById('manaBar').style.width=(p.mana/p.maxMana*100)+'%';
      set('money',p.money);
      set('clock',`第 ${w.year} 年 ${C.SEASONS[w.season]} ${w.day} 日 ${U.fmtTime(g.gameTime)}`);
      set('weather',({晴:'☀ 晴',多云:'⛅ 多云',雨:'🌧 雨',雷雨:'⛈ 雷雨',雪:'❄ 雪',雾:'🌫 雾'})[w.weather||'晴']);
      set('location',g.area==='village'?'星野村':({mine:`幽暗矿洞 B${g.mineLevel}`,forest:'枫叶森林',lake:'星落湖畔',snow:'霜雪高地',beach:'南湾海滩'})[g.area]);
      for(const k in p.skills)set('lv'+k[0].toUpperCase()+k.slice(1),p.skills[k]);
      // 任务追踪
      const active=p.quests.filter(q=>!q.done&&!q.claimed).slice(0,3);
      const tracker=document.getElementById('questTracker');
      if(active.length){
        tracker.innerHTML='<h4>📜 当前任务</h4>'+active.map(q=>{
          const t=G.QUEST_TEMPLATES.find(t=>t.id===q.id);
          return `<div>${t.title} ${Math.min(q.progress,t.need)}/${t.need}</div>`;
        }).join('');
      } else tracker.innerHTML='';
      this.updateToolbar();
    }

    showDialogue(name,text) {
      this.dialogueOpen=true;
      this.dialogueQueue=[{name,text}];
      document.getElementById('dialogueBox').classList.remove('hidden');
      this.renderDialogue();
    }
    showDialogueQueue(lines) {
      this.dialogueOpen=true;
      this.dialogueQueue=lines;
      document.getElementById('dialogueBox').classList.remove('hidden');
      this.renderDialogue();
    }
    renderDialogue(){
      const line=this.dialogueQueue[0];
      if(!line){this.closeDialogue();return;}
      document.getElementById('dialogueName').textContent=line.name;
      document.getElementById('dialogueText').textContent=line.text;
    }
    nextDialogue(){
      this.dialogueQueue.shift();
      if(this.dialogueQueue.length)this.renderDialogue();
      else this.closeDialogue();
    }
    closeDialogue(){
      this.dialogueOpen=false;
      document.getElementById('dialogueBox').classList.add('hidden');
      this.dialogueQueue=[];
    }

    togglePanel(tab){
      if(this.panelOpen&&this.tab===tab){this.closePanel();return;}
      this.openPanel(tab);
    }
    switchTab(tab){this.tab=tab;this.openPanel(tab);}
    openPanel(tab){
      this.panelOpen=true;this.tab=tab;
      document.getElementById('menuPanel').classList.remove('hidden');
      document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
      this.renderPanel();
    }
    closePanel(){
      this.panelOpen=false;
      document.getElementById('menuPanel').classList.add('hidden');
    }

    renderPanel(){
      const el=document.getElementById('panelContent');
      const p=this.game.player;
      let html='';
      switch(this.tab){
        case 'inventory':{
          html=`<h3>🎒 背包 (${p.inventory.length}/24)</h3><p style="color:#a29270;font-size:11px">点击物品使用 · 当前选中：第 ${p.selected+1} 格</p><div class="item-grid">`;
          if(p.inventory.length===0)html+='<p>背包空空的，去探索吧！</p>';
          p.inventory.forEach((s,i)=>{
            const d=DB.item(s.id);
            html+=`<div class="item-card" data-act="use" data-i="${i}"><canvas width="24" height="24" data-icon="${s.id}"></canvas><div class="info"><b>${d.name}</b> ×${s.n}<div class="desc">${d.desc||''}</div></div>${d.price>0?`<button data-act="sell" data-id="${s.id}" data-n="${s.n}">出售 ${d.price}G</button>`:''}</div>`;
          });
          html+='</div>';
          break;
        }
        case 'craft':{
          html='<h3>🔨 制作台</h3><p style="color:#a29270;font-size:11px">收集材料，制作武器、药水与美食</p><div class="item-grid">';
          G.DB.recipes.forEach(r=>{
            const can=this.game.systems.canCraft(r);
            const need=Object.entries(r.need).map(([id,n])=>`${DB.item(id).name}×${n}(${p.countItem(id)})`).join(' ');
            html+=`<div class="item-card" style="${can?'':'opacity:.55'}"><canvas width="24" height="24" data-icon="${r.out}"></canvas><div class="info"><b>${r.name}</b><div class="desc">${need}</div><div class="desc">需要 ${G.SKILL_NAMES[r.skill]} Lv.${r.level}</div></div><button data-act="craft" data-id="${r.id}" ${can?'':'disabled'}>制作</button></div>`;
          });
          html+='</div>';
          break;
        }
        case 'skills':{
          html='<h3>⭐ 技能与成长</h3>';
          html+=`<p>等级 <b style="color:#e8b84b">${p.level}</b> · 经验 ${p.xp}/${p.xpNext} · 生命 ${p.maxHp} · 魔力 ${p.maxMana}</p>`;
          for(const k of ['farming','combat','mining','fishing','foraging','cooking']){
            const lv=p.skills[k],need=p.skillLevelNeed(lv),xp=p.skillXp[k]||0;
            html+=`<div class="skill-line"><span style="width:64px">${G.SKILL_NAMES[k]} Lv.${lv}</span><div class="pbar"><div style="width:${Math.min(100,xp/need*100)}%"></div></div><span style="width:60px;font-size:11px">${xp}/${need}</span></div>`;
          }
          html+=`<h4>📊 统计</h4><p>行走 ${p.stats.steps} 步 · 击败怪物 ${p.stats.kills} · 收获 ${p.stats.harvested} · 钓鱼 ${p.stats.fishCaught} · 挖掘 ${p.stats.mined}</p>`;
          html+=`<h4>👨‍👩‍👧 家庭</h4><p>伴侣：${p.spouse?DB.npcs.find(n=>n.id===p.spouse).name:'单身'} · 子女：${p.children.length||0}</p>`;
          break;
        }
        case 'social':{
          html='<h3>💕 人际关系</h3><p style="color:#a29270;font-size:11px">每天对话 +2 好感，赠送喜欢的礼物 +25。好感 60 可求婚（选中戒指后使用）</p>';
          DB.npcs.forEach(n=>{
            const f=p.friendship[n.id]||0,hearts=Math.min(10,Math.floor(f/20));
            html+=`<div class="npc-card"><b style="color:${n.color}">${n.name}</b> · ${n.role}　<span class="heart">${'❤'.repeat(hearts)}${'♡'.repeat(10-hearts)}</span> <span style="color:#888">(${f})</span><br><span style="font-size:11px;color:#a29270">喜欢：${n.likes.map(id=>DB.item(id).name).join('、')}</span><br><button data-act="gift" data-id="${n.id}" style="margin-top:6px;font-family:inherit;background:#6b4a26;color:#fff;border:1px solid #000;padding:4px 10px;cursor:pointer">送礼（当前：${p.selectedItem()?DB.item(p.selectedItem().id).name:'无'}）</button></div>`;
          });
          html+='<h4>🐾 领养宠物（500 G）</h4>';
          [['dog','小狗 旺财'],['cat','小猫 糯米'],['bird','小鸟 小啾']].forEach(([id,name])=>{
            html+=`<button data-act="pet" data-id="${id}" style="font-family:inherit;background:#6b4a26;color:#fff;border:1px solid #000;padding:6px 12px;margin:4px;cursor:pointer">领养${name}</button>`;
          });
          break;
        }
        case 'quests':{
          html='<h3>📜 任务日志</h3>';
          html+='<h4>进行中</h4>';
          p.quests.filter(q=>!q.done).forEach(q=>{
            const t=G.QUEST_TEMPLATES.find(t=>t.id===q.id);
            if(!t)return;
            html+=`<div class="quest-card"><b>${t.title}</b><br>${t.desc}<br>进度：${Math.min(q.progress,t.need)}/${t.need}　奖励：${t.reward.money||0}G / ${t.reward.xp||0}XP</div>`;
          });
          if(!p.quests.some(q=>!q.done))html+='<p>暂无进行中的任务</p>';
          html+='<h4>可接取</h4>';
          G.QUEST_TEMPLATES.filter(t=>!p.quests.some(q=>q.id===t.id)).forEach(t=>{
            html+=`<div class="quest-card"><b>${t.title}</b> — ${t.desc}<br><button data-act="accept" data-id="${t.id}" style="font-family:inherit;background:#5a9e4b;color:#fff;border:1px solid #000;padding:4px 10px;cursor:pointer">接受</button></div>`;
          });
          html+='<h4>已完成</h4>';
          p.quests.filter(q=>q.done).forEach(q=>{
            const t=G.QUEST_TEMPLATES.find(t=>t.id===q.id);
            if(t)html+=`<div class="quest-card done"><b>${t.title}</b> ✓</div>`;
          });
          break;
        }
        case 'options':{
          html='<h3>⚙ 设置</h3>';
          html+=`<div class="setting-row"><label><input type="checkbox" id="optSound" ${G.Audio.isEnabled()?'checked':''}> 音乐与音效</label></div>`;
          html+=`<div class="setting-row"><button data-act="save" style="font-family:inherit;background:#6b4a26;color:#fff;border:2px solid #000;padding:8px 16px;cursor:pointer">💾 立即存档</button></div>`;
          html+=`<div class="setting-row"><button data-act="reset" style="font-family:inherit;background:#8a3020;color:#fff;border:2px solid #000;padding:8px 16px;cursor:pointer">重新开始（清空存档）</button></div>`;
          html+='<h4>ℹ 关于</h4><p>星野物语 — 一个完全程序化生成的像素沙盒生活 RPG。<br>种田、钓鱼、挖矿、打怪、恋爱、养宠、探索四季。<br>你的故事，由你自己书写。</p>';
          break;
        }
      }
      el.innerHTML=html;
      // 绘制图标
      el.querySelectorAll('canvas[data-icon]').forEach(cv=>{
        const src=G.game.renderer.iconCache[cv.dataset.icon];
        if(src)cv.getContext('2d').drawImage(src,0,0);
        else{const cx=cv.getContext('2d');cx.fillStyle=DB.item(cv.dataset.icon).color;cx.fillRect(4,4,16,16);}
      });
      const sound=document.getElementById('optSound');
      if(sound)sound.addEventListener('change',()=>{G.Audio.setEnabled(sound.checked);U.save('settings',{sound:sound.checked});});
    }

    handleAction(act,d){
      const g=this.game,p=g.player;
      switch(act){
        case 'use':{
          const i=Number(d.i);p.selected=i;this.game.systems.useItem(i);this.renderPanel();break;
        }
        case 'sell':{
          const id=d.id,n=Number(d.n);
          p.removeItem(id,n);p.money+=DB.item(id).price*n;
          G.Audio.play('coin');G.toast(`出售 ${DB.item(id).name}×${n}，获得 ${DB.item(id).price*n}G`);
          g.systems.track('earn',DB.item(id).price*n);g.checkQuests();this.renderPanel();break;
        }
        case 'craft':{
          const r=G.DB.recipes.find(r=>r.id===d.id);
          if(r&&g.systems.craft(r))this.renderPanel();break;
        }
        case 'gift':{
          const npc=g.npcs.find(n=>n.id===d.id);
          if(npc){g.systems.gift(npc);this.renderPanel();}break;
        }
        case 'pet':{g.systems.adoptPet(d.id);this.renderPanel();break;}
        case 'accept':{g.systems.acceptQuest(d.id);this.renderPanel();break;}
        case 'save':{g.save();G.toast('游戏已保存');break;}
        case 'reset':{
          if(confirm('确定要清空存档重新开始吗？')){localStorage.removeItem('starfield_save');location.reload();}
          break;
        }
      }
    }

    showShop(name,items){
      const p=this.game.player;
      let html=`<h3>🏪 ${name}</h3><p style="color:#a29270;font-size:11px">你的金币：<b style="color:#e8b84b">${p.money} G</b></p><div class="item-grid">`;
      items.forEach(([id,price])=>{
        const d=DB.item(id);
        html+=`<div class="item-card"><canvas width="24" height="24" data-icon="${id}"></canvas><div class="info"><b>${d.name}</b><div class="desc">${d.desc}</div></div><button data-act="buy" data-id="${id}" data-price="${price}">${price} G</button></div>`;
      });
      html+='<div class="item-card" style="grid-column:1/-1"><div class="info"><b>💰 出售背包中的物品</b></div><button data-act="sellall">全部出售</button></div>';
      html+='</div>';
      const el=document.getElementById('panelContent');
      el.innerHTML=html;
      el.querySelectorAll('canvas[data-icon]').forEach(cv=>{
        const src=G.game.renderer.iconCache[cv.dataset.icon];
        if(src)cv.getContext('2d').drawImage(src,0,0);
      });
      el.querySelectorAll('[data-act="buy"]').forEach(b=>b.onclick=()=>{
        const id=b.dataset.id,price=Number(b.dataset.price);
        if(p.money<price){G.toast('金币不足');return;}
        p.money-=price;p.addItem(id,1);G.Audio.play('coin');G.toast(`购买了 ${DB.item(id).name}`);
        this.showShop(name,items);
      });
      el.querySelector('[data-act="sellall"]').onclick=()=>{this.game.systems.sellAll();this.showShop(name,items);};
      this.panelOpen=true;
      document.getElementById('menuPanel').classList.remove('hidden');
    }

    showMap(){
      const g=this.game,w=g.world;
      const cv=document.createElement('canvas');cv.width=240;cv.height=240;
      const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
      const scale=240/Math.max(w.w,w.h);
      for(let y=0;y<w.h;y+=1)for(let x=0;x<w.w;x+=1){
        const t=w.get(x,y);
        ctx.fillStyle=({0:'#5a9e4b',1:'#4a8a3f',2:'#9a7048',3:'#7a4e2c',4:'#3878b8',5:'#e0d0a0',6:'#8a8a8a',7:'#b09868',8:'#a07848',9:'#e8f0f8',10:'#3a6e38',11:'#5a5050',12:'#8a6238',13:'#a8c840',14:'#989080',15:'#3a3636',16:'#d84020'})[t]||'#5a9e4b';
        ctx.fillRect(x*scale,y*scale,Math.ceil(scale),Math.ceil(scale));
      }
      // 玩家
      ctx.fillStyle='#ff4040';ctx.fillRect(g.player.x/16*scale-2,g.player.y/16*scale-2,5,5);
      // 村民
      ctx.fillStyle='#ffd040';g.npcs.forEach(n=>ctx.fillRect(n.x/16*scale-1,n.y/16*scale-1,3,3));
      // 传送点
      ctx.fillStyle='#b060d0';w.portals.filter(p=>!p.from).forEach(p=>ctx.fillRect(p.x*scale-2,p.y*scale-2,5,5));
      // 弹出
      const win=window.open('','_blank');
      if(win){win.document.write(`<title>星野村地图</title><body style="background:#1a140c;color:#f5e6c8;text-align:center;font-family:sans-serif;padding:20px"><h2>🗺 星野村地图</h2><p>红点=你 黄点=村民 紫点=传送门</p>`);win.document.body.appendChild(cv);win.document.write('</body>');}
      else G.toast('请允许弹出窗口查看地图');
    }

    showHelp(){
      document.getElementById('helpScreen').classList.add('active');
      document.getElementById('gameScreen').classList.remove('active');
      this.game.paused=true;
    }
  }

  G.UI = UI;
})(window);
