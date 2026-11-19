(() => {
  "use strict";

  const W = 480, H = 270, CAMP = {x:218,y:155};
  const GATES = [[40,105],[99,62],[212,54],[285,77],[386,96],[441,131],[396,199],[259,226],[112,214],[45,176]];
  const BORDER = [[39,102],[53,82],[98,59],[159,54],[211,49],[252,59],[278,54],[310,84],[378,88],[435,98],[449,128],[432,163],[407,177],[401,201],[348,215],[290,220],[266,233],[216,226],[179,217],[138,225],[113,214],[75,207],[44,188],[38,172],[42,142],[50,126]];
  const MONSTERS = {
    slime:{name:"苔露史莱姆",tag:"群聚",hp:12,speed:9.8,damage:8,r:5,xp:1,desc:"成群沿草径缓慢逼近。沿着怪群外侧移动，可以让飞刃连续命中。"},
    bat:{name:"暮翼蝙蝠",tag:"飞行",hp:10,speed:19,damage:7,r:5,xp:1,desc:"以弯曲的轨迹快速追击。侧向移动，在它贴近时冲刺拉开距离。"},
    skeleton:{name:"枯骨斥候",tag:"近战",hp:31,speed:12,damage:13,r:6,xp:2,desc:"披着残甲的林间斥候，耐打且擅长近战。冰晶减速能为你争取空间。"},
    shroom:{name:"绯伞菇灵",tag:"远程",hp:24,speed:8,damage:9,r:6,xp:2,desc:"停在远处喷射紫色孢子。绕过弹道，靠近后用自动武器反击。"},
    warden:{name:"荆冠守林者",tag:"首领",hp:350,speed:9.3,damage:20,r:11,xp:14,desc:"每次远征中会数次现身。地面红圈预示震击，保留冲刺穿过孢子弹幕。"}
  };
  const SKILLS = {
    blade:{name:"余烬飞刃",color:"amber",max:8,short:"自动追击最近的敌人",desc:"提升飞刃伤害与射速。达到 3、6 级时额外投出一把飞刃。"},
    dash:{name:"疾风步",color:"aqua",max:5,short:"向移动方向无敌冲刺",desc:"缩短冲刺冷却，延长少许无敌时间，更容易穿过怪群。"},
    orbit:{name:"环火精灵",color:"amber",max:6,short:"火灵环绕，灼烧近敌",desc:"召唤环绕自身的火灵，灼伤触碰的敌人。升级可强化火灵。"},
    frost:{name:"碎霜冰锥",color:"aqua",max:6,short:"冰锥贯穿并减速敌人",desc:"向远处射出穿透冰锥，使路径上的敌人减速。"},
    chain:{name:"跃动雷弧",color:"violet",max:6,short:"闪电在敌群间传导",desc:"周期性释放连锁闪电。升级提高伤害和传导次数。"},
    vigor:{name:"炽心护符",color:"amber",max:6,short:"提升生命上限并回血",desc:"生命上限增加 22，并立即恢复 32 点生命。"},
    magnet:{name:"引晶符石",color:"aqua",max:5,short:"扩大灵晶吸取范围",desc:"扩大灵晶吸取范围，并立刻牵引场上所有灵晶。"},
    haste:{name:"轻羽纹章",color:"aqua",max:5,short:"提升移速与攻击频率",desc:"移动速度提升 6%，自动武器的攻击间隔缩短。"},
    force:{name:"熔铸护手",color:"amber",max:7,short:"强化所有武器的伤害",desc:"所有武器的基础伤害加成提高 18%。"},
    feast:{name:"营地补给",color:"amber",max:Infinity,short:"立即恢复生命",desc:"恢复 40 点生命，并将附近灵晶吸至身边。"},
    ward:{name:"守望灵光",color:"aqua",max:Infinity,short:"获得短暂护盾",desc:"获得 9 秒守护，期间可以安全穿过怪群。"},
    ember:{name:"永燃余烬",color:"amber",max:Infinity,short:"永久强化本局伤害",desc:"本局所有武器额外获得 4% 伤害加成。"},
    cinderBurst:{name:"余火裂刃",art:"blade",color:"amber",max:1,recipe:{blade:4,force:2},short:"飞刃迸裂，灼伤附近敌人",desc:"每把飞刃首次命中时炸开余火，对附近其他敌人造成 40% 飞刃伤害。"},
    frostWave:{name:"寒潮冰环",art:"frost",color:"aqua",max:1,recipe:{frost:3,magnet:2},short:"冰锥碎裂，减速成群敌人",desc:"每支冰锥首次命中时释放冰环，减速附近其他敌人，并造成 30% 冰锥伤害。"},
    stormArc:{name:"雷火共鸣",art:"chain",color:"violet",max:1,recipe:{chain:3,orbit:2},short:"雷弧跳得更远，额外弹跳两次",desc:"雷弧的每次跳跃距离增加 12，并可额外跳跃两次。"}
  };
  const EVOLUTIONS = Object.keys(SKILLS).filter(id=>SKILLS[id].recipe);
  const UPGRADES = Object.keys(SKILLS).filter(id=>!SKILLS[id].recipe&&Number.isFinite(SKILLS[id].max));
  const TRIALS = {
    hold:{name:"守火试炼",goal:11,seconds:32,radius:21},
    shards:{name:"寻晶试炼",goal:3,seconds:34},
    hunt:{name:"猎印试炼",goal:3,seconds:42}
  };
  const ALTARS = [
    {x:124,y:141},{x:188,y:92},{x:307,y:121},
    {x:362,y:161},{x:282,y:200},{x:156,y:193}
  ];
  const MARKS = {
    cinder:{name:"余烬刻印",art:"blade",bonus:"所有武器伤害提高 12%。",unlock:"初始拥有"},
    rime:{name:"寒霜刻印",art:"frost",bonus:"携带 1 级碎霜冰锥进入森林。",unlock:"累计击败 120 只怪物"},
    solar:{name:"星火刻印",art:"orbit",bonus:"携带 1 级环火精灵进入森林。",unlock:"击败一名荆冠守林者"},
    storm:{name:"雷鸣刻印",art:"chain",bonus:"携带 1 级跃动雷弧进入森林。",unlock:"完成一次黎明远征"}
  };
  function unlockedMark(id,ledger) {
    if(id==="cinder")return true;
    if(id==="rime")return Object.keys(MONSTERS).reduce((a,k)=>a+(ledger[k]||0),0)>=120;
    if(id==="solar")return (ledger.warden||0)>0;
    return id==="storm"&&(ledger.dawns||0)>0;
  }
  function initialSkills(mark){
    const skills={blade:1,dash:1};
    const bonus={rime:"frost",solar:"orbit",storm:"chain"}[mark];
    if(bonus)skills[bonus]=1;
    return skills;
  }
  const WAVES = ["林间苏醒","暮翼来袭","枯骨巡游","孢子飞舞","林地合围","荆棘狂潮"];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const need = level => Math.floor(6+level*1.95+level*level*0.08);
  function rng(s) {
    let n=s.seed|0;
    n^=n<<13; n^=n>>>17; n^=n<<5;
    s.seed=n>>>0; return s.seed/4294967296;
  }
  function timeText(time) {
    const sec=Math.max(0,Math.floor(time));
    return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
  }
  function limitPosition(p) {
    let inside=false, best=Infinity, nearestX=p.x, nearestY=p.y;
    for(let i=0,j=BORDER.length-1;i<BORDER.length;j=i++) {
      const [ax,ay]=BORDER[i], [bx,by]=BORDER[j];
      if((ay>p.y)!==(by>p.y) && p.x<(bx-ax)*(p.y-ay)/(by-ay)+ax) inside=!inside;
      const dx=bx-ax,dy=by-ay;
      const t=clamp(((p.x-ax)*dx+(p.y-ay)*dy)/(dx*dx+dy*dy),0,1);
      const x=ax+t*dx,y=ay+t*dy,d=(x-p.x)**2+(y-p.y)**2;
      if(d<best){best=d;nearestX=x;nearestY=y;}
    }
    if(!inside){p.x=nearestX;p.y=nearestY;}
  }
  function stats(s) {
    const k=s.skills, haste=k.haste||0;
    return {damage:1+((s.mark||"cinder")==="cinder"?.12:0)+(k.force||0)*.18+(k.ember||0)*.04, speed:43*(1+haste*.06),
      interval:1/(1+haste*.073), reach:15+(k.magnet||0)*6,
      dashCd:3.6-(k.dash-1)*.39, maxHp:100+(k.vigor||0)*22};
  }
  function newTrials(nextAt) {
    return {nextAt,bag:[],lastKind:null,current:null,completed:0,rewardPending:false};
  }
  function makeRun(minutes,seed,mark="cinder") {
    const s={schema:1,mark,id:Date.now().toString(36)+"-"+(seed>>>0).toString(36),seed:(seed>>>0)||701,minutes,sec:0,wave:1,
      phase:"active",endless:false,dawnReached:false,finalDefeated:false,marks:0,level:1,xp:0,kills:0,crystals:0,
      species:{slime:0,bat:0,skeleton:0,shroom:0,warden:0},skills:initialSkills(mark),choices:[],rerolls:2,
      hero:{x:245,y:145,hp:100,dirX:1,dirY:0,flip:false,walking:false,immune:0,dash:0,dashCd:0,dashX:1,dashY:0,sinceHit:10},
      cool:{blade:.2,frost:.7,chain:1.5,spawn:1.8,event:72,space:.1,boss:0},nextId:6,
      mobs:[],shots:[],gems:[],fx:[],numbers:[],events:[],lastTip:0,healTick:0};
    addMob(s,"slime",172,122);
    addMob(s,"bat",336,110);
    addMob(s,"slime",298,177);
    drop(s,254,157,1); drop(s,266,160,1);drop(s,238,144,1);drop(s,233,137,1);
    s.trials=newTrials(65+rng(s)*13);
    return s;
  }
  function addMob(s,type,x,y,opts={}) {
    const m=MONSTERS[type], progress=s.sec/(s.minutes*60), r=rng(s);
    const strength=1+Math.min(progress,1)*2.05+Math.max(0,progress-1)*1.95;
    const elite=!!opts.elite;
    const hp=type==="warden" ? (opts.final?590:300)*(1+.95*progress):m.hp*strength*(elite?2.65:1)*(.92+r*.14);
    s.mobs.push({id:s.nextId++,type,x,y,hp,maxHp:hp,speed:m.speed*(.92+r*.2)*(1+Math.min(progress,1.7)*.28)*(elite?1.1:1),
      damage:m.damage*(1+Math.min(progress,2)*.38)*(elite?1.28:1),r:m.r+(elite?2:0),elite,final:!!opts.final,boss:type==="warden",
      anim:r*7,flip:false,hit:0,slow:0,orbitDelay:0,attack:2+r*2.4,wind:0,targetX:x,targetY:y,spawn:.35,
      trialId:opts.trialId});
  }
  function gate(s,minDist) {
    const options=GATES.filter(g=>Math.hypot(g[0]-s.hero.x,g[1]-s.hero.y)>minDist);
    const list=options.length?options:GATES, g=list[Math.floor(rng(s)*list.length)];
    return [g[0]+(rng(s)-.5)*12,g[1]+(rng(s)-.5)*8];
  }
  function addWaveMob(s) {
    const p=s.sec/(s.minutes*60), r=rng(s), w=s.wave%WAVES.length;
    let type="slime";
    if(s.sec>74 && r<(.12+(w===4?.22:0))) type="shroom";
    else if(s.sec>28 && r>.65-(w===3?.17:0)) type="skeleton";
    else if(r>.4-(w===2?.23:0)) type="bat";
    const [x,y]=gate(s,62);
    addMob(s,type,x,y,{elite:p>.18&&rng(s)<Math.min(.13,.025+p*.055)});
  }
  function drop(s,x,y,value,kind="gem",pull=false) {
    if(kind==="gem" && s.gems.length>=140) {
      let best=null,dist=Infinity;
      for(const g of s.gems) if(g.kind==="gem"&&distance(g,{x,y})<dist){best=g;dist=distance(g,{x,y});}
      if(best){best.value+=value;return;}
    }
    s.gems.push({id:s.nextId++,x,y,value,kind,pull,age:0,anim:rng(s)*6.28});
  }
  function effect(s,type,x,y,life,extra={}){s.fx.push({type,x,y,life,max:life,...extra});}
  function note(s,text){s.events.push({type:"notice",text});}
  function sound(s,name){s.events.push({type:"sound",name});}
  function textAt(s,x,y,text,color){s.numbers.push({x,y,text,color,life:.55,max:.55});}
  function hurtMob(s,m,damage,kind) {
    if(m.hp<=0)return;
    const crit=kind!=="orbit"&&rng(s)<.085;
    const actual=Math.round(damage*(crit?1.85:1)*(.94+rng(s)*.13));
    m.hp-=actual; m.hit=.105;
    if(kind==="frost")m.slow=2.45;
    if(s.numbers.length<18&&(crit||m.boss||rng(s)<.53))textAt(s,m.x+(rng(s)-.5)*5,m.y-m.r-8,String(actual),crit?"#ffd05f":kind==="frost"?"#a4faff":"#fff1c7");
    if(m.hp>0)return;
    s.kills++;s.species[m.type]++;
    const trial=s.trials?.current;
    if(trial?.phase==="active"&&trial.kind==="hunt"&&m.trialId===trial.id)trial.progress++;
    const base=MONSTERS[m.type].xp;
    if(m.boss){
      for(let i=0;i<9;i++)drop(s,m.x+(rng(s)-.5)*25,m.y+(rng(s)-.5)*18,3,"gem",true);
      drop(s,m.x,m.y,25,"heart",true);s.hero.hp=Math.min(stats(s).maxHp,s.hero.hp+12);
      if(m.final)s.finalDefeated=true;
      note(s,"守林者已击败 · 灵晶归集");sound(s,"bossDown");
    }else{
      drop(s,m.x,m.y,base*(m.elite?3:1));
      if(rng(s)<(m.elite?.18:.025) && s.gems.filter(g=>g.kind==="heart").length<7)drop(s,m.x+4,m.y+2,16,"heart");
    }
    effect(s,"burst",m.x,m.y-3,m.boss?.65:.27,{color:m.type==="slime"?"#79d599":m.type==="skeleton"?"#e0d6b4":"#bd8ad4",big:m.boss,seed:m.anim});
  }
  function hurtHero(s,amount,fromX,fromY) {
    const h=s.hero;if(h.immune>0||h.dash>0||s.phase!=="active")return;
    h.hp=Math.max(0,h.hp-amount);h.immune=.92;h.sinceHit=0;
    const dx=h.x-fromX,dy=h.y-fromY,d=Math.hypot(dx,dy)||1;
    h.x+=dx/d*4;h.y+=dy/d*4;limitPosition(h);
    effect(s,"hurt",h.x,h.y,.32);sound(s,"hurt");
    textAt(s,h.x,h.y-17,"−"+Math.ceil(amount),"#ff9f88");
    if(h.hp<=0){s.phase="dead";sound(s,"fall");}
  }
  function dash(s,dx,dy){
    const h=s.hero;if(s.phase!=="active"||h.dashCd>0)return false;
    const d=Math.hypot(dx,dy);
    h.dashX=d>.1?dx/d:h.dirX;h.dashY=d>.1?dy/d:h.dirY;
    h.dash=.19;h.dashCd=stats(s).dashCd;h.immune=Math.max(h.immune,.29+(s.skills.dash-1)*.025);
    effect(s,"dash",h.x,h.y,.26,{dx:h.dashX,dy:h.dashY});sound(s,"dash");return true;
  }
  function nearest(s,point,range,skip=[]) {
    let best=null,d=range;
    for(const m of s.mobs) {
      if(m.hp<=0||m.spawn>.2||skip.includes(m.id))continue;
      const x=distance(m,point);if(x<d){d=x;best=m;}
    }
    return best;
  }
  function shoot(s,kind,m,angle,st) {
    const h=s.hero,lv=s.skills[kind];
    const dx=m.x-h.x,dy=m.y-5-(h.y-6);
    const a=Math.atan2(dy,dx)+angle,v=kind==="blade"?139:107;
    s.shots.push({type:kind,x:h.x,y:h.y-6,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:kind==="frost"?1.7:1.32,
      power:(kind==="blade"?15+(lv-1)*5.0:13+lv*5)*st.damage,pierce:kind==="blade"?1+Math.floor(lv/4):2+Math.floor(lv/2),hits:[]});
  }
  function orbiters(s) {
    const level=s.skills.orbit||0;if(!level)return [];
    const count=1+Math.floor(level/2),points=[];
    for(let i=0;i<count;i++){
      const a=s.sec*(2.15+.11*level)+i*Math.PI*2/count,rr=23+level*.75;
      points.push({x:s.hero.x+Math.cos(a)*rr,y:s.hero.y-4+Math.sin(a)*rr*.85,a});
    }
    return points;
  }
  function weapons(s,dt,st) {
    const c=s.cool,k=s.skills,h=s.hero;
    c.blade-=dt;c.frost-=dt;c.chain-=dt;
    if(c.blade<=0) {
      const m=nearest(s,h,124);c.blade=.12;
      if(m){const count=1+(k.blade>=3?1:0)+(k.blade>=6?1:0);
        for(let i=0;i<count;i++)shoot(s,"blade",m,(i-(count-1)/2)*.085,st);
        c.blade=(.80-(k.blade-1)*.043)*st.interval;sound(s,"blade");}
    }
    if(k.frost&&c.frost<=0){
      const m=nearest(s,h,160);c.frost=.15;
      if(m){shoot(s,"frost",m,0,st);if(k.frost>=4)shoot(s,"frost",m,.09,st);c.frost=(2.1-.16*k.frost)*st.interval;sound(s,"frost");}
    }
    if(k.chain&&c.chain<=0){
      const m=nearest(s,h,103);c.chain=.16;
      if(m){let target=m,point={x:h.x,y:h.y-8};const seen=[];
        const extraJumps=k.stormArc?2:0,jumpRange=44+k.chain*2+(k.stormArc?12:0);
        for(let i=0;target&&i<2+Math.floor(k.chain/2)+extraJumps;i++){
          effect(s,"arc",point.x,point.y,.21,{x2:target.x,y2:target.y-5,seed:rng(s)*7,warm:!!k.stormArc});
          seen.push(target.id);hurtMob(s,target,(15+5*k.chain)*st.damage,"chain");
          point={x:target.x,y:target.y-5};target=nearest(s,point,jumpRange,seen);
        }
        c.chain=(3.2-k.chain*.16)*st.interval;sound(s,"chain");}
    }
    if(k.orbit)for(const orb of orbiters(s)){
      for(const m of s.mobs)if(m.hp>0&&m.orbitDelay<=0&&distance({x:m.x,y:m.y-4},orb)<m.r+4){
        hurtMob(s,m,(10+4*k.orbit)*st.damage,"orbit");m.orbitDelay=.5;
      }
    }
  }
  function spores(s,m,ring) {
    const h=s.hero,a=Math.atan2(h.y-5-(m.y-6),h.x-m.x),n=ring?(m.final?12:9):(m.elite?3:1);
    for(let i=0;i<n;i++){
      const angle=a+(ring?i*2*Math.PI/n:(i-(n-1)/2)*.19),v=ring?31:30;
      s.shots.push({type:"spore",x:m.x,y:m.y-6,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,life:ring?4.8:4.3,power:m.damage*.96,pierce:1});
    }
  }
  function monsters(s,dt) {
    const h=s.hero;
    for(const m of s.mobs){
      if(m.hp<=0)continue;
      m.spawn=Math.max(0,m.spawn-dt);m.hit=Math.max(0,m.hit-dt);m.slow=Math.max(0,m.slow-dt);m.orbitDelay-=dt;m.attack-=dt;
      if(m.spawn>.12)continue;
      const dx=h.x-m.x,dy=h.y-m.y,d=Math.hypot(dx,dy)||.001;let vx=dx/d,vy=dy/d,spd=m.speed*(m.slow>0?.48:1);
      if(m.boss&&m.wind>0){
        m.wind-=dt;
        if(m.wind<=0){const r=m.final?30:26;effect(s,"stomp",m.x,m.y,.45,{r});
          if(distance(m,h)<r+2)hurtHero(s,m.damage*1.36,m.x,m.y);
          spores(s,m,true);m.attack=4.8;}
        continue;
      }
      if(m.boss&&m.attack<=0&&d<78){m.wind=1.15;continue;}
      if(m.type==="shroom"&&d<88&&d>27){
        spd*=.12;
        if(m.attack<=0){spores(s,m,false);m.attack=3.8+rng(s)*1.4;effect(s,"burst",m.x,m.y-7,.2,{color:"#c087c6",seed:m.anim});}
      }
      if(m.type==="bat"){const sway=Math.sin(s.sec*3.8+m.anim)*.50;vx=dx/d-sway*dy/d;vy=dy/d+sway*dx/d;}
      if(d>3){m.x+=vx*spd*dt;m.y+=vy*spd*dt;}
      if(Math.abs(vx)>.05)m.flip=vx<0;
      if(d<m.r+4)hurtHero(s,m.damage,m.x,m.y);
    }
    s.cool.space-=dt;
    if(s.cool.space<=0){
      s.cool.space=.11;
      for(let i=0;i<s.mobs.length;i++){
        const a=s.mobs[i];if(a.hp<=0)continue;
        for(let j=i+1;j<s.mobs.length;j++){
          const b=s.mobs[j],dx=a.x-b.x,dy=a.y-b.y,min=(a.r+b.r)*.77;
          if(Math.abs(dx)>min||Math.abs(dy)>min||b.hp<=0)continue;
          const dd=Math.hypot(dx,dy)||.01;if(dd>=min)continue;
          const push=(min-dd)*.31,px=dx/dd*push,py=dy/dd*push;
          a.x+=px;a.y+=py;b.x-=px;b.y-=py;
        }
      }
    }
  }
  function evolvedImpact(s,shot,center) {
    if(shot.hits.length!==1)return;
    const frost=shot.type==="frost";
    if(frost?!s.skills.frostWave:!s.skills.cinderBurst)return;
    const radius=frost?21:15;
    effect(s,"evolvedImpact",center.x,center.y-4,.33,{r:radius,frost});
    for(const other of s.mobs){
      if(other!==center&&other.hp>0&&distance(center,other)<=radius){
        hurtMob(s,other,shot.power*(frost?.3:.4),frost?"frost":"burst");
      }
    }
  }
  function projectiles(s,dt) {
    for(const a of s.shots){
      a.life-=dt;if(a.life<=0)continue;
      a.x+=a.vx*dt;a.y+=a.vy*dt;
      if(a.type==="spore"){
        if(Math.hypot(a.x-s.hero.x,a.y-s.hero.y+5)<5.9 && s.hero.dash<=0){hurtHero(s,a.power,a.x,a.y);a.life=0;}
      }else{
        for(const m of s.mobs){
          if(m.hp<=0||a.hits.includes(m.id)||Math.abs(m.x-a.x)>m.r+5)continue;
          if(Math.hypot(m.x-a.x,m.y-5-a.y)<m.r+3){
            hurtMob(s,m,a.power,a.type);a.hits.push(m.id);a.pierce--;
            evolvedImpact(s,a,m);
            if(a.pierce<=0){a.life=0;break;}
          }
        }
      }
    }
    s.shots=s.shots.filter(a=>a.life>0&&a.x>-8&&a.x<W+8&&a.y>-8&&a.y<H+8);
  }
  function eligibleEvolutions(s) {
    return EVOLUTIONS.filter(id=>!s.skills[id]&&Object.entries(SKILLS[id].recipe).every(([skill,level])=>(s.skills[skill]||0)>=level));
  }
  function choices(s,reason,avoid=[]) {
    let pool=UPGRADES.filter(id=>(s.skills[id]||0)<SKILLS[id].max);
    const list=reason==="trial"?eligibleEvolutions(s):[];
    if(pool.length+list.length<3)pool.push("ember","feast","ward");
    while(pool.length&&list.length<3){
      let candidates=pool.filter(id=>!avoid.includes(id));
      if(!candidates.length)candidates=pool;
      const item=candidates[Math.floor(rng(s)*candidates.length)];
      list.push(item);pool=pool.filter(id=>id!==item);
    }
    return list;
  }
  function offerChoice(s){
    if(s.phase!=="active")return;
    if(s.trials?.rewardPending){
      s.trials.rewardPending=false;
      s.choiceReason="trial";
    }else{
      const threshold=need(s.level);
      if(s.xp<threshold)return;
      s.xp-=threshold;
      s.level++;
      s.choiceReason="level";
    }
    s.phase="choice";
    s.choices=choices(s,s.choiceReason);
    sound(s,"level");
  }
  function pick(s,index) {
    if(s.phase!=="choice"||!s.choices[index])return false;
    const id=s.choices[index];s.skills[id]=(s.skills[id]||0)+1;
    if(id==="ward")s.hero.immune=9;
    if(id==="vigor"||id==="feast")s.hero.hp=Math.min(stats(s).maxHp,s.hero.hp+(id==="vigor"?32:40));
    if(id==="magnet"||id==="feast")for(const g of s.gems)if(g.kind==="gem")g.pull=true;
    s.phase="active";s.choices=[];s.choiceReason=null;s.hero.immune=Math.max(s.hero.immune,.7);s.cool[id]=0;
    offerChoice(s);return true;
  }
  function reroll(s) {
    if(s.phase!=="choice"||s.rerolls<1)return false;
    s.rerolls--;s.choices=choices(s,s.choiceReason,s.choices);return true;
  }
  function collect(s,dt,st){
    let ding=false;
    for(const g of s.gems){
      const dx=s.hero.x-g.x,dy=s.hero.y-g.y,d=Math.hypot(dx,dy);
      g.age+=dt;if(d<st.reach)g.pull=true;
      if(!g.pull)continue;
      const amount=Math.min(d,(58+Math.min(140,d)*1.1)*dt);
      if(d>0){g.x+=dx/d*amount;g.y+=dy/d*amount;}
      if(d<=4.1+amount){
        if(g.kind==="heart"){s.hero.hp=Math.min(st.maxHp,s.hero.hp+g.value);textAt(s,s.hero.x,s.hero.y-20,"+"+g.value,"#a9f3ad");sound(s,"heal");}
        else{s.xp+=g.value;s.crystals+=g.value;ding=true;effect(s,"collect",g.x,g.y,.23);}
        g.taken=true;
      }
    }
    s.gems=s.gems.filter(g=>!g.taken);if(ding)sound(s,"gem");
    offerChoice(s);
  }
  function drawTrialKind(s) {
    const state=s.trials;
    if(!state.bag.length)state.bag=Object.keys(TRIALS);
    const alternatives=state.bag.filter(kind=>kind!==state.lastKind);
    const pool=alternatives.length?alternatives:state.bag;
    const kind=pool[Math.floor(rng(s)*pool.length)];
    state.bag=state.bag.filter(item=>item!==kind);
    state.lastKind=kind;
    return kind;
  }
  function offerTrial(s) {
    const near=ALTARS.filter(position=>{
      const d=distance(position,s.hero);
      return d>36&&d<122;
    });
    const pool=near.length?near:ALTARS;
    const position=pool[Math.floor(rng(s)*pool.length)];
    s.trials.current={id:s.nextId++,kind:drawTrialKind(s),phase:"offered",...position,
      deadline:s.sec+45,charge:0,progress:0,targets:[]};
    note(s,"林地试炼出现 · 靠近金色祭坛开启");
  }
  function startTrial(s,trial) {
    const rules=TRIALS[trial.kind];
    trial.phase="active";
    trial.deadline=s.sec+rules.seconds;
    trial.nextPressure=s.sec+2.6;
    if(trial.kind==="shards"){
      const pool=ALTARS.filter(position=>distance(position,trial)>47);
      for(let i=0;i<rules.goal;i++){
        const index=Math.floor(rng(s)*pool.length);
        trial.targets.push({...pool.splice(index,1)[0],taken:false});
      }
    }
    if(trial.kind==="hunt"){
      const species=s.sec<140?["slime","bat","slime"]:["skeleton","bat","shroom"];
      const positions=ALTARS.filter(position=>distance(position,trial)>47)
        .sort((a,b)=>distance(a,trial)-distance(b,trial)).slice(0,species.length);
      positions.forEach((position,i)=>addMob(s,species[i],position.x,position.y,{elite:true,trialId:trial.id}));
    }
    note(s,rules.name+"开始");
    sound(s,"wave");
  }
  function clearTrial(s,nextDelay) {
    const trial=s.trials.current;
    if(trial?.kind==="hunt"){
      for(const mob of s.mobs)if(mob.trialId===trial.id)delete mob.trialId;
    }
    s.trials.current=null;
    s.trials.nextAt=s.sec+nextDelay;
  }
  function updateTrial(s,dt) {
    const state=s.trials;
    const trial=state.current;
    if(!trial){
      const timeForTrial=s.endless||s.minutes*60-s.sec>92;
      if(s.sec>=state.nextAt&&timeForTrial&&!s.mobs.some(m=>m.boss))offerTrial(s);
      return;
    }
    if(s.sec>=trial.deadline){
      clearTrial(s,80+rng(s)*23);
      if(trial.phase==="active")note(s,"试炼结束 · 继续远征");
      return;
    }
    const near=distance(s.hero,trial);
    if(trial.phase==="offered"){
      trial.charge=near<13?trial.charge+dt:0;
      if(trial.charge>=.7)startTrial(s,trial);
      return;
    }
    const rules=TRIALS[trial.kind];
    if(trial.kind==="hold"){
      if(near<=rules.radius)trial.progress+=dt;
      if(s.sec>=trial.nextPressure){
        if(s.mobs.length<78)addWaveMob(s);
        trial.nextPressure=s.sec+3;
      }
    }
    if(trial.kind==="shards"){
      for(const target of trial.targets){
        if(target.taken||distance(s.hero,target)>10)continue;
        target.taken=true;
        trial.progress++;
        effect(s,"burst",target.x,target.y-5,.42,{color:"#ffc980",seed:target.x});
        sound(s,"gem");
      }
    }
    if(trial.progress<rules.goal)return;
    const maxHp=stats(s).maxHp;
    const healed=Math.min(24,maxHp-s.hero.hp);
    s.hero.hp+=healed;
    if(healed>=1)textAt(s,s.hero.x,s.hero.y-20,"+"+Math.floor(healed),"#f5d389");
    effect(s,"evolvedImpact",s.hero.x,s.hero.y,.55,{r:24,frost:false});
    state.completed++;
    state.rewardPending=true;
    clearTrial(s,76+rng(s)*24);
  }
  function schedule(s,dt) {
    const target=s.minutes*60,p=s.sec/target;
    const wave=1+Math.floor(s.sec/60);
    if(wave!==s.wave){s.wave=wave;note(s,"第 "+String(wave).padStart(2,"0")+" 波 · "+WAVES[(wave-1)%WAVES.length]);sound(s,"wave");}
    s.cool.spawn-=dt;
    if(s.cool.spawn<=0){
      const cap=Math.min(78,14+Math.floor(38*p)+Math.floor(s.sec/45));
      if(s.mobs.length<cap){
        const count=1+(p>.18&&rng(s)<Math.min(.85,p*.95)?1:0)+(p>.65&&rng(s)<.35?1:0);
        for(let i=0;i<count;i++)addWaveMob(s);
      }
      s.cool.spawn=(1.46/(1+Math.min(p,2)*1.90))*(.84+rng(s)*.33);
    }
    s.cool.event-=dt;
    if(s.cool.event<=0){
      const x=100+rng(s)*280,y=102+rng(s)*84;
      for(let i=0;i<5;i++)drop(s,x+(rng(s)-.5)*22,y+(rng(s)-.5)*16,2);
      drop(s,x+5,y-3,18,"heart");note(s,"林间馈赠 · 灵晶与补给已出现");s.cool.event=81+rng(s)*38;
    }
    const marks=[target*.32,target*.65,target-35];
    for(let i=0;i<marks.length;i++)if(s.sec>=marks[i]&&!(s.marks&(1<<i))){
      s.marks|=1<<i;const [x,y]=gate(s,88);addMob(s,"warden",x,y,{final:i===2});
      note(s,i===2?"黎明将至 · 击败荆冠守林者":"首领现身 · 荆冠守林者");sound(s,"boss");}
    if(s.endless&&s.sec>=s.cool.boss){
      const [x,y]=gate(s,88);addMob(s,"warden",x,y);s.cool.boss=s.sec+150;note(s,"无尽怪潮 · 守林者现身");sound(s,"boss");}
    if(s.sec>=target&&s.finalDefeated&&!s.dawnReached&&s.phase==="active"){
      clearTrial(s,52);
      s.dawnReached=true;s.phase="dawn";sound(s,"win");
    }
  }
  function goEndless(s) {
    if(s.phase!=="dawn")return false;
    s.endless=true;s.phase="active";s.hero.hp=stats(s).maxHp;s.cool.boss=s.sec+120;
    note(s,"无尽远征 · 生命已恢复");return true;
  }
  function tick(s,dt,input={x:0,y:0}) {
    if(s.phase!=="active"||dt<=0)return;
    s.trials??=newTrials(s.sec+28);
    const h=s.hero,st=stats(s);s.sec+=dt;
    h.immune=Math.max(0,h.immune-dt);h.dashCd=Math.max(0,h.dashCd-dt);h.sinceHit+=dt;
    const d=Math.hypot(input.x,input.y);
    h.walking=d>.05||h.dash>0;
    if(h.dash>0){h.x+=h.dashX*174*dt;h.y+=h.dashY*174*dt;h.dash-=dt;}
    else if(d>.05){h.dirX=input.x/d;h.dirY=input.y/d;if(Math.abs(h.dirX)>.06)h.flip=h.dirX<0;
      h.x+=h.dirX*st.speed*Math.min(1,d)*dt;h.y+=h.dirY*st.speed*Math.min(1,d)*dt;}
    if(h.walking)limitPosition(h);
    if(h.hp<st.maxHp&&h.sinceHit>2.8&&distance(h,CAMP)<23){
      h.hp=Math.min(st.maxHp,h.hp+2.25*dt);s.healTick+=dt;
      if(s.healTick>.82){s.healTick=0;effect(s,"heal",h.x+(rng(s)-.5)*8,h.y-8,.75);}
    }
    schedule(s,dt);
    if(s.phase!=="active")return;
    weapons(s,dt,st);monsters(s,dt);projectiles(s,dt);
    s.mobs=s.mobs.filter(m=>m.hp>0);
    if(s.phase==="active"){
      updateTrial(s,dt);
      collect(s,dt,st);
    }
    for(const e of s.fx)e.life-=dt;
    for(const n of s.numbers)n.life-=dt;
    s.fx=s.fx.filter(e=>e.life>0);s.numbers=s.numbers.filter(n=>n.life>0);
  }
  function valid(s){
    return s&&s.schema===1&&typeof s.id==="string"&&[12,20,30].includes(s.minutes)&&Number.isFinite(s.sec)&&
      s.hero&&Number.isFinite(s.hero.hp)&&Number.isFinite(s.hero.x)&&s.skills?.blade>=1&&s.skills?.dash>=1&&s.cool&&s.species&&
      ["active","choice","dawn","dead"].includes(s.phase)&&["mobs","gems","shots","fx","numbers","choices"].every(k=>Array.isArray(s[k]));
  }
  window.EmberGame={W,H,CAMP,MONSTERS,SKILLS,MARKS,TRIALS,EVOLUTIONS,unlockedMark,initialSkills,WAVES,makeRun,tick,stats,need,pick,reroll,dash,goEndless,valid,timeText,orbiters,clamp};
})();
