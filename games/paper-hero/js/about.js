/* 纸片勇者 — 关于：更新日志 + 创作者名单（DOM 覆盖层，纸片风格） */
(function (PH) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- 更新日志 ---------------- */
  const LOG = [
    {
      v: 'v1.7',
      date: '最新 · 跨网联机',
      items: [
        '联机明确为本机当服务器 + Cloudflare 内网穿透：设备 A 和设备 B 不在同一个局域网也能一起跑。',
        '房间新增一键复制的邀请链接，朋友点开就自动连到房主的服务器并进房；也可手动填服务器地址。',
        '修掉公网页面误连自己电脑 localhost 的隐患，保证两台设备一定连同一台服务器。',
        '讲解石按反馈在现有朝向上再逆时针旋转 90°，摆正了。',
      ],
    },
    {
      v: 'v1.6',
      date: '账号与救援',
      items: [
        '玩家档案和游戏厅主页账号共用，游戏里不再注册；用户名与密码凭据保存在本机。',
        '本机服务不在线时改用密钥验证，联机自动关闭、单机照常玩。',
        '单人模式取消泡泡玩法，倒下直接扣命回存档点。',
        '多人泡泡必须由队友跳起来戳破，够得到才救得回来。',
        '双人牵引时被拉的玩家不再穿墙，撞到墙直接挤死。',
        '新增更新日志与创作者名单。',
      ],
    },
    {
      v: 'v1.5',
      date: '生命与救援',
      items: [
        '单机 / 双人 / 联机共用同一份生命；每关固定放两颗加命泡泡。',
        '倒下变成泡泡，队友可救；命用尽出局，全员倒下回到上一个 BOSS 之后。',
        '多人 HUD 改成三颗纸心，不再显示百分比。',
        '单机与双人同屏都能自己挑角色，选择跟着档案保存。',
      ],
    },
    {
      v: 'v1.4',
      date: '联机与上线',
      items: [
        '最多 4 人联机竞速：4 位房号、每人一个专属纸片角色、半透明幽灵同步。',
        '新增绿衣小子、白发女孩、紫衣尖头三张手绘角色（已抠图摆正）。',
        '发布到游戏厅 GitHub Pages；双 Cloudflare 隧道 + 端点自动提交 + 进程守护。',
        '本机服务离线时自动关掉账号和联机，纯单机不受影响。',
      ],
    },
    {
      v: 'v1.3',
      date: '本机多档案',
      items: [
        '一台电脑最多 8 个本机档案，进度各存各的、不用注册也不用验证码。',
        '旧版单存档自动迁移；切换档案即时切换解锁进度与挑战成绩。',
      ],
    },
    {
      v: 'v1.2',
      date: '道具与挑战',
      items: [
        '6 种道具：冰冻、67 枪、奶蛋、虚弱药水、变大药水（护盾并补 1 心）、十八马坐骑。',
        '低血击杀掉落回血心、14 颗固定小红心；全通关解锁 C-1 / C-2 / C-3 限时挑战。',
        '子弹不再穿墙，怪物不会主动掉坑自杀。',
      ],
    },
    {
      v: 'v1.1',
      date: '敌人与手感',
      items: [
        '10 种手绘敌人：六七男孩、司凤鸟、讲解石、枪手、骷髅、红肠炮管、坦克等各有招式。',
        '修正人物倾斜、炮管朝向、讲解石明暗、大蛆怪镜像；记录点不再悬空。',
        '短按不丢输入、暂停显示完整键位表。',
      ],
    },
    {
      v: 'v1.0',
      date: '最初的样子',
      items: [
        '把 23 张小朋友画的蜡笔画剪成贴图，用 Canvas 2D 做出 8 关主线与 2 场 BOSS。',
        '纸艺 UI、程序化音乐音效、双人同屏竞速的第一版。',
      ],
    },
  ];

  /* ---------------- 创作者名单 ---------------- */
  const CREDITS = [
    ['创始人', 'wyc'],
    ['策划', 'sy · wyc · shk'],
    ['设计', 'wyc · shk · sy'],
    ['美术', 'wyc · shk'],
    ['开发', 'deeoseek'],
    ['测试', 'deepseek'],
    ['内测玩家', 'thy · wyc'],
    ['总监', 'wyc'],
    ['贡献者', 'zqy · Idad · Wind · sy · WorkBuddy', true],
  ];

  const A = (PH.About = {
    el: null,
    body: null,
    foot: null,
    tab: 'log',
    opened: false,

    init() {
      this.el = document.getElementById('about');
      if (!this.el) return;
      this.body = document.getElementById('aboutBody');
      this.foot = document.getElementById('aboutFoot');
      document.getElementById('aboutClose').addEventListener('click', () => this.close());
      this.el.addEventListener('mousedown', (e) => {
        if (e.target.classList && e.target.classList.contains('acc-backdrop')) this.close();
      });
      this.el.querySelectorAll('.about-tab').forEach((b) => {
        b.addEventListener('click', () => {
          this.tab = b.dataset.tab;
          PH.Audio.sfx('click');
          this.render();
        });
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.opened) this.close();
      });
    },

    open(tab) {
      if (!this.el) return;
      if (PH.G && PH.G.state === 'play' && PH.setState) PH.setState('pause');
      this.tab = tab || 'log';
      this.el.hidden = false;
      this.opened = true;
      this.render();
    },

    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.opened = false;
    },

    render() {
      if (!this.el || !this.body) return;
      this.el.querySelectorAll('.about-tab').forEach((b) => {
        b.classList.toggle('on', b.dataset.tab === this.tab);
      });
      this.body.innerHTML = this.tab === 'credits' ? this.creditsHtml() : this.logHtml();
      this.foot.textContent = this.tab === 'credits'
        ? '谢谢每一位把它画出来、玩坏、再修好的人'
        : '纸片勇者 · 红肠王国大冒险';
      this.body.scrollTop = 0;
    },

    logHtml() {
      return LOG.map((r) =>
        '<div class="log-rel"><h3>' + esc(r.v) + '<span>' + esc(r.date) + '</span></h3><ul>' +
        r.items.map((x) => '<li>' + esc(x) + '</li>').join('') +
        '</ul></div>'
      ).join('');
    },

    creditsHtml() {
      const rows = CREDITS.map(([role, names, wide]) =>
        '<div class="credit-row' + (wide ? ' wide' : '') + '"><b>' + esc(role) + '</b><span>' + esc(names) + '</span></div>'
      ).join('');
      return (
        '<p class="about-thanks">谢谢开发者和每一位贡献者。' +
        '这是一个小朋友画出来的游戏：画图、剪贴、想关卡、写代码、一遍遍试玩，' +
        '少了谁都不会是现在这个样子。也谢谢愿意玩到最后的你。</p>' +
        '<div class="credit-rows">' + rows + '</div>' +
        '<p class="credit-foot">特别鸣谢 · 所有提供手绘原画、内测反馈和陪伴的人<br>纸片会皱，冒险不会结束。</p>'
      );
    },
  });

  // 给 README / 打包脚本也能拿到同一份名单
  PH.AboutData = { log: LOG, credits: CREDITS };

  A.init();
})(window.PH);
