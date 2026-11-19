(() => {
  "use strict";
  const G=window.EmberGame,A=window.PixelArt;
  const $=id=>document.getElementById(id);
  const paths={
    swords:'<path d="m3 3 4.5 1 12 12-3.5 3.5-12-12zM14 17l-2 2m5-5 2-2m-1 7 3 3m-1-19-5 1-4 4m5 3 3-4zM6 14l-3 3m6 0-3 3m0-3-4 4"/>',
    book:'<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14"/>',
    trophy:'<path d="M7 3h10v5c0 4-2 6-5 7-3-1-5-3-5-7V3Zm0 2H3v2c0 3 2 5 5 5m9-7h4v2c0 3-2 5-5 5m-4 3v4m-4 2h8m-7-2h6"/>',
    sound:'<path d="m3 9 4 0 5-4v14l-5-4H3zM15 8c2.5 2 2.5 6 0 8m3-11c4.8 3.8 4.8 10.2 0 14"/>',
    mute:'<path d="m3 9 4 0 5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/>',
    clock:'<circle cx="12" cy="12" r="8.4"/><path d="M12 7v5l3 2"/>',
    pause:'<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    expand:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
    collapse:'<path d="M9 3v6H3m12-6v6h6m0 6h-6v6m-6 0v-6H3"/>',
    play:'<path d="M6 3.5c0-.5.6-.8 1-.6L21 11c.7.4.7 1.3 0 1.7L7 21c-.4.3-1 0-1-.5z"/>',
    user:'<path d="M5 20v-2c0-3 2-5 7-5s7 2 7 5v2z"/><circle cx="12" cy="7.5" r="3.8"/>',
    heart:'<path d="M3 6h3V4h3l3 3 3-3h3v2h3v6l-9 8-9-8z" fill="currentColor" stroke="none"/>',
    spark:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" fill="currentColor" stroke="none"/>',
    skull:'<path d="M5 16l-2-2V9l3-5h12l3 5v5l-3 2v4h-3v-2m0 2H9v-2m0 2H6v-4z"/><path d="M7 10h3v3H7zm7 0h3v3h-3zm-3 4h2" fill="currentColor"/>',
    diamond:'<path d="m12 2 7 10-7 10-7-10zm0 0v20M5 12h14"/>',
    bag:'<path d="M7 8V5l2-2h6l2 2v3M5 8h14l2 4v8H3v-8zm-2 5c5 2 13 2 18 0m-10 0h2v3h-2z"/>',
    pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
    crosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/><circle cx="12" cy="12" r="1.5"/>',
    gamepad:'<path d="M7 6h10l3 2 2 10-2 2-5-4H9l-5 4-2-2L4 8zM8 9v5m-2.5-2.5h5M16 10h.1M18 13h.1"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    lantern:'<path d="M10 2h4l1 4m-6 0 1-4M6 6h12l-1 3H7zm2 3-1 8 3 3h4l3-3-1-8m-6 7 2-4 2 4-2 2zM8 21h8"/>',
    refresh:'<path d="M20 10a8 8 0 0 0-13-4L3 9m0-5v5h5M4 14a8 8 0 0 0 13 4l4-3m0 5v-5h-5"/>',
    save:'<path d="M4 3h13l4 4v14H3V3zM7 3v6h9V3M7 21v-8h10v8"/>',
    bolt:'<path d="m14 1-10 13h7l-1 9 11-15h-8l2-7z"/>',
    move:'<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    flag:'<path d="M5 21V3m0 1c4-4 8 4 14 0v10c-6 4-10-4-14 0"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||"")+'</svg>';
  const icon=name=>'<i data-icon="'+name+'">'+svg(name)+'</i>';
  const artId=id=>G.SKILLS[id]?.art||({ward:"magnet",feast:"vigor",ember:"fire"}[id]||id);
  const pic=(id,alt="",className="")=>'<img class="pixel-img '+className+'" src="'+A.iconData(artId(id),3)+'" alt="'+alt+'">';
  document.querySelectorAll("i[data-icon]").forEach(el=>el.innerHTML=svg(el.dataset.icon));
  document.querySelectorAll("img[data-art]").forEach(el=>el.src=A.iconData(el.dataset.art,3));
  document.querySelector('link[rel="icon"]').href=A.iconData("brand",2);
  const KEYS={run:"emberwatch.run.v1",history:"emberwatch.log.v1",config:"emberwatch.settings.v1",seen:"emberwatch.bestiary.v1"};
  let storageOK=true;
  function storageFailure(){storageOK=false;$("save-label").innerHTML=icon("save")+" 此浏览器暂时无法保存进度";}
  function read(key,fallback){
    try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}
    catch{storageFailure();return fallback;}
  }
  function write(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{storageFailure();}}
  const config=read(KEYS.config,{})||{};
  let soundOn=config.sound!==false;
  const data=read(KEYS.run,null);let run=G.valid(data)&&data.phase!=="dead"?data:null;
  if(run)run.events=[];
  const hData=read(KEYS.history,[]);
  let records=Array.isArray(hData)?hData.filter(r=>r&&typeof r.id==="string"&&Number.isFinite(r.sec)):[];
  let seen=read(KEYS.seen,{})||{};
  let minutes=run?run.minutes:[12,20,30].includes(config.minutes)?config.minutes:20;
  let mark=run?.mark||(G.unlockedMark(config.mark,seen)?config.mark:"cinder"),lastUnlock="";
  let mode="camp",page="expedition",layer="",globalMode="",globalAfter=null,returnFocus=null,goal=null;
  let previous=0,accum=0,lastDraw=0,hudTime=0,saveTime=0,noticeEnd=0,skillSignature="",gesture=null,touchUsed=false;
  const vector={x:0,y:0},held=new Set();
  const field=new window.ForestField($("field"));
  const clock=G.timeText;
  const isTouch=()=>touchUsed||matchMedia("(pointer:coarse)").matches;
  const pad=(n,size=2)=>String(Math.floor(n)).padStart(size,"0");
  const historyNames={fallen:"远征结束",endless:"无尽远征",won:"守至黎明",left:"提前撤离"};
  const tipList=[
    "远征约一分钟后，靠近发光祭坛可开启试炼。",
    "试炼宝箱会提供符合配方的进化。完整指南中可以查看配方。",
    "靠近林间篝火，短暂避战后可缓慢恢复生命。",
    "冲刺时有短暂无敌，可以穿过迎面而来的怪群。",
    "飞刃达到 3 级与 6 级时，每次攻击会额外投出一把。",
    "选择引晶符石，会立即吸引场上所有灵晶。",
    "守林者蓄力时，离开地面的红圈即可避开震击。",
    "黎明后可以带着完整技能进入无尽远征。"
  ];
  let tipIndex=0;
  function saveConfig(){write(KEYS.config,{sound:soundOn,minutes,mark});}
  function saveRun(){
    if(run&&run.phase!=="dead"&&!run.archived)write(KEYS.run,{...run,events:[],fx:[],numbers:[]});
  }
  function makeSeed(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]||1234567;}
  function archive(outcome){
    if(!run||run.archived)return;
    const locked=Object.keys(G.MARKS).filter(id=>!G.unlockedMark(id,seen));lastUnlock="";
    const row={id:run.id,time:Date.now(),minutes:run.minutes,sec:run.sec,kills:run.kills,crystals:run.crystals,level:run.level,
      trials:run.trials?.completed||0,outcome,species:{...run.species}};
    if(!records.some(r=>r.id===row.id)){
      records=[row,...records].slice(0,80);
      for(const id of Object.keys(G.MONSTERS))seen[id]=(seen[id]||0)+(run.species[id]||0);
      if(run.dawnReached)seen.dawns=(seen.dawns||0)+1;
      const fresh=locked.filter(id=>G.unlockedMark(id,seen));
      if(fresh.length)lastUnlock="新刻印已解锁 · "+fresh.map(id=>G.MARKS[id].name).join("、");
      write(KEYS.seen,seen);write(KEYS.history,records);
    }
    run.archived=true;write(KEYS.run,null);
  }
  let audio=null,lastTone={};
  function unlockAudio(){
    if(!soundOn)return;
    try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume().catch(()=>{});}catch{}
  }
  function tone(freq,length,type="triangle",vol=.035,delay=0,end=0){
    if(!soundOn||!audio||audio.state!=="running")return;
    try{
      const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+length*.9);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+length);
      o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+length+.015);
    }catch{}
  }
  function playSound(name){
    if(!soundOn||!audio)return;
    const now=performance.now();if(now-(lastTone[name]||0)<(name==="gem"?80:45))return;lastTone[name]=now;
    if(name==="blade")tone(245,.07,"triangle",.019,0,100);
    if(name==="frost")tone(840,.13,"sine",.025,0,320);
    if(name==="chain")tone(390,.12,"sawtooth",.014,0,95);
    if(name==="gem")tone([587,740,880,988][(run?.crystals||0)%4],.13,"sine",.045);
    if(name==="dash")tone(275,.19,"triangle",.045,0,66);
    if(name==="hurt")tone(118,.17,"sawtooth",.032,0,52);
    if(name==="heal"){tone(440,.14);tone(659,.19,"sine",.031,.08);}
    if(["start","level","win","bossDown","wave"].includes(name)){
      const notes=name==="win"?[392,494,587,784,988]:name==="level"?[494,587,740,988]:[330,440,659];
      notes.forEach((n,i)=>tone(n,name==="win"?.26:.18,"triangle",.041,i*.075));
    }
    if(name==="fall"||name==="boss"){tone(147,.33,"triangle",.055,0,63);tone(110,.35,"square",.013,.14,55);}
  }
  function soundButton(){
    $("sound").innerHTML=icon(soundOn?"sound":"mute")+"<span>"+(soundOn?"音效开启":"音效关闭")+"</span>";
    $("sound").setAttribute("aria-pressed",String(soundOn));
    $("sound").setAttribute("aria-label",soundOn?"关闭音效":"开启音效");
  }
  function active(){return mode==="play"&&page==="expedition"&&run&&run.phase==="active"&&!globalMode;}
  function stopInput(){
    held.clear();vector.x=0;vector.y=0;goal=null;gesture=null;
    const stick=$("stick");stick.style.left="";stick.style.top="";stick.style.bottom="";stick.firstElementChild.style.transform="";
  }
  function focusArena(){$("arena").focus({preventScroll:true});}
  function showNotice(text,seconds=2.8){
    $("wave-notice").textContent=text;$("wave-notice").classList.add("show");noticeEnd=performance.now()+seconds*1000;
  }
  function events(){
    if(!run)return;
    for(const e of run.events||[])if(e.type==="sound")playSound(e.name);else if(e.type==="notice")showNotice(e.text);
    run.events=[];
  }
  function skillList(s){
    const k=s?s.skills:G.initialSkills(mark);
    const ids=Object.keys(k).filter(id=>k[id]>0&&!["feast","ward"].includes(id));
    const sig=ids.map(id=>id+k[id]).join("|");if(sig===skillSignature)return;
    skillSignature=sig;$("equip-count").textContent=pad(ids.length);
    $("equipment-list").innerHTML=ids.map(id=>{
      const skill=G.SKILLS[id],rank=skill.recipe?"已进化":"Lv."+k[id];
      return '<div class="equipment-row"><div class="equipment-icon '+skill.color+'">'+pic(id)+'</div><div class="eq-body"><div class="eq-name"><strong>'+skill.name+'</strong><span class="eq-code">'+rank+'</span></div><p>'+skill.short+'</p></div></div>';
    }).join("");
  }
  function meter(id,value,max){
    const bar=$(id+"-bar");bar.firstElementChild.style.width=G.clamp(value/max*100,0,100)+"%";
    bar.setAttribute("aria-valuenow",String(value));bar.setAttribute("aria-valuemax",String(max));bar.setAttribute("aria-valuemin","0");
    $(id+"-text").innerHTML=value+' <em>/ '+max+'</em>';
  }
  function syncTrial(s,show){
    const trial=s?.trials?.current;
    $("trial-hud").hidden=!trial||!show;
    if(!trial||!show)return;
    const rules=G.TRIALS[trial.kind],offered=trial.phase==="offered";
    $("trial-name").textContent=offered?"林地试炼":rules.name;
    $("trial-time").textContent=Math.max(0,Math.ceil(trial.deadline-s.sec))+" 秒";
    const progress=Math.min(rules.goal,Math.floor(trial.progress));
    const objectives={
      hold:"留在圈内 "+progress+" / "+rules.goal+" 秒",
      shards:"拾取金色晶石 "+progress+" / "+rules.goal,
      hunt:"击败紫印精英 "+progress+" / "+rules.goal
    };
    $("trial-progress").textContent=offered?"在金色祭坛旁停留开启":objectives[trial.kind];
    const pct=Math.round(G.clamp(offered?trial.charge/.7:trial.progress/rules.goal,0,1)*100);
    const meter=$("trial-meter");
    meter.firstElementChild.style.width=pct+"%";
    meter.setAttribute("aria-valuenow",String(pct));
  }
  function syncHUD(){
    const s=run,lv=s?.level||1,camp=mode==="camp";
    $("wave").textContent=pad(s?.wave||1);$("timer").textContent=clock(s?.sec||0);$("level").textContent="LV. "+pad(lv);
    $("kills").textContent=pad(s?.kills||0,3);$("crystals").textContent=pad(s?.crystals||0,3);
    meter("hp",Math.ceil(s?s.hero.hp:100),s?G.stats(s).maxHp:100);meter("xp",s?.xp||0,G.need(lv));
    skillList(s);$("loadout").querySelector("span").textContent=G.MARKS[s?.mark||mark]?.name||"余烬刻印";
    const choiceStatus=s?.choiceReason==="trial"?"试炼奖赏":"技能升级";
    const status=camp?(s?"存档待续":"准备就绪"):mode==="paused"?"已暂停":s?.phase==="choice"?choiceStatus:s?.phase==="dead"?"远征结束":s?.phase==="dawn"?"已至黎明":s?.endless?"无尽模式":"远征进行中";
    $("status").innerHTML="<b></b>"+status;$("status").classList.toggle("paused",mode==="paused"||s?.phase==="choice");
    $("lobby").hidden=!camp;$("pause").hidden=camp||s?.phase==="dead"||s?.phase==="dawn";
    $("active-hud").hidden=camp||!s||s.phase!=="active"||mode!=="play";
    $("touch-ui").hidden=!active()||!isTouch();
    $("start").querySelector("span").textContent=s?"继续远征":"开始远征";
    $("mission-copy").textContent=s?"远征已保存 · 等级 "+lv+" · 已存活 "+clock(s.sec):"击退怪潮，挑战林地祭坛，守到黎明。";
    for(const b of document.querySelectorAll("[data-minutes]")){
      const chosen=Number(b.dataset.minutes)===minutes;b.classList.toggle("selected",chosen);b.setAttribute("aria-pressed",String(chosen));b.disabled=!camp;
    }
    const targetSec=minutes*60;
    $("area-objective").textContent=s?.endless?"挑战无尽怪潮":"存活 "+clock(targetSec)+"，击败守林者";
    const cd=s?s.hero.dashCd:0;$("dash-readout").textContent=cd>.04?"冲刺 "+cd.toFixed(1)+"s":"冲刺就绪";
    $("touch-dash").classList.toggle("cooling",cd>.04);
    $("goal-readout").textContent=s?.endless?"无尽远征":s&&s.sec>=targetSec&&!s.finalDefeated?"击败守林者":"黎明 "+clock(targetSec);
    const boss=s?.mobs.find(m=>m.boss&&m.hp>0);
    $("boss-hud").hidden=!boss||camp||s.phase!=="active";
    if(boss)$("boss-hud").querySelector("b").style.width=(boss.hp/boss.maxHp*100)+"%";
    syncTrial(s,!camp&&s?.phase==="active");
  }
  function clearLayer(){layer="";$("game-layer").hidden=true;$("game-layer").innerHTML="";}
  function setLayer(name,html){
    layer=name;const el=$("game-layer");el.innerHTML=html;el.hidden=false;
    const focus=el.querySelector("button:not(:disabled)");if(focus&&page==="expedition")focus.focus({preventScroll:true});
  }
  function panel(kicker,title,contents,extra=""){
    return '<div class="dialog '+extra+'" role="dialog" aria-modal="true" aria-label="'+title+'"><div class="mini-kicker">'+kicker+'</div><h2>'+title+'</h2>'+contents+'</div>';
  }
  function button(action,text,cls="ghost",name=""){return '<button class="'+cls+'" data-act="'+action+'">'+(name?icon(name):"")+text+'</button>';}
  function resultStats(s){
    const trials=s.trials?.completed||0;
    return '<div class="modal-stats"><span>生存时间<strong>'+clock(s.sec)+'</strong></span><span>击败怪物<strong>'+s.kills+'</strong></span><span>冒险等级<strong>'+pad(s.level)+'</strong></span>'+
      (trials?'<span>完成试炼<strong>'+trials+'</strong></span>':'')+'</div>';
  }
  function upgradeLayer(){
    const isReward=run.choiceReason==="trial";
    const opt=run.choices.map((id,i)=>{
      const skill=G.SKILLS[id],lv=run.skills[id]||0;
      const label=skill.recipe?"技能进化":lv?'Lv.'+lv+' → '+(lv+1):'新技能';
      return '<button class="upgrade-card'+(skill.recipe?' evolution-card':'')+'" data-choice="'+i+'"><span class="upgrade-top"><span>'+label+'</span><kbd>'+(i+1)+'</kbd></span><span class="upgrade-icon">'+pic(id)+'</span><strong>'+skill.name+'</strong><small>'+skill.desc+'</small></button>';
    }).join("");
    const content=isReward?"祭坛恢复至多 24 点生命，再选一项额外奖赏。":"挑选一项能力，继续你的远征。";
    setLayer("choice",panel(isReward?"TRIAL COMPLETE":"LEVEL UP  /  LV. "+pad(run.level),isReward?"开启试炼宝箱":"选择升级",
      '<p>'+content+'</p><div class="upgrade-cards">'+opt+'</div><button data-act="reroll" class="reroll" '+(run.rerolls<1?"disabled":"")+'>'+icon("refresh")+' 重新抽取（剩余 '+run.rerolls+' 次）</button>',"upgrade-dialog"));
  }
  function phaseLayer(){
    if(!run||mode==="camp"){clearLayer();return;}
    if(mode==="paused"){if(layer!=="pause"&&layer!=="leave")pause(false);return;}
    if(run.phase==="choice"){if(layer!=="choice"){stopInput();upgradeLayer();saveRun();}return;}
    if(run.phase==="dawn"){
      if(layer!=="dawn"){stopInput();setLayer("dawn",panel("DAWN REACHED","黎明已至",'<p>你守住了暮影森林。休整后，还能迎战无尽怪潮。</p>'+resultStats(run)+'<div class="dialog-actions">'+button("endless","进入无尽","primary","swords")+button("finish","完成远征")+'</div>'));saveRun();}
      return;
    }
    if(run.phase==="dead"){
      if(layer!=="dead"){stopInput();archive(run.dawnReached?"endless":"fallen");
        setLayer("dead",panel("EXPEDITION LOG",run.dawnReached?"无尽远征结束":"余火未熄",'<p>'+(lastUnlock||'这次远征已记入战绩。下一次试试不同的技能搭配。')+'</p>'+resultStats(run)+'<div class="dialog-actions">'+button("again","再次远征","primary","play")+button("camp","返回营地")+'</div>'));}
      return;
    }
    if(layer)clearLayer();
  }
  function startGame(){
    if(page!=="expedition"||globalMode)return;
    if(mode!=="camp")return;
    unlockAudio();stopInput();clearLayer();
    if(!run){lastUnlock="";run=G.makeRun(minutes,makeSeed(),mark);showNotice("第 01 波 · 林间苏醒",2.2);playSound("start");}
    mode="play";previous=performance.now();accum=0;saveTime=0;
    saveRun();syncHUD();focusArena();phaseLayer();
  }
  function pause(store=true){
    if(!run||mode==="camp"||run.phase!=="active")return;
    mode="paused";stopInput();
    setLayer("pause",panel("EXPEDITION PAUSED","远征暂停",'<p>暮影森林 · 第 '+pad(run.wave)+' 波</p>'+resultStats(run)+'<div class="dialog-actions">'+button("resume","继续远征","primary","play")+button("savecamp","保存并回营")+'</div>'+button("leave","在此结算","text-action")));
    if(store)saveRun();syncHUD();
  }
  function resume(){
    if(!run||mode!=="paused")return;
    unlockAudio();mode="play";previous=performance.now();accum=0;clearLayer();syncHUD();focusArena();phaseLayer();
  }
  function camp(keep=false){
    stopInput();clearLayer();mode="camp";$("wave-notice").classList.remove("show");
    if(keep)saveRun();else{write(KEYS.run,null);run=null;}
    syncHUD();$("start").focus({preventScroll:true});
    if(!keep&&lastUnlock){showNotice(lastUnlock,4.5);lastUnlock="";}
  }
  function choose(index){
    if(!run||mode!=="play"||run.phase!=="choice"||!G.pick(run,index))return;
    unlockAudio();playSound("gem");clearLayer();events();saveRun();syncHUD();focusArena();phaseLayer();
  }
  function action(name){
    if(name==="resume")resume();
    if(name==="savecamp")camp(true);
    if(name==="leave")setLayer("leave",panel("RETURN TO CAMP","结算本次远征",'<p>当前时间与击败数将记入战绩，技能会在下局重新成长。</p><div class="dialog-actions">'+button("backpause","继续休整")+button("settle","结算并回营","primary")+'</div>'));
    if(name==="backpause")pause(false);
    if(name==="settle"||name==="finish"){archive(run.dawnReached?(run.endless?"endless":"won"):"left");camp();}
    if(name==="camp")camp();
    if(name==="again"){camp();startGame();}
    if(name==="endless"&&G.goEndless(run)){clearLayer();events();saveRun();syncHUD();focusArena();}
    if(name==="reroll"&&G.reroll(run)){upgradeLayer();saveRun();playSound("gem");}
  }
  function globalDialog(name,html,after=null){
    returnFocus=document.activeElement;globalMode=name;globalAfter=after;
    const el=$("guide-dialog");el.innerHTML=html;el.hidden=false;el.querySelector("button")?.focus({preventScroll:true});
  }
  function closeGlobal(confirmed=false){
    const after=globalAfter;globalMode="";globalAfter=null;
    $("guide-dialog").hidden=true;$("guide-dialog").innerHTML="";returnFocus?.focus?.({preventScroll:true});
    if(confirmed&&after)after();
  }
  function guide(){
    if(active())pause();
    const recipes=G.EVOLUTIONS.map(id=>{
      const skill=G.SKILLS[id];
      const ingredients=Object.entries(skill.recipe).map(([key,level])=>G.SKILLS[key].name+" "+level+" 级");
      return '<li>'+pic(id)+'<div><strong>'+skill.name+'</strong><span>'+ingredients.join(" + ")+'</span></div></li>';
    }).join("");
    const sections=[
      ["移动与冲刺","用 WASD 或方向键移动，空格冲刺。鼠标点击地面也能行走。触屏可拖动摇杆，点击闪电冲刺。"],
      ["灵晶与升级","飞刃自动攻击附近敌人。靠近青色灵晶可获得经验。升级时三选一，每局有两次重抽机会。"],
      ["林地试炼","在发光祭坛旁停留片刻即可开启试炼。留在金圈、收集金色晶石或击败紫印精英，按时完成就能开宝箱。配方达标后，宝箱会提供相应的进化。",'<ul class="evolution-recipes">'+recipes+'</ul>'],
      ["活到黎明","短暂避战后，篝火能为附近的游侠回血。守到所选时长并击败最终守林者，即可结算或继续无尽远征。"],
      ["中途休息","按 Esc 或 P 暂停，再选“保存并回营”。切换浏览器标签也会暂停，回来后可继续当前远征。"]
    ];
    const content=sections.map(([heading,body,extra=""])=>'<div><h3>'+heading+'</h3><p>'+body+'</p>'+extra+'</div>').join("");
    globalDialog("guide",panel("FIELD MANUAL","远征指南",'<button data-global="close" class="close-dialog" aria-label="关闭指南">'+icon("close")+
      '</button><div class="modal-body">'+content+'</div><div class="dialog-actions">'+button("close-guide","返回远征","primary")+'</div>',"guide-dialog"));
  }
  function loadouts(){
    if(active())pause();
    const current=run?.mark||mark;
    const cards=Object.entries(G.MARKS).map(([id,m])=>{
      const open=G.unlockedMark(id,seen),selected=current===id;
      return '<button class="mark-card '+(selected?"chosen":"")+'" data-mark="'+id+'" '+(!open||run?"disabled":"")+'><span class="mark-head">'+pic(m.art)+'<strong>'+m.name+'</strong></span><span>'+m.bonus+'</span><small>'+(selected?"已装备":open?"可装备":m.unlock)+'</small></button>';
    }).join("");
    globalDialog("marks",panel("STARTING RUNES","起始刻印",'<button data-global="close" class="close-dialog" aria-label="关闭刻印">'+icon("close")+'</button><p>'+(run?"当前远征已装备"+G.MARKS[current].name+"，结算后可更换。":"选择出发时携带的能力，结算远征可解锁更多刻印。")+'</p><div class="mark-grid">'+cards+'</div>',"mark-dialog"));
  }
  function setMinutes(n){minutes=n;saveConfig();syncHUD();}
  function codex(){
    $("codex-grid").innerHTML=Object.entries(G.MONSTERS).map(([id,m],i)=>{
      const k=(seen[id]||0)+(!run?.archived?(run?.species[id]||0):0);
      return '<article class="codex-card"><div class="specimen" data-id="NO. '+pad(i+1,3)+'">'+pic(id,m.name)+'</div><div class="codex-info"><h2>'+m.name+'<small>'+m.tag+'</small></h2><p>'+m.desc+'</p><span class="codex-count">'+icon("skull")+' 已击败 '+k+' 只</span></div></article>';
    }).join("");
  }
  function history(){
    const maxT=Math.max(0,...records.map(x=>x.sec)),maxK=Math.max(0,...records.map(x=>x.kills));
    const maxTrials=Math.max(0,...records.map(x=>x.trials||0));
    let html='<div class="record-stats">'+[["最长生存",clock(maxT)],["最高击败",String(maxK)],["单局试炼纪录",String(maxTrials)],["已结算远征",String(records.length)]].map(([label,val])=>'<div class="record-stat"><span>'+label+'</span><strong>'+val+'</strong></div>').join("")+'</div>';
    if(records.length){
      html+='<div class="history-panel">'+records.map(r=>{
        const date=new Date(r.time),label=Number.isFinite(date.getTime())?date.toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"}):"";
        const trialNote=r.trials?'　/　试炼 '+r.trials:'';
        return '<div class="history-row"><strong>'+(historyNames[r.outcome]||"远征结束")+'</strong><span>暮影森林 · '+r.minutes+' 分钟</span><span class="history-numbers">'+clock(r.sec)+'　/　'+r.kills+' 击败　/　Lv.'+r.level+trialNote+'</span><small>'+label+'</small></div>';
      }).join("")+'</div>';
    }else html+='<div class="empty-state">'+pic("fire")+'<h2>第一篇远征记录，等你来写</h2><p>完成或结算一局后，你的生存时间与击败数会出现在这里。</p><button class="ghost" id="records-start">返回远征大厅</button></div>';
    $("records-content").innerHTML=html;$("records-start")?.addEventListener("click",()=>goPage("expedition"));
  }
  function showPage(next){
    if(!["expedition","codex","records"].includes(next))next="expedition";
    if(next!==page&&active())pause();
    stopInput();page=next;
    for(const p of ["expedition","codex","records"])$("page-"+p).hidden=p!==next;
    document.querySelectorAll("[data-page]").forEach(b=>{const on=b.dataset.page===next;b.classList.toggle("is-active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
    if(next==="codex")codex();if(next==="records")history();if(next==="expedition"){field.updateSize();syncHUD();phaseLayer();}
    window.scrollTo({top:0,behavior:"instant"});
  }
  function goPage(next){if(location.hash!=="#"+next)location.hash=next;else showPage(next);}
  function fullscreenLabel(){
    const on=!!document.fullscreenElement||$("arena-card").classList.contains("full-fallback");
    $("fullscreen").innerHTML=icon(on?"collapse":"expand");$("fullscreen").title=on?"退出全屏":"全屏游戏";$("fullscreen").setAttribute("aria-label",$("fullscreen").title);
  }
  async function fullscreen(){
    const el=$("arena-card");
    if(document.fullscreenElement){try{await document.exitFullscreen();}catch{}}
    else if(el.classList.contains("full-fallback")){el.classList.remove("full-fallback");document.body.style.overflow="";}
    else{
      try{if(!el.requestFullscreen)throw Error();await el.requestFullscreen();}
      catch{el.classList.add("full-fallback");document.body.style.overflow="hidden";}
    }
    fullscreenLabel();field.updateSize();
  }
  function movement(){
    let x=Number(held.has("KeyD")||held.has("ArrowRight"))-Number(held.has("KeyA")||held.has("ArrowLeft"));
    let y=Number(held.has("KeyS")||held.has("ArrowDown"))-Number(held.has("KeyW")||held.has("ArrowUp"));
    if(!x&&!y){x=vector.x;y=vector.y;}
    if(x||y){goal=null;return {x,y};}
    if(goal&&run){
      const dx=goal.x-run.hero.x,dy=goal.y-run.hero.y,d=Math.hypot(dx,dy);
      if(d>1.7)return {x:dx/d,y:dy/d};
      goal=null;
    }
    return {x:0,y:0};
  }
  function doDash(){if(!active())return;const v=movement();if(G.dash(run,v.x,v.y)){events();syncHUD();}}
  function trapTab(e,parent){
    const items=[...parent.querySelectorAll("button:not(:disabled),[href],[tabindex='0']")];
    if(!items.length)return;
    if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
    else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
  }
  addEventListener("keydown",e=>{
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    if(globalMode){
      if(e.code==="Escape"){e.preventDefault();closeGlobal();}
      if(e.code==="Tab")trapTab(e,$("guide-dialog"));return;
    }
    if(page!=="expedition")return;
    if(e.code==="Escape"&&$("arena-card").classList.contains("full-fallback")&&mode==="camp"){e.preventDefault();fullscreen();return;}
    if(e.code==="Tab"&&layer){trapTab(e,$("game-layer"));return;}
    if(run?.phase==="choice"&&mode==="play"&&["Digit1","Digit2","Digit3","Numpad1","Numpad2","Numpad3"].includes(e.code)){e.preventDefault();if(!e.repeat)choose(Number(e.code.slice(-1))-1);return;}
    if(e.code==="Escape"||e.code==="KeyP"){
      if(mode!=="camp"&&run?.phase==="active"){
        e.preventDefault();if(e.repeat)return;if(layer==="leave")pause(false);else if(mode==="paused")resume();else pause();
      }return;
    }
    if(mode==="camp"&&e.code==="Enter"&&!e.repeat){
      if(e.target.closest?.("button,a")&&e.target!==$("start"))return;
      e.preventDefault();startGame();return;
    }
    if(!active())return;
    if(["KeyW","KeyS","KeyA","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)){e.preventDefault();held.add(e.code);}
    if(e.code==="Space"){e.preventDefault();if(!e.repeat)doDash();}
  });
  addEventListener("keyup",e=>held.delete(e.code));
  const arena=$("arena");
  arena.addEventListener("pointerdown",e=>{
    if(!active()||e.target.closest("button,.game-layer")||gesture)return;
    e.preventDefault();focusArena();
    if(e.pointerType==="touch"){touchUsed=true;$("touch-ui").hidden=false;}
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,touch:e.pointerType!=="mouse"};
    if(!gesture.touch){goal=field.worldPoint(e.clientX,e.clientY);}
    else{
      const st=$("stick"),r=arena.getBoundingClientRect(),sr=st.getBoundingClientRect();
      if(Math.hypot(e.clientX-sr.left-sr.width/2,e.clientY-sr.top-sr.height/2)<37){gesture.x=sr.left+sr.width/2;gesture.y=sr.top+sr.height/2;}
      else{st.style.left=(e.clientX-r.left-31)+"px";st.style.top=(e.clientY-r.top-31)+"px";st.style.bottom="auto";}
    }
    try{arena.setPointerCapture(e.pointerId);}catch{}
  });
  arena.addEventListener("pointermove",e=>{
    if(!gesture||gesture.id!==e.pointerId||!active())return;
    if(!gesture.touch){goal=field.worldPoint(e.clientX,e.clientY);return;}
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y,d=Math.hypot(dx,dy);
    if(d>4)gesture.moved=true;
    if(gesture.moved){const factor=Math.min(1,d/22);vector.x=d?dx/d*factor:0;vector.y=d?dy/d*factor:0;
      $("stick").firstElementChild.style.transform="translate("+vector.x*18+"px,"+vector.y*18+"px)";}
  });
  function release(e){
    if(!gesture||gesture.id!==e.pointerId)return;
    if(e.type==="pointerup"&&gesture.touch&&!gesture.moved)goal=field.worldPoint(e.clientX,e.clientY);
    gesture=null;vector.x=vector.y=0;
    const st=$("stick");st.style.left="";st.style.top="";st.style.bottom="";st.firstElementChild.style.transform="";
  }
  arena.addEventListener("pointerup",release);arena.addEventListener("pointercancel",release);arena.addEventListener("lostpointercapture",release);
  $("touch-dash").addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();doDash();});
  $("touch-dash").addEventListener("click",e=>{if(!e.detail)doDash();});
  $("start").addEventListener("click",startGame);$("pause").addEventListener("click",()=>mode==="paused"?resume():pause());
  $("fullscreen").addEventListener("click",fullscreen);document.addEventListener("fullscreenchange",fullscreenLabel);
  $("loadout").addEventListener("click",loadouts);
  $("guide").addEventListener("click",guide);$("tip-next").addEventListener("click",()=>{tipIndex=(tipIndex+1)%tipList.length;$("tip-copy").textContent=tipList[tipIndex];});
  $("sound").addEventListener("click",()=>{soundOn=!soundOn;saveConfig();soundButton();if(soundOn){unlockAudio();tone(659,.13);}});
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>goPage(b.dataset.page)));
  document.querySelectorAll("[data-minutes]").forEach(b=>b.addEventListener("click",()=>{
    const n=Number(b.dataset.minutes);if(n===minutes||mode!=="camp")return;
    if(run){globalDialog("duration",panel("NEW EXPEDITION","切换远征时长",'<p>已保存的远征将按当前进度结算，下一局时长为 '+n+' 分钟。</p><div class="dialog-actions"><button class="ghost" data-global="close">保留存档</button><button class="primary" data-global="confirm">结算并切换</button></div>'),()=>{archive(run.dawnReached?"endless":"left");camp();setMinutes(n);});}
    else setMinutes(n);
  }));
  $("game-layer").addEventListener("click",e=>{const opt=e.target.closest("[data-choice]");if(opt){choose(Number(opt.dataset.choice));return;}
    const b=e.target.closest("[data-act]");if(b)action(b.dataset.act);});
  $("guide-dialog").addEventListener("click",e=>{const b=e.target.closest("button");if(b?.dataset.mark&&!b.disabled&&!run&&G.unlockedMark(b.dataset.mark,seen)){mark=b.dataset.mark;saveConfig();closeGlobal();syncHUD();return;}if(b?.dataset.global==="confirm")closeGlobal(true);else if(b?.dataset.global==="close"||b?.dataset.act==="close-guide"||e.target===$("guide-dialog"))closeGlobal();});
  addEventListener("hashchange",()=>{if(globalMode)closeGlobal();showPage(location.hash.slice(1));});
  function suspend(){if(active())pause();stopInput();saveRun();}
  document.addEventListener("visibilitychange",()=>{if(document.hidden)suspend();else{previous=performance.now();accum=0;}});
  addEventListener("blur",suspend);addEventListener("pagehide",saveRun);
  function frame(now){
    const dt=previous?Math.min(.12,(now-previous)/1000):0;previous=now;
    if(!document.hidden&&page==="expedition"){
      if(active()){
        accum+=dt;
        while(accum>=1/60&&run.phase==="active"){G.tick(run,1/60,movement());accum-=1/60;}
        events();if(run.phase!=="active"){phaseLayer();syncHUD();}
        hudTime+=dt;saveTime+=dt;
        if(hudTime>.13){syncHUD();hudTime=0;}
        if(saveTime>=4){saveRun();saveTime=0;}
      }else accum=0;
      if(noticeEnd&&now>=noticeEnd){noticeEnd=0;$("wave-notice").classList.remove("show");}
      if(active()||now-lastDraw>(mode==="camp"?50:100)){
        field.draw(run,mode==="camp"?now/1000:run?.sec||0,mode==="camp",goal);lastDraw=now;
      }
    }
    requestAnimationFrame(frame);
  }
  soundButton();showPage(location.hash.slice(1)||"expedition");requestAnimationFrame(frame);
})();
