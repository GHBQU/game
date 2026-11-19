(() => {
  "use strict";
  const G=window.EmberGame, A=window.PixelArt;
  const demoMobs=[
    {type:"slime",x:139,y:132,anim:1.1},{type:"bat",x:177,y:93,anim:3.3},
    {type:"skeleton",x:359,y:143,anim:2.1,flip:true},{type:"slime",x:301,y:174,anim:4.2,flip:true},
    {type:"shroom",x:100,y:179,anim:1.8},{type:"bat",x:318,y:109,anim:5.8,flip:true}
  ];
  const demoGems=[[165,151],[187,163],[246,163],[260,170],[276,140],[331,157],[134,103],[292,110]];
  const fireflies=Array.from({length:38},(_,i)=>({x:((i*73+51)%440)+20,y:(i*31+23)%215+12,phase:i*1.86}));
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ellipse(ctx,x,y,rx,ry,color) {
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(Math.round(x),Math.round(y),rx,ry,0,0,Math.PI*2);ctx.fill();
  }
  function glow(ctx,x,y,r,color) {
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function ring(ctx,x,y,r,color,width=1,aspect=1) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(x,y,r,r*aspect,0,0,Math.PI*2);ctx.stroke();
  }
  function cross(ctx,x,y,size,color) {
    ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y-size),1,size*2+1);ctx.fillRect(Math.round(x-size),Math.round(y),size*2+1,1);
  }
  function drawFire(ctx,t) {
    const {x,y}=G.CAMP;
    glow(ctx,x,y-5,21+Math.sin(t*7)*2,"#ffc05356");
    ellipse(ctx,x,y+1,13,3,"#17201977");
    for(let i=0;i<9;i++){
      const a=i*Math.PI*2/9,xx=Math.round(x+Math.cos(a)*9.5),yy=Math.round(y-1+Math.sin(a)*3.6);
      ctx.fillStyle=i%2?"#52615a":"#414e45";ctx.fillRect(xx-2,yy-1,4,2);ctx.fillStyle="#a5a78a";ctx.fillRect(xx-1,yy-2,2,1);
    }
    A.draw(ctx,"fire",x,y,{scale:.72,frame:t*6});
    if(!reduced)for(let i=0;i<7;i++){
      const prog=(t*(.51+i*.019)+i/7)%1,xx=x+Math.sin(t*1.9+i*2.2)*3+prog*(i%2?3:-3);
      ctx.globalAlpha=(1-prog)*.9;ctx.fillStyle=i%2?"#ffd58c":"#f0a14e";
      ctx.fillRect(Math.round(xx),Math.round(y-11-prog*17),1,1);
    }
    ctx.globalAlpha=1;
  }
  function drawGem(ctx,g,t) {
    const shift=reduced?0:Math.sin(t*3.3+g.anim)*.9, y=g.y-1.7+shift;
    if(g.kind==="heart"){
      glow(ctx,g.x,y-2,7,"#f390703e");A.draw(ctx,"vigor",g.x,y,{scale:.42});return;
    }
    const size=g.value>=4?.90:.67;
    ellipse(ctx,g.x,g.y+.5,2.3,1,"#152b1d70");
    glow(ctx,g.x,y-2,5.2,"#89ffce50");A.draw(ctx,"gem",g.x,y,{scale:size});
    if(!reduced&&Math.sin(t*2+g.anim)>.91)cross(ctx,g.x+2,y-5,1,"#dbffdd");
  }
  function pixelRune(ctx,x,y,color,light) {
    x=Math.round(x);y=Math.round(y);
    ctx.fillStyle="#211e23";
    ctx.fillRect(x-1,y-6,3,12);
    ctx.fillRect(x-3,y-4,7,8);
    ctx.fillRect(x-4,y-2,9,4);
    ctx.fillStyle=color;
    ctx.fillRect(x,y-5,1,10);
    ctx.fillRect(x-2,y-3,5,6);
    ctx.fillRect(x-3,y-1,7,2);
    ctx.fillStyle=light;
    ctx.fillRect(x,y-4,1,6);
    ctx.fillRect(x-1,y-2,2,3);
  }
  function trialGround(ctx,trial,t) {
    const {x,y}=trial;
    if(trial.phase==="offered"){
      const pulse=reduced?0:Math.sin(t*4)*1.2;
      ellipse(ctx,x,y,13,9,"#f7ba5830");
      ring(ctx,x,y,13+pulse,"#ffd480c5",.9,.7);
      if(trial.charge>0){
        ctx.strokeStyle="#fff1b2";ctx.lineWidth=1.9;ctx.beginPath();
        ctx.ellipse(x,y,13,9,0,-Math.PI/2,-Math.PI/2+Math.PI*2*trial.charge/.7);
        ctx.stroke();
      }
      return;
    }
    if(trial.kind==="hold"){
      const rules=G.TRIALS.hold;
      ellipse(ctx,x,y,rules.radius,rules.radius,"#eab95622");
      ring(ctx,x,y,rules.radius,"#d0a858b4",1);
      if(trial.progress>0){
        ctx.strokeStyle="#ffda90";ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(x,y,rules.radius,-Math.PI/2,-Math.PI/2+Math.PI*2*trial.progress/rules.goal);ctx.stroke();
      }
    }
    for(const target of trial.targets){
      if(target.taken)continue;
      const lift=reduced?0:Math.sin(t*4+target.x);
      ellipse(ctx,target.x,target.y,5,2,"#25221b92");
      glow(ctx,target.x,target.y-7,11,"#ffc75465");
      pixelRune(ctx,target.x,target.y-8+lift,"#df9b3f","#fff1ae");
    }
  }
  function altarArt(ctx,trial,t) {
    const x=Math.round(trial.x),y=Math.round(trial.y);
    const lift=reduced?0:Math.sin(t*3.8)*1.4;
    glow(ctx,x,y-11,18,"#ffc9684d");
    ellipse(ctx,x,y+1,10,3,"#20241a9c");
    ctx.fillStyle="#252d29";ctx.fillRect(x-8,y-5,16,6);
    ctx.fillStyle="#515d50";ctx.fillRect(x-7,y-5,14,3);
    ctx.fillStyle="#8e9577";ctx.fillRect(x-5,y-7,10,2);
    ctx.fillStyle="#434c43";ctx.fillRect(x-4,y-13,8,7);
    ctx.fillStyle="#6f7865";ctx.fillRect(x-4,y-13,6,5);
    ctx.fillStyle="#b6a66c";ctx.fillRect(x-6,y-15,12,2);
    ctx.fillStyle="#c6a55a";ctx.fillRect(x-2,y-11,4,3);
    ctx.fillStyle="#f8d38a";ctx.fillRect(x-1,y-12,2,3);
    pixelRune(ctx,x,y-22+lift,"#e8a842","#fff1b4");
    if(!reduced&&Math.sin(t*8)>.35)cross(ctx,x+7,y-23+lift,1,"#ffd884");
  }
  function trialDirection(ctx,view,hero,trial,mobs) {
    let targets=[trial];
    if(trial.phase==="active"){
      if(trial.kind==="shards")targets=trial.targets.filter(target=>!target.taken);
      if(trial.kind==="hunt")targets=mobs.filter(mob=>mob.trialId===trial.id);
    }
    if(!targets.length)return;
    const left=view.x+12,right=view.x+view.w-12,top=view.y+18,bottom=view.y+view.h-12;
    if(targets.some(target=>target.x>=left&&target.x<=right&&target.y>=top&&target.y<=bottom))return;
    let nearest=targets[0],best=Infinity;
    for(const target of targets){
      const d=Math.hypot(target.x-hero.x,target.y-hero.y);
      if(d<best){best=d;nearest=target;}
    }
    const dx=nearest.x-hero.x,dy=nearest.y-hero.y;
    const horizontal=dx>0?(right-hero.x)/dx:dx<0?(left-hero.x)/dx:Infinity;
    const vertical=dy>0?(bottom-hero.y)/dy:dy<0?(top-hero.y)/dy:Infinity;
    const step=G.clamp(Math.min(horizontal,vertical),0,1);
    ctx.save();
    ctx.translate(G.clamp(hero.x+dx*step,left,right),G.clamp(hero.y+dy*step,top,bottom));
    ctx.rotate(Math.atan2(dy,dx));
    ctx.fillStyle="#22241b";ctx.fillRect(-5,-4,6,9);ctx.fillRect(1,-2,4,5);
    ctx.fillStyle=trial.kind==="hunt"?"#d6a2ef":"#ffe092";
    ctx.fillRect(-4,-3,4,7);ctx.fillRect(0,-2,2,5);ctx.fillRect(2,-1,2,3);
    ctx.restore();
  }
  function mobArt(ctx,m,t) {
    const bat=m.type==="bat", boss=m.type==="warden",s=(m.elite?1.2:1)*(boss?1.08:bat?.88:m.type==="skeleton"?.94:1);
    const lift=bat?3+Math.sin(t*5+m.anim)*1.4:0;
    const step=reduced?0:Math.sin(t*(bat?5.2:3.3)+m.anim)>.3?1:0;
    if(m.spawn>.08){ring(ctx,m.x,m.y,4+m.spawn*14,"#d9caf477",.8,.42);}
    ellipse(ctx,m.x,m.y+.8,boss?11:bat?6.5:m.type==="slime"?7.5:5.5,boss?3.3:2,"#101d1773");
    if(m.elite)ring(ctx,m.x,m.y+.5,8.5,m.trialId?"#e1a5f8cc":"#e7b760b8",.75,.35);
    if(m.boss&&m.wind>0){
      const p=1-m.wind/1.15,r=m.final?30:26;
      ellipse(ctx,m.x,m.y,r,r*.86,"#ee635d36");ring(ctx,m.x,m.y,r,"#ffc5a0",1,.86);ring(ctx,m.x,m.y,Math.max(.5,r*p),"#ef826e",1.4,.86);
    }
    ctx.globalAlpha=m.spawn>.12?.72:1;
    A.draw(ctx,m.type,m.x,m.y-lift,{scale:s,frame:step,flip:!!m.flip,hit:m.hit>.035});
    ctx.globalAlpha=1;
    if(m.slow>0){ctx.fillStyle="#b2e8e6";ctx.fillRect(Math.round(m.x-4),Math.round(m.y),3,1);ctx.fillRect(Math.round(m.x+2),Math.round(m.y-1),2,1);}
    if(m.maxHp&&m.hp<m.maxHp&&!boss){
      const yy=m.y-(bat?20:m.type==="skeleton"?25:17)*s;
      ctx.fillStyle="#182019";ctx.fillRect(Math.round(m.x-6),Math.round(yy),12,2);
      ctx.fillStyle=m.elite?"#f9c967":"#d98577";ctx.fillRect(Math.round(m.x-6),Math.round(yy),Math.max(1,Math.ceil(m.hp/m.maxHp*12)),1);
    }
    if(m.trialId){
      const height=bat?17:m.type==="slime"?14:24;
      pixelRune(ctx,m.x,m.y-height*s-lift-7,"#b779d9","#f5d8ff");
    }
  }
  function drawHero(ctx,h,t,idle) {
    ellipse(ctx,h.x,h.y+1,7.4,2.4,"#1421178c");
    if(idle){ring(ctx,h.x,h.y+.8,10.2,"#ffe6a075",.8,.31);}
    if(h.dash>0&&!reduced){
      for(let i=3;i>=1;i--){
        ctx.globalAlpha=.10+.06*(3-i);A.draw(ctx,"hero",h.x-h.dashX*i*4,h.y-h.dashY*i*4,{frame:1,flip:h.flip});
      }ctx.globalAlpha=1;
    }
    const frame=h.walking?Math.floor(t*8):0;
    const blink=!idle&&h.immune>.06&&h.dash<=0&&Math.floor(t*13)%2;
    ctx.globalAlpha=blink?.57:1;
    A.draw(ctx,"hero",h.x,h.y-(h.walking&&frame%2?1:0),{frame,flip:h.flip,scale:1.13,hit:!idle&&h.sinceHit<.09});
    ctx.globalAlpha=1;
    if(idle){
      const xx=Math.round(h.x),yy=Math.round(h.y-36+(reduced?0:Math.sin(t*2)*1.0));
      ctx.fillStyle="#2c3021";ctx.fillRect(xx-4,yy-1,8,3);ctx.fillRect(xx-2,yy+2,4,2);
      ctx.fillStyle="#ffcd70";ctx.fillRect(xx-3,yy,6,2);ctx.fillRect(xx-1,yy+2,2,2);
    }
  }
  function projectile(ctx,s,t){
    if(s.type==="spore"){
      glow(ctx,s.x,s.y,5.4,"#c575d65c");ellipse(ctx,s.x,s.y,2.3,2.3,"#714080");
      ctx.fillStyle="#e1a1e4";ctx.fillRect(Math.round(s.x)-1,Math.round(s.y)-1,2,2);return;
    }
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));
    const frost=s.type==="frost";
    ctx.fillStyle=frost?"#9daff060":"#ffb24f77";ctx.fillRect(-9,-.7,7,1.4);
    ctx.fillStyle=frost?"#3c83a0":"#704a38";ctx.fillRect(-4,-1.5,6,3);
    ctx.fillStyle=frost?"#99eaf3":"#dce3c8";ctx.fillRect(-2,-1,6,2);ctx.fillStyle="#fff6cc";ctx.fillRect(1,-1,3,1);
    ctx.fillStyle=frost?"#d9ffff":"#eda846";ctx.fillRect(-3,-2,1,4);ctx.restore();
  }
  function drawFx(ctx,e,t) {
    const p=1-e.life/e.max,alpha=Math.max(0,1-p);
    ctx.save();ctx.globalAlpha=alpha;
    if(e.type==="arc"){
      ctx.beginPath();ctx.moveTo(e.x,e.y);
      const dx=e.x2-e.x,dy=e.y2-e.y,len=Math.hypot(dx,dy)||1;
      for(let j=1;j<=5;j++){const z=j/5,shift=j===5?0:Math.sin(j*13+e.seed)*3;ctx.lineTo(e.x+dx*z+dy/len*shift,e.y+dy*z-dx/len*shift);}
      ctx.strokeStyle=e.warm?"#dc9c6a":"#bb7dde";ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle=e.warm?"#fff2bd":"#f0d7ff";ctx.lineWidth=.8;ctx.stroke();
    }else if(e.type==="burst"){
      for(let i=0;i<(e.big?15:7);i++){
        const a=i*2.399+e.seed,r=p*(e.big?22:9)+2;
        ctx.fillStyle=i%3?e.color:"#f1e4ae";ctx.fillRect(Math.round(e.x+Math.cos(a)*r),Math.round(e.y+Math.sin(a)*r),e.big?2:1.5,1.5);
      }
    }else if(e.type==="evolvedImpact"){
      const radius=e.r*(.32+p*.68),color=e.frost?"#adf4ff":"#ffd287";
      ellipse(ctx,e.x,e.y,radius,radius*.8,e.frost?"#9ef5ff38":"#ffad5339");
      ring(ctx,e.x,e.y,radius,color,1.1,.8);
      ctx.fillStyle=color;
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4+.2;
        ctx.fillRect(Math.round(e.x+Math.cos(angle)*radius),Math.round(e.y+Math.sin(angle)*radius*.8),2,2);
      }
    }else if(e.type==="stomp"){ring(ctx,e.x,e.y,Math.max(2,e.r*(.65+p*.55)),"#ffb086",2,.86);}
    else if(e.type==="collect"){cross(ctx,e.x,e.y-2-p*6,1.5,"#9effdb");}
    else if(e.type==="heal"){cross(ctx,e.x,e.y-p*7,2,"#aff1ae");}
    else if(e.type==="dash"){ring(ctx,e.x-e.dx*2,e.y-e.dy*2,3+p*9,"#d0f9d3",1,.4);}
    ctx.restore();
  }
  class ForestField {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext("2d",{alpha:false});this.bg=new Image();
      this.bg.src="assets/forest.webp";this.view={x:0,y:0,w:480,h:270};
      this.updateSize();this.observer=new ResizeObserver(()=>this.updateSize());this.observer.observe(canvas);
    }
    updateSize(){
      const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const ratio=rect.width/rect.height;
      this.view.w=Math.min(480,270*ratio);this.view.h=Math.min(270,480/ratio);
      this.canvas.width=Math.round(this.view.w*2);this.canvas.height=Math.round(this.view.h*2);
    }
    worldPoint(x,y) {
      const r=this.canvas.getBoundingClientRect(),v=this.view;
      return {x:v.x+(x-r.left)/r.width*v.w,y:v.y+(y-r.top)/r.height*v.h};
    }
    draw(s,t,lobby,target) {
      const ctx=this.ctx,can=this.canvas,v=this.view;
      const hero=s?s.hero:{x:246,y:146,flip:false,walking:false,immune:0,dash:0,sinceHit:10};
      const tx=G.clamp(hero.x-v.w/2,0,480-v.w),ty=G.clamp((lobby?135:hero.y-5)-v.h/2,0,270-v.h);
      v.x=Math.round(tx*2)/2;v.y=Math.round(ty*2)/2;
      ctx.setTransform(can.width/v.w,0,0,can.height/v.h,-v.x*can.width/v.w,-v.y*can.height/v.h);ctx.imageSmoothingEnabled=false;
      if(this.bg.complete&&this.bg.naturalWidth)ctx.drawImage(this.bg,0,0,480,270);
      else{ctx.fillStyle="#28482e";ctx.fillRect(0,0,480,270);}
      ctx.fillStyle="#10332612";ctx.fillRect(0,0,480,270);
      const simTime=s?s.sec:t;
      const trial=lobby?null:s?.trials?.current;
      if(s&&!lobby&&s.endless){ctx.fillStyle="#4b1e4d1a";ctx.fillRect(0,0,480,270);}
      if(!reduced){
        for(const f of fireflies){
          const b=Math.sin(t*.9+f.phase);if(b<.28)continue;
          const x=f.x+Math.sin(t*.57+f.phase)*2.7,y=f.y+Math.cos(t*.83+f.phase)*1.5;
          ctx.globalAlpha=b*.81;ctx.fillStyle=f.phase%2>1?"#ffda79":"#c7e7a0";ctx.fillRect(Math.round(x),Math.round(y),1,1);
        }
        ctx.globalAlpha=1;
      }
      if(trial)trialGround(ctx,trial,t);
      if(s)for(const g of s.gems)drawGem(ctx,g,t);
      else demoGems.forEach(([x,y],i)=>drawGem(ctx,{x,y,kind:"gem",value:1,anim:i*1.7},t));
      if(target&&!lobby){ring(ctx,target.x,target.y,3.4+Math.sin(t*8)*.6,"#f0dfa1",.85,.52);cross(ctx,target.x,target.y,1,"#fff3b9");}
      const actors=(s?s.mobs:demoMobs).map(m=>({y:m.y,type:"mob",m}));
      actors.push({y:G.CAMP.y,type:"fire"},{y:hero.y,type:"hero"});
      if(trial&&(trial.phase==="offered"||trial.kind==="hold"))actors.push({y:trial.y,type:"altar"});
      actors.sort((a,b)=>a.y-b.y);
      for(const a of actors){
        if(a.type==="fire")drawFire(ctx,t);
        else if(a.type==="hero")drawHero(ctx,hero,t,lobby);
        else if(a.type==="altar")altarArt(ctx,trial,t);
        else mobArt(ctx,a.m,t);
      }
      if(s){
        for(const orb of G.orbiters(s)){
          glow(ctx,orb.x,orb.y,8,"#ffb94f50");ctx.fillStyle="#ef873e";ctx.fillRect(Math.round(orb.x)-2,Math.round(orb.y)-2,5,4);
          ctx.fillStyle="#ffda6e";ctx.fillRect(Math.round(orb.x)-1,Math.round(orb.y)-3,3,4);ctx.fillStyle="#fff4b1";ctx.fillRect(Math.round(orb.x),Math.round(orb.y)-1,1,2);
        }
        for(const a of s.shots)projectile(ctx,a,simTime);
        for(const e of s.fx)drawFx(ctx,e,t);
        ctx.textAlign="center";ctx.textBaseline="bottom";ctx.font="bold 6.5px monospace";
        for(const n of s.numbers){
          const p=1-n.life/n.max,y=Math.round(n.y-p*7);ctx.globalAlpha=Math.min(1,n.life*6);
          ctx.lineWidth=1.5;ctx.strokeStyle="#2b3428";ctx.strokeText(n.text,n.x,y);ctx.fillStyle=n.color;ctx.fillText(n.text,n.x,y);
        }
        ctx.globalAlpha=1;
        if(s.hero.sinceHit<.22&&!lobby&&!reduced){ctx.fillStyle="rgba(202,65,45,"+(.13*(1-s.hero.sinceHit/.22))+")";ctx.fillRect(v.x,v.y,v.w,v.h);}
        if(trial)trialDirection(ctx,v,hero,trial,s.mobs);
      }
    }
  }
  window.ForestField=ForestField;
})();
