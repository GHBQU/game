/* ============================================================
   Super Kart 8 — hud.js
   HUD 更新 / 小地图 / 道具转盘 / 结算表
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const $ = (id) => document.getElementById(id);

  class HUD {
    constructor() {
      this.el = {
        hud: $('hud'),
        posNum: $('posNum'), posSuf: $('posSuf'),
        lapNum: $('lapNum'), hudTime: $('hudTime'),
        minimap: $('minimap'),
        itemSlot: $('itemSlot'), itemIcon: $('itemIcon'), itemCount: $('itemCount'), itemRoulette: $('itemRoulette'),
        coinBadge: $('coinBadge'), coinNum: $('coinNum'),
        speedFill: $('speedFill'), speedNum: $('speedNum'),
        centerMsg: $('centerMsg'), lapFlash: $('lapFlash'), wrongWay: $('wrongWay'),
        driftMeter: $('driftMeter'), driftFill: $('driftFill'),
        lapTimes: $('lapTimes'), hintBar: $('hintBar'),
        flash: $('flash'),
        rescueBox: $('rescueBox'), rescueFill: $('rescueFill'), rescueCount: $('rescueCount'), rescueSub: $('rescueSub'),
        hudTrack: $('hudTrack'), cupStrip: $('cupStrip'), netBadge: $('netBadge')
      };
      this.ctx = this.el.minimap.getContext('2d');
      this.rouletteTimer = 0;
      this.rouletteItem = null;
      this.msgTimer = 0;
      this._lastItemKey = '';
      this._hintTimer = 0;
      this._wrong = false;
      const m = this.el.minimap;
      this.mmPad = 16;
      this.mmSize = m.width;
    }

    show() { this.el.hud.classList.remove('hidden'); }
    hide() { this.el.hud.classList.add('hidden'); }

    setLaps(total) {
      const t = document.querySelector('.lap-total');
      if (t) t.textContent = '/ ' + total;
    }

    center(text, cls, dur) {
      const el = this.el.centerMsg;
      el.textContent = text;
      el.className = 'center-msg ' + (cls || '');
      // 重启动画
      void el.offsetWidth;
      el.classList.add('show');
      this.msgTimer = dur || 1;
    }

    count(text) {
      const el = this.el.centerMsg;
      el.textContent = text;
      el.className = 'center-msg count';
      void el.offsetWidth;
      el.classList.add('count');
      this.msgTimer = 0.95;
    }

    lapFlash(text) {
      const el = this.el.lapFlash;
      el.textContent = text;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    }

    flash(on) {
      this.el.flash.classList.toggle('on', !!on);
    }

    hint(text, dur) {
      this.el.hintBar.textContent = text;
      this.el.hintBar.classList.add('on');
      this._hintTimer = dur || 3;
    }

    setTrack(def) {
      if (!def || !this.el.hudTrack) return;
      this.el.hudTrack.textContent = def.name;
    }

    setRescue(r) {
      const e = this.el;
      if (!e.rescueBox) return;
      if (!r) {
        if (this._rescueOn) {
          this._rescueOn = false;
          this._rescuePhase = null;
          e.rescueBox.classList.remove('on');
        }
        return;
      }
      if (!this._rescueOn) {
        this._rescueOn = true;
        e.rescueBox.classList.add('on');
      }
      const p = U.clamp01(r.t / r.dur);
      e.rescueFill.style.width = (p * 100).toFixed(1) + '%';
      e.rescueCount.textContent = Math.max(0, r.dur - r.t).toFixed(1);
      if (e.rescueSub && r.phaseName && this._rescuePhase !== r.phaseName) {
        this._rescuePhase = r.phaseName;
        e.rescueSub.textContent = r.phaseName;
      }
    }

    /** 吃到道具箱时的彩虹闪光 */
    itemBurst() {
      const el = this.el.itemSlot;
      if (!el) return;
      el.classList.remove('got');
      void el.offsetWidth;
      el.classList.add('got');
      clearTimeout(this._gotT);
      this._gotT = setTimeout(() => el.classList.remove('got'), 620);
    }

    update(dt, race) {
      const kart = race.player;
      if (!kart) return;
      const e = this.el;

      // 名次
      const pos = kart.position;
      e.posNum.textContent = pos;
      const suf = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
      e.posSuf.textContent = suf;
      e.posNum.parentElement.classList.toggle('gold', pos === 1);

      // 圈
      const lapNow = Math.min(race.laps, Math.max(1, kart.lap + 1));
      e.lapNum.textContent = lapNow;

      // 时间
      e.hudTime.textContent = U.formatTime(kart.finished ? kart.finishTime : race.raceTime);

      // 金币
      e.coinNum.textContent = kart.coins;
      e.coinBadge.classList.toggle('full', kart.coins >= 10);

      // 速度（仪表上限固定 235 km/h）
      const kmh = U.kmh(kart.speed);
      e.speedNum.textContent = Math.round(kmh);
      const ratio = U.clamp01(kmh / U.SPEED_MAX_KMH);
      e.speedFill.style.width = (ratio * 100).toFixed(1) + '%';
      const bar = e.speedFill.parentElement;
      if (bar) bar.classList.toggle('redline', kmh > U.SPEED_MAX_KMH - 14);

      // 漂移槽
      const d = kart.drift;
      if (d.active) {
        e.driftMeter.classList.add('on');
        const c = U.clamp01(d.charge / 3.1);
        e.driftFill.style.width = (c * 100).toFixed(1) + '%';
      } else {
        e.driftMeter.classList.remove('on');
      }

      // 道具
      this.updateItem(kart, dt);

      // 逆行检测
      const wrong = race.wrongWay;
      if (wrong !== this._wrong) {
        this._wrong = wrong;
        e.wrongWay.classList.toggle('hidden', !wrong);
      }

      // 提示条
      if (this._hintTimer > 0) {
        this._hintTimer -= dt;
        if (this._hintTimer <= 0) e.hintBar.classList.remove('on');
      }

      // 中央大字（倒计时 / GO / FINISH）到时自动隐藏
      if (this.msgTimer > 0) {
        this.msgTimer -= dt;
        if (this.msgTimer <= 0) e.centerMsg.className = 'center-msg';
      }

      // 小地图
      this.drawMinimap(race.karts, kart);

      // 单圈时间
      this.drawLapTimes(kart, race);

      // 联机信息
      const nb = e.netBadge;
      if (nb) {
        if (race.netSync && SK.Net && SK.Net.room) {
          nb.classList.add('on');
          const ping = SK.Net.room.pingMs || 0;
          nb.textContent = `联机 ${ping}ms · ${SK.Net.room.players.length}人`;
          nb.classList.toggle('bad', ping > 180);
        } else {
          nb.classList.remove('on');
        }
      }
    }

    updateItem(kart, dt) {
      const e = this.el;
      const item = kart.item;
      if (!item) {
        if (this._lastItemKey !== 'none') {
          this._lastItemKey = 'none';
          e.itemSlot.classList.add('empty');
          e.itemSlot.classList.remove('roulette');
          e.itemIcon.style.backgroundImage = '';
          e.itemCount.textContent = '';
        }
        return;
      }
      if (item.roulette > 0) {
        e.itemSlot.classList.remove('empty');
        e.itemSlot.classList.add('roulette');
        this.rouletteTimer -= dt;
        if (this.rouletteTimer <= 0) {
          this.rouletteTimer = 0.08;
          const keys = Object.keys(SK.ITEM_DEF);
          e.itemRoulette.style.backgroundImage = 'url(' + SK.itemIcon(U.pick(keys)) + ')';
          if (SK.audio) SK.audio.play('roulette');
        }
        this._lastItemKey = 'roulette';
        return;
      }
      e.itemSlot.classList.remove('roulette');
      e.itemSlot.classList.remove('empty');
      const def = SK.ITEM_DEF[item.type] || { icon: '?' };
      const key = item.type + ':' + (item.count || 1);
      if (key !== this._lastItemKey) {
        this._lastItemKey = key;
        e.itemIcon.style.backgroundImage = 'url(' + SK.itemIcon(item.type) + ')';
        e.itemSlot.classList.add('pop');
        setTimeout(() => e.itemSlot.classList.remove('pop'), 190);
      }
      e.itemCount.textContent = item.count > 1 ? 'x' + item.count : '';
    }

    drawLapTimes(kart, race) {
      const el = this.el.lapTimes;
      const n = kart.lapTimes.length;
      if (el.dataset.n === String(n) && el.dataset.total === String(race.laps)) return;
      el.dataset.n = n;
      el.dataset.total = race.laps;
      let best = Infinity;
      kart.lapTimes.forEach(t => { if (t < best) best = t; });
      let html = '';
      for (let i = 0; i < n; i++) {
        const t = kart.lapTimes[i];
        html += `<div class="lt-row ${t === best && n > 1 ? 'best' : ''}"><span>L${i + 1}</span><span>${U.formatTimeShort(t)}</span></div>`;
      }
      el.innerHTML = html;
    }

    drawMinimap(karts, player) {
      const ctx = this.ctx;
      const S = this.mmSize;
      const pad = this.mmPad;
      const track = SK.game.track;
      const pts = track.minimap.points;
      ctx.clearRect(0, 0, S, S);
      const toPx = (p) => [pad + p.x * (S - pad * 2), pad + p.y * (S - pad * 2)];

      // 阴影
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const [x, y] = toPx(pts[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 15;
      ctx.stroke();
      // 主路面
      ctx.strokeStyle = 'rgba(240,247,255,0.92)';
      ctx.lineWidth = 9;
      ctx.stroke();
      // 内芯
      ctx.strokeStyle = 'rgba(60,80,120,0.9)';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // 起点线
      const sp = pts[0];
      const [sx, sy] = toPx(sp);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = '#ffd60a';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();

      // 道具箱位置暗示（几个点）
      // 车辆位置
      const groups = [[], [], []];
      for (let i = 0; i < karts.length; i++) {
        const k = karts[i];
        if (k === player) continue;
        const p = track.toMinimap(k.pos.x, k.pos.z);
        const [x, y] = toPx(p);
        // 按名次分层：相近的名次画得大一点
        const r = k.position <= 3 ? 4.4 : 3.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = k.charData.color ? '#' + k.charData.color.toString(16).padStart(6, '0') : '#fff';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(10,14,26,0.85)';
        ctx.stroke();
      }
      // 玩家
      const p = track.toMinimap(player.pos.x, player.pos.z);
      const [px, py] = toPx(p);
      // 朝向箭头
      const f = player.forward;
      const ang = Math.atan2(f.z, f.x);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(-6, 7.5);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, -7.5);
      ctx.closePath();
      ctx.fillStyle = '#ffd60a';
      ctx.shadowColor = 'rgba(255,214,10,0.9)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#3a2600';
      ctx.stroke();
      ctx.restore();
    }

    /* ---------------- 结算 ---------------- */
    showResults(race) {
      const player = race.player;
      const order = race.finalOrder || race.karts.slice().sort((a, b) => a.position - b.position);
      const pos = player.position;
      const suf = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
      $('resPos').innerHTML = pos + '<em>' + suf + '</em>';
      const title = pos === 1 ? '冠军！' : pos <= 3 ? '登上领奖台！' : pos <= 6 ? '完成比赛' : '再接再厉';
      $('resTitle').textContent = title;
      let best = Infinity;
      player.lapTimes.forEach(t => { if (t < best) best = t; });
      $('resSub').textContent = `总用时 ${U.formatTime(player.finishTime)} · 最快单圈 ${best < Infinity ? U.formatTimeShort(best) : '--'}`;

      let html = `<div class="res-row head"><span>名次</span><span>车手</span><span>总用时</span><span>最快单圈</span><span>金币</span></div>`;
      for (let i = 0; i < order.length; i++) {
        const k = order[i];
        let bl = Infinity;
        k.lapTimes.forEach(t => { if (t < bl) bl = t; });
        const col = '#' + (k.charData.color >>> 0).toString(16).padStart(6, '0');
        html += `<div class="res-row ${k === player ? 'me' : ''}">
          <span class="rp">${i + 1}</span>
          <span class="rn"><i class="swatch" style="background:${col}"></i>${k.name}${k.isPlayer ? '（你）' : ''}</span>
          <span class="t">${k.finished ? U.formatTime(k.finishTime) : 'DNF'}</span>
          <span class="t">${bl < Infinity ? U.formatTimeShort(bl) : '--'}</span>
          <span class="t">${k.coins}</span>
        </div>`;
      }
      $('resTable').innerHTML = html;

      // 杯赛进度 / 按钮
      const strip = this.el.cupStrip;
      const again = $('againBtn');
      if (race.cupMode) {
        const list = SK.tracksOfCup(race.cupIndex);
        let sh = '';
        list.forEach((t, i) => {
          const rec = race.cupResults && race.cupResults[i];
          let mine = null;
          if (rec) {
            const me = rec.order.filter(o => o.isPlayer)[0];
            mine = me ? me.pos : null;
          }
          const now = i === race.cupRound;
          sh += `<div class="cs-item ${rec ? 'done' : ''} ${now ? 'now' : ''}">
            <b>${i + 1}. ${t.name}</b>
            <span>${rec ? '第 ' + (mine || '-') + ' 名' : now ? '本场' : '未开始'}</span>
          </div>`;
        });
        strip.innerHTML = sh;
        strip.style.display = 'flex';
        again.textContent = race.cupRound >= 4 ? '查看杯赛结果' : '下一场 ▶';
      } else {
        strip.style.display = 'none';
        strip.innerHTML = '';
        again.textContent = '再来一局';
      }
      if (this.el.rescueBox) this.el.rescueBox.classList.remove('on');
      this._rescueOn = false;
      $('results').classList.remove('hidden');
    }
  }

  SK.HUDClass = HUD;
})();
