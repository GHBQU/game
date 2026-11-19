'use strict';
// 场景切换、输入分发、主循环。

function go(name) {
  scene = name; sceneT0 = now;
  lastKey = -1;
  SFX.ambient(name === 'booth');
  if (name === 'intro') INTRO_LINES = typeLines(INTRO_PARAS);
  if (name === 'title') SFX.play('title', 0.8);
  if (name === 'daycard') SFX.play('day_hit');
  if (name === 'news') { SFX.play('whoosh'); SFX.paper(31); }
  if (name === 'summary') { SFX.play('sad', 0.9); initSummary(); }
  if (name === 'end') SFX.play('end', 0.8);
  if (name === 'booth') startDay();
}

// ———————————————————— 输入 ————————————————————

function toGame(ev) {
  const r = canvasEl.getBoundingClientRect();
  return [Math.floor((ev.clientX - r.left) * W / r.width), Math.floor((ev.clientY - r.top) * H / r.height)];
}

function onDown(ev) {
  SFX.init();
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, down: true, mouse: ev.pointerType === 'mouse' });
  if (canvasEl.setPointerCapture) canvasEl.setPointerCapture(ev.pointerId);
  ev.preventDefault();
  if (scene === 'booth') boothInput(x, y);
  else if ((portalDown = portalAt(x, y))) return;   // 传送门：松手再打开
  else sceneClick(x, y);
}

function onMove(ev) {
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, mouse: ev.pointerType === 'mouse' });
  if (drag) dragMove(x, y);
}

function onUp(ev) {
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, down: false });
  if (drag) dragEnd(x, y);
  if (portalDown) { if (portalAt(x, y) === portalDown) openPortal(portalDown); portalDown = null; }
}

// 剧情自己在演的时候（额度用完、作者、结局），不接受操作
const scripted = () => B.limit || B.authorSeq || B.endingSeq || B.trayPush;

function boothInput(x, y) {
  if (B.cut) { if (now - B.cut.t0 > CHAT.tMail + 4) chatDone(); return; }
  if (B.closeup) return;
  if (scripted()) return;
  if (B.event && (B.event.type === 'rush' || B.event.type === 'flood')) {
    if (inBox(x, y, RUSH_APPROVE)) rushPick('approve');
    else if (inBox(x, y, RUSH_DENY)) rushPick(B.event.type === 'flood' ? 'detain' : 'deny');
    return;
  }
  boothDown(x, y);
}

function boothDown(x, y) {
  if (B.insp.on) {
    if (inBox(x, y, INSPECT_BTN)) return setInspect(false);
    if (inBox(x, y, XRAY_BTN)) return setXray(!B.xray.on);
    if (S.day >= 4 && inBox(x, y, BAN_BTN)) return toggleBan();
    return inspectClick(x, y);
  }
  const tx = trayX(), u = trayU();
  if (inBox(x, y, [tx - 14, 204, tx - 1, 244])) return setTray(!B.tray.open);
  if (u > 0.6) {
    for (const kind of ['approve', 'deny']) if (inBox(x, y, stampBtnBox(kind, tx))) return stamp(kind);
    if (inBox(x, y, [tx, TRAY_Y0, W - 1, TRAY_Y1])) return;
  }
  if (inBox(x, y, INSPECT_BTN)) return setInspect(true);
  if (inBox(x, y, XRAY_BTN)) return setXray(!B.xray.on);
  if (S.day >= 3 && inBox(x, y, LOCATE_BTN)) return locate();
  if (S.day >= 4 && inBox(x, y, LOOKUP_BTN)) return lookup();
  if (S.day >= 4 && inBox(x, y, BAN_BTN)) return toggleBan();
  if (inBox(x, y, SPEAKER)) return callNext();
  if (inBox(x, y, DETAIN_BTN)) return detain();
  if (inBox(x, y, QUIZ_BTN)) return quiz();
  if (B.ban && inBox(x, y, BANLIST)) {
    if (inBox(x, y, BAN_PREV)) banFlip(-1);
    else if (inBox(x, y, BAN_NEXT)) banFlip(1);
    return;
  }
  for (const d of [...B.docs].reverse()) {
    const box = d.big ? docBox(d) : [d.x, d.y, d.x + 18, d.y + 12];
    if (d.big && !inBox(x, y, DESK)) continue;
    if (inBox(x, y, box)) return dragStart(d, x, y);
  }
  if (inBox(x, y, BOOK_BOX)) return toggleRules();
}

function dragStart(d, x, y) {
  B.docs = B.docs.filter((o) => o !== d).concat([d]);
  drag = { d, startedBig: d.big, off: [x - d.x, y - d.y], prev: { big: d.big, x: d.x, y: d.y }, start: [x, y], moved: false };
  SFX.paper(d.x + d.y);
}

function dragMove(x, y) {
  const d = drag.d;
  if (Math.hypot(x - drag.start[0], y - drag.start[1]) > 3) drag.moved = true;
  if (!drag.moved) return;
  if (x < DESK[0]) { d.big = false; d.x = x - 8; d.y = y - 5; return; }
  d.big = true;
  const g = drag.startedBig ? drag.off : [Math.min(24, d.doc.w / 2), 12];
  d.x = Math.max(DESK[0] - g[0], Math.min(W - 30, x - g[0]));
  d.y = Math.max(DESK[1] - 8, Math.min(H - 24, y - g[1]));
}

function dragEnd(x, y) {
  const d = drag.d, prev = drag.prev, moved = drag.moved;
  drag = null;
  if (!moved) {
    if (d.big && ruleTabHit(d, x, y)) { d.doc.flip(); SFX.paper(2); }
    return;
  }
  if (d.big) {
    if (d.owner === 'ent' && d.key === 'pp') SFX.play('thud', 0.6); else SFX.paper(x);
    if (d.owner === 'ent') { S.tut.dragged = true; onFirstPlace(d); }
    return;
  }
  // 拖回了窗口那一侧
  if (d.key === 'cit') { B.docs = B.docs.filter((o) => o !== d); SFX.paper(3); return; }
  if (d.key === 'rule') { d.x = prev.x; d.y = prev.y; d.big = true; toggleRules(); return; }
  const e = B.ent;
  const bounce = () => { Object.assign(d, prev); if (!prev.big && d.slot) { d.x = d.slot[0]; d.y = d.slot[1]; } };
  if (d.gift) { bounce(); flash('锦旗是送你的，不用还'); return; }
  if (!e || (e.phase !== 'here' && e.phase !== 'waiting')) { bounce(); return; }
  if (d.key === e.spec.primary && !decisionOf(d)) {
    bounce();
    if (prev.big) flash('先在这本证件上盖章（右侧拉出印章栏），再还给旅客');
    return;
  }
  if (!prev.big) { bounce(); return; }   // 从柜台拿起又放回柜台：原样不动
  if (e.spec.ending && d.key === e.spec.primary) { bounce(); johnRefuse(e); return; }   // John 不走
  B.docs = B.docs.filter((o) => o !== d);
  d.returned = true;
  SFX.paper(7);
  if (d.key === e.spec.primary) S.tut.returned = true;
  checkLeave();
}

function sceneClick(x, y) {
  if (scene === 'boot') { langClick(x, y); return; }            // 开机就是选语言（同原作）
  if (scene === 'intro') { go('title'); return; }
  if (scene === 'title') { titleClick(x, y); return; }
  if (scene === 'news' && st() > 0.6) { go('booth'); return; }
  if (scene === 'summary') { summaryClick(x, y); return; }
  if ((scene === 'end' || scene === 'over') && st() > 1.5 && inBox(x, y, RESTART_BTN)) { clearSave(); newGame(); go('daycard'); }
}

// ———————————————————— 主循环 ————————————————————

function update() {
  if (scene === 'booth') {
    runTimers();
    if (B.cut) updateChat();
  }
  if (scene === 'boot') updateLangPick();
  if (scene === 'intro') { typedSounds(INTRO_LINES); if (st() > INTRO_LINES.end) go('title'); }
  if (scene === 'daycard' && st() > 2.2) go('news');
}

function render() {
  setCtx(F.getContext('2d'));
  const t = st();
  if (scene === 'boot') drawLangPick();
  else if (scene === 'intro') drawTyped(INTRO_LINES);
  else if (scene === 'title') drawTitle(t);
  else if (scene === 'daycard') drawDayCard(t);
  else if (scene === 'news') drawNews(t);
  else if (scene === 'booth') { if (inChat()) drawChat(); else drawBooth(); }
  else if (scene === 'summary') drawSummary(t);
  else if (scene === 'end') drawEnd(t);
  else if (scene === 'over') drawOver(t);
  drawPortals();                                 // 标题页、片尾右下角的传送门（其它画面不画）

  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  let ox = 0, oy = 0;
  if (scene === 'booth') {
    const k = Math.floor((now - B.shake) * 30);
    if (k >= 0 && k < 4) [ox, oy] = [[0, 3], [1, -2], [-1, 1], [0, -1]][k];
  }
  g.fillStyle = K.INK; g.fillRect(0, 0, W, H);
  g.drawImage(F, ox, oy);
  let cursor = drag || portalAt(ptr.x, ptr.y) ? 'hand' : 'arrow';
  if (scene === 'booth' && !inChat()) {
    if (B.insp.on) composeInspect(g);
    setCtx(g);
    if (B.event && (B.event.type === 'rush' || B.event.type === 'flood')) drawRush();
    drawJinqiFly();
    drawTrayPush();
    if (B.limit) drawLimit();
    drawRegionBlock();
    drawBlackout();
    if (B.closeup) drawCloseup(g);
  }
  const hide = scene === 'booth' && (B.limit || B.blackout || B.closeup);
  if (ptr.mouse && !hide) {
    setCtx(g);
    drawCursor(ptr.x, ptr.y, cursor);
  }
}

const inChat = () => B.cut && now >= B.cut.t0;

function loop(ts) {
  now = ts / 1000;
  update();
  render();
  requestAnimationFrame(loop);
}

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvasEl.style.width = `${Math.floor(W * s)}px`;
  canvasEl.style.height = `${Math.floor(H * s)}px`;
}

function toggleMute() {
  SFX.init();
  SFX.toggleMute();
  updateMuteLabel();
}

function updateMuteLabel() {
  const b = document.getElementById('mute');
  if (b) b.textContent = T(SFX.muted ? '声音：关' : '声音：开');
}

function boot() {
  canvasEl = document.getElementById('game');
  applyDomLang();
  canvasEl.width = W; canvasEl.height = H;
  [F] = makeCanvas(W, H);
  fit();
  window.addEventListener('resize', fit);
  canvasEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') toggleMute(); });
  newGame();
  loadImages().then(() => {
    sceneT0 = performance.now() / 1000;
    // 预览：网址后面加 #end 直接看片尾，#title 直接看标题页（跳过选语言，用上次选的语言），#john 直接玩 Day 5 的 John
    const jump = location.hash.slice(1);
    if (jump === 'end' || jump === 'title') go(jump);
    if (jump === 'john') {
      S.day = LAST_DAY;
      for (const k of ['called', 'dragged', 'rules', 'tray', 'stamped', 'returned', 'inspect', 'locate', 'gpsFound', 'lookup', 'ban', 'xray', 'xrayFound', 'detain', 'quiz', 'tell']) S.tut[k] = true;   // 新手教学都算学过了
      go('daycard');
    }
    requestAnimationFrame(loop);
  });
}

window.addEventListener('DOMContentLoaded', boot);
