/* 纸片勇者 — 素材加载 */
(function (PH) {
  const NAMES = [
    'hero', 'enemy67', 'cabbage', 'bird', 'sausage', 'gunner', 'skeleton', 'stone',
    'log', 'boss1', 'boss2', 'itemIce', 'itemGrow', 'itemWeak', 'itemEgg', 'itemGun',
    'itemHorse', 'sausageShot', 'cannon', 'tank', 'hammer', 'grave', 'buddy',
    'player2', 'player3', 'player4',
  ];
  const A = (PH.Assets = {
    img: {},
    dim: {},
    ready: false,
    total: NAMES.length,
    loaded: 0,

    load(onProgress) {
      return new Promise((resolve) => {
        let done = 0;
        NAMES.forEach((n) => {
          const im = new Image();
          im.onload = () => {
            this.img[n] = im;
            this.dim[n] = { w: im.width, h: im.height };
            done++;
            this.loaded = done;
            onProgress && onProgress(done, NAMES.length);
            if (done === NAMES.length) {
              this.ready = true;
              resolve();
            }
          };
          im.onerror = () => {
            console.warn('缺少素材', n);
            done++;
            if (done === NAMES.length) {
              this.ready = true;
              resolve();
            }
          };
          // 单文件版会注入 PH.ASSET_DATA（base64），普通版按文件路径读
          im.src = (PH.ASSET_DATA && PH.ASSET_DATA[n]) || 'assets/sprites/' + n + '.png';
        });
        setTimeout(() => {
          if (!this.ready) {
            this.ready = true;
            resolve();
          }
        }, 8000);
      });
    },

    // 以高度为准计算绘制宽度
    sizeForH(name, h) {
      const d = this.dim[name] || { w: 100, h: 100 };
      return { w: (d.w / d.h) * h, h };
    },
    sizeForW(name, w) {
      const d = this.dim[name] || { w: 100, h: 100 };
      return { w, h: (d.h / d.w) * w };
    },

    draw(ctx, name, x, y, w, h, o) {
      const im = this.img[name];
      if (!im) return;
      o = o || {};
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      if (o.rot) ctx.rotate(o.rot);
      if (o.scaleY !== undefined || o.scaleX !== undefined) {
        ctx.scale(o.scaleX === undefined ? 1 : o.scaleX, o.scaleY === undefined ? 1 : o.scaleY);
      }
      if (o.flip) ctx.scale(-1, 1);
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      if (o.shadow) {
        ctx.shadowColor = 'rgba(54,36,22,0.34)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 4;
      }
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    },

    // 底部对齐绘制：y 是脚底
    drawFoot(ctx, name, cx, footY, h, o) {
      const s = this.sizeForH(name, h);
      o = o || {};
      this.draw(ctx, name, cx - s.w / 2, footY - h, s.w, h, o);
      return s;
    },
  });
})(window.PH);
