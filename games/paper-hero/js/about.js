/* 纸片勇者 — 关于：更新日志 + 创作者名单（DOM 覆盖层，纸片风格） */
(function (PH) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- 更新日志 ---------------- */
  const LOG = [
    {
      v: 'v1.9.4',
      date: '最新 · 联机彻底上云',
      items: [
        'Cloudflare 在线时直接进入联机：不再读 GitHub 地址表、不再探本机服务，开局只要一次探活。',
        '本机浏览器里残留的旧隧道 / 本机服务器地址降级为最后兜底，断线重连也优先切回 Cloudflare。',
        '邀请链接和 endpoint.json 固定指向 Cloudflare，旧缓存页面、换设备、房主关机都进同一个房间。',
        '联机面板、错误提示、账号提示全部改为云端说明，不再提示「启动本机服务 / 运行 tunnel.py」。',
      ],
    },
    {
      v: 'v1.9.3',
      date: 'Cloudflare 联机',
      items: [
        '联机房间与 WebSocket 转发迁到 Cloudflare Worker + Durable Object，不再依赖房主电脑一直开机；手机 / 平板 / 异地打开固定网址就能进同一个房间。',
        '账号摘要与存档也迁到 Cloudflare 的 Durable Object 存储，换设备用同一个账号登录即可读到云存档。',
        'Cloudflare 地址固定在 js/cloud.js，不随隧道换址；探测失败时仍会自动回退到游戏厅地址表 / 本机服务。',
        '现有本机账号与存档已经迁到 Cloudflare；本机服务在线时也会自动补写，两边都留一份兜底。',
      ],
    },
    {
      v: 'v1.9.2',
      date: '账号存本机',
      items: [
        '服务在线时，账号密码（只存用户名 + 加盐摘要）改存房主这台电脑的 data/accounts.json；手机 / 平板 / 别的电脑都能用同一个账号登录。',
        '第一次登录会自动把本机浏览器里已有的账号补写到服务器，不用重新注册；服务离线时自动退回本机保存的账号，照常用密钥登录。',
        '登录框会同时列出本机服务器上的账号，换设备不用猜用户名。',
        'data/ 目录改为不可静态下载，账号摘要和存档不会再被当成普通文件访问。',
        '升级后重启一次「启动游戏.command」，新的账号接口才会生效。',
      ],
    },
    {
      v: 'v1.9.1',
      date: '多人修复',
      items: [
        '联机里的队友不再半透明，和本地角色一样清晰。',
        '联机掉下悬崖不再瞬移回安全点：身体继续坠落，随后在最后落脚点上方变成泡泡，队友跳起来戳破救人。',
        '修好远端看不到别人泡泡的问题：泡泡位置单独同步，掉进深渊也不会把泡泡画到画面外。',
        '全队倒下或生命用完不再退回单人：联机失败页保留房间，可直接再来一局；同屏双人重跑也仍是双人。',
        '联机重开时如果生命已经跑空会补满，不会一出生就被判出局。',
      ],
    },
    {
      v: 'v1.9',
      date: '异境关卡',
      items: [
        '新增 4 张独立异境关卡 X-1 ~ X-4：独立序列、独立选关页，不改动 8 关主线与 3 张限时挑战，也不占用主线解锁与全通关判定。',
        'X-1 圈地 · 环形纸带：左右边界相接，终点被贯穿高度的石墙隔在背面，一路向右只会绕回原点。',
        'X-2 纸洞群 · 折叠纸洞：地面被两段远超跳跃极限的深渊切成孤岛，只有单向纸洞能跨越，出口高度与朝向都会变。',
        'X-3 叠影夹缝 · 叠影双页：同一坐标叠着上下两套互相矛盾的地形，踩折痕翻页，非当前页以残影显示。',
        'X-4 落天井 · 倒挂天井：井底连着天，掉下去从同一列正上方落回倒挂的一层，终点只在上层。',
        '每张异境卡都写明特殊地形、可玩性边界、序列位置和与常规关卡的区分点；游戏内底部常驻一行异境规则。',
        '单人专用。叠影关在上层倒下后会连地形一起归位，重生回下层存档点不会反复摔死。',
      ],
    },
    {
      v: 'v1.8',
      date: '只要服务器开着',
      items: [
        '联机彻底不看局域网了：只要房主那台电脑的服务器开着，手机用流量、平板连别的 Wi-Fi、另一台电脑在别的城市，三台设备互相不在同一个网络也能进同一个房间。',
        '新增永远不变的「固定游戏网址」和可达的备用网址；邀请链接不再指向会变的隧道地址，旧链接也不会因为换址失效。',
        'Cloudflare 隧道每次换地址，启动脚本都会自动更新 GitHub 上的地址表、重写客户端配置、回写启动脚本里的当前地址；朋友的页面会自己跟上新地址。',
        '客户端并行从多个 GitHub 地址源读当前隧道地址，任何一个源不通都不影响；服务器关掉再开，页面自动重连并自动进房，不用刷新。',
        '游戏厅门禁不再拦联机：没登录 / 没邀请码 / 不在开放时间也能进来跑，只影响账号云存档。',
      ],
    },
    {
      v: 'v1.7.1',
      date: '掉坑修复',
      items: [
        '修好双人 / 联机里「被怪物打倒会变泡泡、掉下悬崖却不会」：现在掉坑同样算一次倒下，扣命并变成泡泡等队友来救。',
        '泡泡固定飘在最近的安全落脚点上方，不会再留在画面外的深渊里，队友跳起来就够得到。',
        '联机服务日志异常时不再把 WebSocket 连接一起带断，建房更稳。',
      ],
    },
    {
      v: 'v1.7',
      date: '跨网联机',
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
