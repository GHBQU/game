/* 纸片勇者 — 异境地形：反常空间规则与专属绘制
 *
 * 常规关卡 def.odd 缺省，这里所有钩子都是空操作，物理与渲染一条都不改。
 * 四类规则互不共用：
 *   loop  环形纸带   —— 左右边界消失，走到尽头从另一头翻回来（边界反常）
 *   gate  纸洞群     —— 互不相邻的孤岛，只有纸洞能跨越（空间连接反常）
 *   phase 叠影夹缝   —— 同一坐标叠着两套互相矛盾的地形（形态反常）
 *   well  落天井     —— 往下掉却从正上方落回来（垂直方向反常）
 */
(function (PH) {
  const T = 32;
  const U = PH.U;

  const INK = '#3A2A1E';
  const VIOLET = '#6B4A96';
  const TEAL = '#2F7F88';

  function roughLine(ctx, x0, y0, x1, y1, seed) {
    const n = Math.max(2, Math.round(Math.abs(y1 - y0) / 14));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const wob = Math.sin(seed * 12.7 + i * 2.3) * 2.6;
      ctx.lineTo(x0 + (x1 - x0) * t + wob, y0 + (y1 - y0) * t);
    }
    ctx.stroke();
  }

  // 撕开的纸口：一个被剪掉一块的暖色椭圆
  function paperHole(ctx, cx, cy, rx, ry, tone) {
    ctx.save();
    ctx.fillStyle = tone || 'rgba(46,30,26,0.82)';
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const j = 1 + Math.sin(i * 5.3 + cx * 0.01) * 0.07;
      const x = cx + Math.cos(a) * rx * j;
      const y = cy + Math.sin(a) * ry * j;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(253,246,227,0.9)';
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(253,246,227,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.68, ry * 0.62, 0, 0, 7);
    ctx.stroke();
    ctx.restore();
  }

  function tag(ctx, x, y, text, color, size) {
    PH.Paper.text(ctx, text, x, y, {
      size: size || 12,
      align: 'center',
      color: '#FDF6E3',
      weight: '800',
      outline: color || VIOLET,
      outlineW: 4,
    });
  }

  const Odd = {};

  /* ---------------- 装载 ---------------- */
  Odd.install = function (w, def) {
    const cfg = def && def.odd;
    if (!cfg) return;
    w.odd = {
      kind: cfg.kind,
      cfg,
      cool: 0,
      wraps: 0,
      layer: 0,
      lastFold: -1,
      grids: cfg.grids || null,
    };
    if (cfg.kind === 'phase' && cfg.grids && cfg.grids.length > 1) {
      w.grid = cfg.grids[0];
      w.props = []; // 草丛按一层生成，叠影关不摆装饰，免得切页后浮在半空
    }
  };

  /* ---------------- 每帧：玩家物理更新之前 ---------------- */
  Odd.preUpdate = function (w, dt) {
    const s = w.odd;
    if (!s || w.won || w.duel || w.online) return;
    if (s.cool > 0) s.cool -= dt;
    const p = w.player;
    if (!p || p.dead || p.bubbled || p.eliminated) return;

    if (s.kind === 'loop') {
      const edge = (w.level.w - 2) * T;
      let to = 0;
      if (p.x > edge) to = 1.2 * T;
      else if (p.x < T && p.vx < 0) to = (w.level.w - 2.2) * T;
      if (to) {
        p.x = to;
        p.lastSafe = { x: p.x, y: p.y };
        s.wraps++;
        w.burst(p.cx, p.cy, 16, { color: '#B79AE0', kind: 'paper' });
        PH.Audio.sfx('power');
        if (s.wraps === 1) w.toast('纸带是接着的：尽头就是另一头');
        w.updateCamera(0.016, true);
      }
      return;
    }

    if (s.kind === 'gate') {
      if (s.cool > 0) return;
      for (const g of s.cfg.gates) {
        if (p.x + p.w < g.x0 * T || p.x > g.x1 * T) continue;
        if (p.y + p.h < g.y0 * T || p.y > g.y1 * T) continue;
        p.x = g.toX * T;
        p.y = g.toY * T;
        p.vx = g.flip ? -70 : 70;
        p.vy = 50;
        p.facing = g.flip ? -1 : 1;
        p.onGround = false;
        p.lastSafe = { x: p.x, y: p.y };
        s.cool = 0.9;
        w.burst(p.cx, p.cy, 22, { color: '#C9A6EA', kind: 'paper' });
        PH.Audio.sfx('power');
        w.toast(g.label || '纸洞把你吐到了另一座岛');
        w.updateCamera(0.016, true);
        break;
      }
      return;
    }

    if (s.kind === 'phase') {
      const folds = s.cfg.folds;
      let hit = -1;
      for (let i = 0; i < folds.length; i++) {
        const f = folds[i];
        if (p.cx >= f.x * T && p.cx <= (f.x + f.w) * T) { hit = i; break; }
      }
      if (hit >= 0 && hit !== s.lastFold && s.cool <= 0) {
        const f = folds[hit];
        s.layer = f.to;
        w.grid = s.grids[f.to];
        w.props = [];
        p.x = (f.x + f.w + 0.5) * T;
        p.y = f.floor * T - p.h - 4;
        p.vx = 0;
        p.vy = 0;
        p.onGround = false;
        p.lastSafe = { x: p.x, y: p.y };
        s.cool = 0.45;
        w.burst(p.cx, p.cy, 20, { color: '#8FD0D6', kind: 'paper' });
        PH.Audio.sfx('unlock');
        w.toast(f.label || '折页了：脚下换成了另一套地形');
        w.updateCamera(0.016, true);
      }
      s.lastFold = hit;
      return;
    }

    if (s.kind === 'well') {
      if (s.cool > 0) return;
      for (const wl of s.cfg.wells) {
        if (p.cx < wl.x0 * T || p.cx > wl.x1 * T) continue;
        if (p.y < wl.triggerY * T) continue;
        p.x = wl.outX * T + (p.cx - wl.x0 * T) - p.w / 2;
        p.y = wl.outY * T;
        p.vx = 0;
        p.vy = 70;
        p.facing = 1;
        p.onGround = false;
        p.lastSafe = { x: p.x, y: p.y };
        s.cool = 0.85;
        w.burst(p.cx, p.cy, 18, { color: '#F2C14E', kind: 'paper' });
        PH.Audio.sfx('power');
        w.toast('掉进井里，却从天上落了回来');
        w.updateCamera(0.016, true);
        break;
      }
    }
  };

  /* ---------------- 绘制：世界坐标，紧跟在地形之后 ---------------- */
  Odd.draw = function (w, ctx, camX, camY) {
    const s = w.odd;
    if (!s) return;
    const H = w.level.h * T;
    const W = w.level.w * T;
    const x0 = Math.floor(camX / T) - 2;
    const x1 = Math.floor((camX + 960) / T) + 2;

    if (s.kind === 'loop') {
      // 两端的「接缝」：一整条竖向撕纸线，配上循环箭头
      [[0, '↻ 接缝'], [W, '接缝 ↺']].forEach(([sx, label], k) => {
        if (sx < camX - 90 || sx > camX + 1050) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(107,74,150,0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        roughLine(ctx, sx, 0, sx, H, k + 3);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(107,74,150,0.13)';
        ctx.fillRect(sx - 7, 0, 14, H);
        ctx.rotate(0);
        ctx.restore();
        tag(ctx, sx, 274, label, VIOLET, 13);
        for (let y = 306; y < H; y += 74) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          PH.Paper.text(ctx, '⇄', sx, y, { size: 20, align: 'center', color: '#F3E7FF', outline: VIOLET, outlineW: 3, weight: '900' });
          ctx.restore();
        }
      });
      return;
    }

    if (s.kind === 'gate') {
      s.cfg.gates.forEach((g, i) => {
        const cx = ((g.x0 + g.x1) / 2) * T;
        const cy = ((g.y0 + g.y1) / 2) * T;
        if (cx > camX - 120 && cx < camX + 1080) {
          paperHole(ctx, cx, cy, ((g.x1 - g.x0) / 2) * T + 8, 34, 'rgba(52,30,62,0.88)');
          tag(ctx, cx, cy - 40, '纸洞 ' + (i + 1), VIOLET, 13);
        }
        // 出口：从空中掉下来的落点
        const ex = g.toX * T, ey = g.toY * T;
        if (ex > camX - 120 && ex < camX + 1080) {
          ctx.save();
          ctx.strokeStyle = 'rgba(107,74,150,0.7)';
          ctx.lineWidth = 2.4;
          ctx.setLineDash([5, 6]);
          ctx.beginPath();
          ctx.ellipse(ex + 12, ey + 14, 26, 10, 0, 0, 7);
          ctx.stroke();
          ctx.setLineDash([]);
          PH.Paper.text(ctx, '↓', ex + 12, ey - 6, { size: 24, align: 'center', color: '#F3E7FF', outline: VIOLET, outlineW: 4, weight: '900' });
          ctx.restore();
          tag(ctx, ex + 12, ey + 46, '出口 · 朝向反了', VIOLET, 11.5);
        }
      });
      // 断裂带：把「不可跨越」画出来
      for (const cut of s.cfg.cuts || []) {
        const lx = cut[0] * T, rx = cut[1] * T;
        if (rx < camX || lx > camX + 960) continue;
        ctx.save();
        ctx.strokeStyle = 'rgba(107,74,150,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.moveTo(lx, 11.4 * T);
        ctx.lineTo(rx, 11.4 * T);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        tag(ctx, (lx + rx) / 2, 11.4 * T - 16, '这里没有路', VIOLET, 12);
      }
      return;
    }

    if (s.kind === 'phase') {
      // 另一页的地形：半透明轮廓，让「两套地形同时存在」看得见
      const ghost = s.grids[1 - s.layer];
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.17;
        ctx.fillStyle = s.layer === 0 ? '#2F7F88' : '#8C6B46';
        for (let tx = Math.max(0, x0); tx <= Math.min(w.level.w - 1, x1); tx++) {
          for (let ty = 0; ty < w.level.h; ty++) {
            if (!ghost[ty] || !ghost[ty][tx]) continue;
            ctx.fillRect(tx * T + 2, ty * T + 2, T - 4, T - 4);
          }
        }
        ctx.restore();
      }
      tag(ctx, camX + 960 - 108, 96, s.layer === 0 ? '当前页 · 下层' : '当前页 · 上层', TEAL, 13);
      s.cfg.folds.forEach((f) => {
        const fx = (f.x + f.w / 2) * T;
        if (fx < camX - 60 || fx > camX + 1020) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(47,127,136,0.9)';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([6, 5]);
        roughLine(ctx, fx, 0, fx, H, f.x);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(47,127,136,0.1)';
        ctx.fillRect(f.x * T, 0, f.w * T, H);
        ctx.restore();
        tag(ctx, fx, 274, '折痕 · 翻到' + (f.to === 1 ? '上层' : '下层'), TEAL, 12);
      });
      return;
    }

    if (s.kind === 'well') {
      for (const wl of s.cfg.wells) {
        const cx = ((wl.x0 + wl.x1) / 2) * T;
        if (cx > camX - 120 && cx < camX + 1080) {
          paperHole(ctx, cx, 12.7 * T, ((wl.x1 - wl.x0) / 2) * T, 20, 'rgba(38,26,44,0.85)');
          tag(ctx, cx, 12.7 * T - 30, '井 · 往下走', '#8A5A16', 12);
          // 从井口绕到天上的虚线
          ctx.save();
          ctx.strokeStyle = 'rgba(242,193,78,0.62)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([4, 8]);
          ctx.beginPath();
          ctx.moveTo(cx, 12.4 * T);
          ctx.bezierCurveTo(cx - 120, 8 * T, cx + 130, 4 * T, cx, 1.2 * T);
          ctx.stroke();
          ctx.setLineDash([]);
          PH.Paper.text(ctx, '↑', cx, 1.6 * T, { size: 22, align: 'center', color: '#FFF3D0', outline: '#8A5A16', outlineW: 4, weight: '900' });
          ctx.restore();
        }
      }
      // 倒挂地板的挂线
      for (const seg of s.cfg.ceiling || []) {
        const lx = seg[0] * T, rx = seg[1] * T;
        if (rx < camX || lx > camX + 960) continue;
        ctx.save();
        ctx.strokeStyle = 'rgba(242,193,78,0.35)';
        ctx.lineWidth = 1.6;
        for (let x = Math.max(lx, Math.floor(camX / 32) * 32); x < Math.min(rx, camX + 960); x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 4 * T - 4);
          ctx.stroke();
        }
        ctx.restore();
        tag(ctx, (lx + rx) / 2, 270, '倒挂的一层 · 从井里上来', '#8A5A16', 12);
      }
    }
  };

  // 单人扣命回存档点：存档点 / 起点都在第一页，规则状态必须一起归位，
  // 否则叠影关会在「上层地形 + 下层坐标」的组合里反复摔死
  Odd.reset = function (w) {
    const s = w.odd;
    if (!s) return;
    s.cool = 0.6;
    s.lastFold = -1;
    s.layer = 0;
    s.wraps = 0;
    if (s.kind === 'phase' && s.grids) {
      w.grid = s.grids[0];
      w.props = [];
    }
  };

  Odd.rule = function (def) {
    return def && def.odd ? def.odd.rule || '' : '';
  };

  PH.Oddity = Odd;
})(window.PH);
