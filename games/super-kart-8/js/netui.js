/* ============================================================
   Super Kart 8 — netui.js
   联机大厅：登录门 / 房间列表 / 房间内座位与设置 / 聊天 / 开局
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const Net = SK.Net;
  const $ = (id) => document.getElementById(id);

  const CC_LIST = [50, 100, 150, 200];
  const LAP_LIST = [1, 2, 3, 5];

  const UI = {
    open: false,
    busy: false,
    joining: false,
    name: '',
    rooms: [],
    lastCode: '',

    /* ---------------- 初始化 ---------------- */
    init() {
      if (!Net) return;
      this.root = $('lobby');
      if (!this.root) return;

      const params = new URLSearchParams(location.search);
      if (params.get('lan') === '1') Net.mode = 'local';

      $('lobbyClose').addEventListener('click', () => {
        if (Net.room) {
          if (!confirm('离开房间？')) return;
          Net.leaveRoom();
        }
        this.hide();
      });
      $('loginBtn').addEventListener('click', () => this.login());
      $('createRoomBtn').addEventListener('click', () => this.createRoom());
      $('joinBtn').addEventListener('click', () => this.joinByCode());
      $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinByCode(); });
      $('refreshRooms').addEventListener('click', () => this.refresh());
      $('copyCode').addEventListener('click', () => {
        const code = Net.room ? Net.room.code : '';
        if (!code) return;
        navigator.clipboard && navigator.clipboard.writeText(code).then(
          () => this.toast('房间号已复制', 'ok'),
          () => this.toast('复制失败，请手动记下：' + code, 'warn')
        );
      });
      $('readyBtn').addEventListener('click', () => {
        const r = Net.room;
        if (!r) return;
        const me = r.players.find(p => p.id === r.selfId);
        r.setReady(!(me && me.ready));
        SK.audio && SK.audio.play('ui');
      });
      $('hostStartBtn').addEventListener('click', () => this.startRace());
      $('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
      $('chatSend').addEventListener('click', () => this.sendChat());
      $('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendChat();
        e.stopPropagation();
      });

      // 房间 / 赛事事件
      Net.on('auth', () => this.renderGate());
      Net.on('room', (s) => this.onRoom(s));
      Net.on('joined', () => { this.joining = false; });
      Net.on('chat', (m) => this.appendChat(m));
      Net.on('toast', (t) => this.toast(t.text, t.kind));
      Net.on('left', () => { this.resetRoomView(); this.refresh(); });
      Net.on('prepare', (msg) => this.onPrepare(msg));
      Net.on('start', (msg) => this.onStart(msg));
      Net.on('results', (msg) => this.onResults(msg));
      Net.on('tolobby', () => this.onToLobby());
      Net.on('disconnected', () => {
        this.toast('与房主断开连接，已退出房间', 'error');
        this.resetRoomView();
        Net.leaveRoom();
      });

      this.name = localStorage.getItem('sk-nick') || '';
      $('playerName').value = this.name;

      // 登录回调后直接落到联机大厅
      if (params.get('mp') === '1') this.show();
    },

    /* ---------------- 显示 / 隐藏 ---------------- */
    show() {
      this.root.classList.remove('hidden');
      this.open = true;
      document.getElementById('menu').classList.add('hidden');
      SK.game && SK.game._hideResults && SK.game._hideResults();
      this.renderGate();
      this.renderBrowse();
      this.renderRoom();
    },

    hide() {
      this.root.classList.add('hidden');
      this.open = false;
      document.getElementById('menu').classList.remove('hidden');
    },

    toast(text, kind) {
      const bar = $('lobbyToast');
      if (!bar) return;
      bar.textContent = text;
      bar.className = 'lobby-toast on ' + (kind || '');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => { bar.className = 'lobby-toast'; }, 2600);
    },

    /* ---------------- 登录门 ---------------- */
    renderGate() {
      const signed = Net.cloud && Net.cloud.signedIn;
      $('lobbyGate').classList.toggle('hidden', signed);
      $('lobbyBrowse').classList.toggle('hidden', !signed || !!Net.room);
      $('lobbyRoom').classList.toggle('hidden', !signed || !Net.room);
      const u = $('lobbyUser');
      if (signed) {
        const n = Net.cloud.nick || '玩家';
        u.innerHTML = `<span class="lu-dot"></span>${escapeHtml(n)}` +
          `<button class="lu-out" id="logoutBtn">退出</button>`;
        const b = $('logoutBtn');
        if (b) b.onclick = async () => { await Net.signOut(); this.renderGate(); };
        if (!this.name && n) { this.name = n; $('playerName').value = n; }
      } else {
        u.innerHTML = '<span class="lu-dot off"></span>未登录';
      }
      const note = $('gateNote');
      if (note && Net.cloud.lastError) note.textContent = Net.cloud.lastError;

      // 第三方静态镜像（GitHub Pages / 自定义域名）：OAuth Relay 会精确校验
      // redirectTo 的 host，只在注册域名下放行，所以这里的登录按钮必然失败。
      // 改成指向官方联机站点，别让用户白点一次；单机玩法不受影响。
      const cfg = window.SK_CLOUD_CONFIG || {};
      let officialHost = '';
      try { officialHost = new URL(cfg.endpoint).hostname; } catch (e) { /* ignore */ }
      const isOfficial = !!officialHost && location.hostname === officialHost;
      const isLocal = location.protocol === 'file:' ||
        /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      // ?mirror=1 可强制进入镜像模式（自定义域名 / 反向代理 / 本地验收用）
      const mirrorForced = new URLSearchParams(location.search).get('mirror') === '1';
      this.externalHost = mirrorForced || (!isOfficial && !isLocal && location.protocol === 'https:');
      if (this.externalHost) {
        const btn = $('loginBtn');
        if (btn) btn.innerHTML = '<span>前往官方联机站点 ↗</span>';
        if (note) note.innerHTML = '当前是静态镜像（' + escapeHtml(location.hostname) +
          '），WorkBuddy 登录只在注册域名下可用。<br>' +
          '单机玩法完全正常；要联机请点上方按钮，或在本机地址后加 <b>?lan=1</b> 多标签演示。';
      }
      if (Net.mode === 'local') {
        $('lobbyGate').classList.add('hidden');
        $('lobbyBrowse').classList.toggle('hidden', !!Net.room);
        $('lobbyRoom').classList.toggle('hidden', !Net.room);
      }
    },

    async login() {
      if (this.externalHost) {
        const u = (window.SK_CLOUD_CONFIG || {}).officialUrl;
        if (u) location.assign(u);
        return;
      }
      try {
        SK.audio && SK.audio.play('ui');
        await Net.signIn();
      } catch (e) {
        this.toast(e.message || '登录失败', 'error');
      }
    },

    /* ---------------- 房间列表 ---------------- */
    async refresh() {
      if (!Net.cloud.signedIn || Net.mode === 'local') { this.rooms = []; this.renderRoomList(); return; }
      if (this.busy) return;
      this.busy = true;
      $('browseHint').textContent = '正在读取房间…';
      try {
        this.rooms = await Net.cloud.listRooms();
        $('browseHint').textContent = this.rooms.length ? '' : '还没有公开房间，创建一个吧';
      } catch (e) {
        $('browseHint').textContent = '读取房间失败：' + (e.message || e);
      } finally {
        this.busy = false;
        this.renderRoomList();
      }
    },

    renderBrowse() {
      this.renderSettingsSummary();
      this.refresh();
    },

    renderSettingsSummary() {
      const g = SK.game;
      if (!g) return;
      const def = g._currentDef ? g._currentDef() : SK.TRACKS[0];
      const el = $('roomSummary');
      if (el) el.textContent = `${def.name} · ${g.settings.cc}cc · ${g.settings.laps} 圈`;
      const nm = $('roomName');
      if (nm && !nm.value) nm.value = (this.name || '我') + '的房间';
    },

    renderRoomList() {
      const box = $('roomList');
      if (!box) return;
      if (!this.rooms.length) {
        box.innerHTML = '<div class="rl-empty">暂无公开房间</div>';
        return;
      }
      let html = '';
      for (const r of this.rooms) {
        const def = SK.TRACKS.find(t => t.id === r.track_id);
        const cnt = (r.players || []).length;
        html += `<div class="rl-item">
          <div class="rl-main">
            <div class="rl-name">${escapeHtml(r.name || '房间')}<em>${r.code}</em></div>
            <div class="rl-meta">${def ? def.name : r.track_id} · ${r.cc}cc · ${r.laps} 圈 · 房主 ${escapeHtml(r.owner_name || '—')}</div>
          </div>
          <div class="rl-count">${cnt}/8</div>
          <button class="rl-join" data-code="${r.code}">加入</button>
        </div>`;
      }
      box.innerHTML = html;
      box.querySelectorAll('.rl-join').forEach(b => {
        b.addEventListener('click', () => {
          $('joinCode').value = b.dataset.code;
          this.joinByCode();
        });
      });
    },

    /* ---------------- 创建 / 加入 ---------------- */
    async createRoom() {
      if (this.busy) return;
      const g = SK.game;
      const name = ($('playerName').value || '').trim().slice(0, 12) || '玩家';
      this.name = name;
      localStorage.setItem('sk-nick', name);
      const def = g._currentDef ? g._currentDef() : SK.TRACKS[0];
      this.busy = true;
      $('browseHint').textContent = '正在创建房间…';
      try {
        SK.audio && SK.audio.play('ui');
        await Net.hostRoom({
          name,
          charId: g.settings.charId,
          trackId: def.id,
          cc: g.settings.cc,
          laps: g.settings.laps,
          aiFill: true,
          roomName: ($('roomName').value || '').trim() || (name + '的房间')
        });
        $('browseHint').textContent = '';
        this.renderRoom();
        this.renderGate();
      } catch (e) {
        $('browseHint').textContent = '创建失败：' + (e.message || e);
      } finally {
        this.busy = false;
      }
    },

    async joinByCode() {
      if (this.busy || this.joining) return;
      const code = ($('joinCode').value || '').trim().toUpperCase();
      if (code.length < 4) { this.toast('请输入 4 位房间号', 'warn'); return; }
      const g = SK.game;
      const name = ($('playerName').value || '').trim().slice(0, 12) || '玩家';
      this.name = name;
      localStorage.setItem('sk-nick', name);
      this.busy = true;
      this.joining = true;
      $('browseHint').textContent = '正在加入 ' + code + ' …';
      try {
        SK.audio && SK.audio.play('ui');
        await Net.joinRoom(code, { name, charId: g.settings.charId });
        $('browseHint').textContent = '';
        this.renderRoom();
        this.renderGate();
        this.toast('已加入房间，正在与房主建立连接…', 'ok');
      } catch (e) {
        this.joining = false;
        $('browseHint').textContent = '加入失败：' + (e.message || e);
      } finally {
        this.busy = false;
      }
    },

    async leaveRoom() {
      await Net.leaveRoom();
      this.resetRoomView();
      this.renderGate();
      this.refresh();
    },

    resetRoomView() {
      this.joining = false;
      const box = $('chatLog');
      if (box) box.innerHTML = '';
    },

    /* ---------------- 房间视图 ---------------- */
    onRoom(s) {
      this.renderRoom(s);
      this.renderGate();
    },

    renderRoom(s) {
      const r = Net.room;
      const roomBox = $('lobbyRoom');
      if (!roomBox) return;
      const inRoom = !!r;
      roomBox.classList.toggle('hidden', !inRoom);
      $('lobbyBrowse').classList.toggle('hidden', inRoom || !(Net.cloud.signedIn || Net.mode === 'local'));
      if (!inRoom) return;

      $('roomCode').textContent = r.code;
      const me = r.players.find(p => p.id === r.selfId);
      const others = r.players.filter(p => !p.isHost);
      const notReady = others.filter(p => !p.ready).length;
      const st = $('roomStatus');
      if (r.state === 'racing') st.textContent = '比赛进行中…';
      else if (r.state === 'preparing') st.textContent = '正在准备赛道…';
      else st.textContent = r.isHost
        ? (notReady ? `${notReady} 人未准备` : '全部就绪，可以开始')
        : '等待房主开始';

      // 座位
      const grid = $('slotGrid');
      let html = '';
      for (let i = 0; i < 8; i++) {
        const p = r.players.find(x => x.slot === i);
        if (!p) {
          html += `<div class="slot empty"><div class="slot-avatar">＋</div><div class="slot-name">空位</div><div class="slot-tag">AI 补位</div></div>`;
          continue;
        }
        const ch = SK.Character.get(p.charId);
        const col = '#' + ((ch && ch.color) >>> 0).toString(16).padStart(6, '0');
        const isMe = p.id === r.selfId;
        html += `<div class="slot ${isMe ? 'me' : ''}">
          <div class="slot-avatar" style="--c:${col}">
            ${SK.game && SK.game.portraits && SK.game.portraits[p.charId] ? `<img src="${SK.game.portraits[p.charId]}" alt="">` : '<span>' + (ch ? ch.name[0] : '?') + '</span>'}
          </div>
          <div class="slot-name">${escapeHtml(p.name || (ch ? ch.name : '玩家'))}${isMe ? '<em>你</em>' : ''}</div>
          <div class="slot-tag ${p.isHost ? 'host' : p.ready ? 'ready' : ''}">${p.isHost ? '房主' : p.ready ? '已准备' : '未准备'}</div>
        </div>`;
      }
      grid.innerHTML = html;

      // 房主设置
      const setBox = $('roomSettings');
      const canEdit = r.isHost;
      const def = SK.TRACKS.find(t => t.id === r.settings.trackId) || SK.TRACKS[0];
      const tracks = SK.TRACKS.map(t => `<option value="${t.id}" ${t.id === def.id ? 'selected' : ''}>${t.name}</option>`).join('');
      setBox.innerHTML = `
        <label class="lobby-field"><span>赛道</span>
          <select id="setTrack" ${canEdit ? '' : 'disabled'}>${tracks}</select>
        </label>
        <div class="lobby-field"><span>引擎</span>
          <div class="seg seg-sm" id="setCc">
            ${CC_LIST.map(c => `<button data-cc="${c}" class="${c === r.settings.cc ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>${c}</button>`).join('')}
          </div>
        </div>
        <div class="lobby-field"><span>圈数</span>
          <div class="seg seg-sm" id="setLaps">
            ${LAP_LIST.map(l => `<button data-laps="${l}" class="${l === r.settings.laps ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>${l}</button>`).join('')}
          </div>
        </div>
        <label class="switch"><input type="checkbox" id="setAI" ${r.settings.aiFill ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span></span>空位用 AI 补满 8 人</label>
      `;
      if (canEdit) {
        $('setTrack').onchange = (e) => r.setSettings({ trackId: e.target.value });
        setBox.querySelectorAll('#setCc button').forEach(b => {
          b.onclick = () => r.setSettings({ cc: +b.dataset.cc });
        });
        setBox.querySelectorAll('#setLaps button').forEach(b => {
          b.onclick = () => r.setSettings({ laps: +b.dataset.laps });
        });
        $('setAI').onchange = (e) => r.setSettings({ aiFill: e.target.checked });
      }

      // 按钮
      const readyBtn = $('readyBtn');
      const startBtn = $('hostStartBtn');
      if (r.isHost) {
        readyBtn.style.display = 'none';
        startBtn.style.display = '';
        startBtn.disabled = r.state === 'preparing';
        startBtn.querySelector('span').textContent = r.state === 'preparing' ? '准备中…' : '开始比赛';
      } else {
        readyBtn.style.display = '';
        startBtn.style.display = 'none';
        readyBtn.querySelector('span').textContent = me && me.ready ? '取消准备' : '准备';
        readyBtn.classList.toggle('on', !!(me && me.ready));
      }
    },

    /* ---------------- 聊天 ---------------- */
    sendChat() {
      const r = Net.room;
      const input = $('chatInput');
      if (!r || !input) return;
      const text = (input.value || '').trim();
      if (!text) return;
      r.sendChat(text);
      input.value = '';
    },

    appendChat(m) {
      const box = $('chatLog');
      if (!box) return;
      const r = Net.room;
      const mine = r && m.from === r.selfId;
      const div = document.createElement('div');
      div.className = 'chat-row' + (mine ? ' me' : '');
      div.innerHTML = `<b>${escapeHtml(m.name || '玩家')}</b><span>${escapeHtml(m.text)}</span>`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      while (box.children.length > 60) box.removeChild(box.firstChild);
    },

    /* ---------------- 开局 ---------------- */
    async startRace() {
      const r = Net.room;
      if (!r || !r.isHost) return;
      if (this._starting) return;
      this._starting = true;
      SK.audio && SK.audio.play('ui');
      try {
        await Net.hostBeginRace(SK.game);
      } catch (e) {
        this.toast('开局失败：' + (e.message || e), 'error');
      } finally {
        this._starting = false;
      }
    },

    async onPrepare(msg) {
      const r = Net.room;
      if (!r || r.isHost) return;
      this.toast('房主正在准备赛道…', 'ok');
      try {
        await SK.game.prepareTrack(msg.settings.trackId);
        r.guestPrepared();
      } catch (e) {
        console.error('[net] prepare failed', e);
      }
    },

    onStart(msg) {
      Net.startRaceLocally(SK.game, msg.roster, msg.settings, msg.at);
      this.hide();
    },

    onResults(msg) {
      if (SK.game) {
        SK.game._hideResults && SK.game._hideResults();
        SK.game.showNetResults(msg.rows);
      }
    },

    onToLobby() {
      if (SK.game) {
        SK.game._hideResults && SK.game._hideResults();
        SK.game.hud.hide && SK.game.hud.hide();
      }
      this.show();
    }
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  Net.showLobby = () => UI.show();
  Net.hideLobby = () => UI.hide();
  SK.NetUI = UI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UI.init());
  } else {
    UI.init();
  }
})();
