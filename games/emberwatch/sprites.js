/* Original Emberwatch sprite atlas. All coordinates are in source pixels. */
(() => {
  'use strict';

  const ink = '#172126';
  const ranger = {
    K: ink, X: '#3d2b32', R: '#793d33', B: '#a64b30', O: '#d96a35',
    T: '#f18a42', A: '#ffb960', H: '#ffdc91', N: '#202e37',
    M: '#35434b', U: '#476967', J: '#74928a', V: '#adbc9f',
    L: '#72513d', G: '#be9563', C: '#91a6a9', E: '#e2ede1', W: '#fff1bf'
  };

  // Shapes use scanlines so every edge stays aligned with the sprite's pixel grid.
  class Brush {
    constructor(ctx) { this.ctx = ctx; }
    rect(color, x, y, w = 1, h = 1) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, w, h);
    }
    polygon(color, points) {
      const ys = points.filter((_, i) => i % 2);
      const end = Math.max(...ys);
      this.ctx.fillStyle = color;
      for (let y = Math.min(...ys); y < end; y++) {
        const cuts = [];
        const row = y + 0.5;
        for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
          const ay = points[j + 1], by = points[i + 1];
          if ((ay <= row && by > row) || (by <= row && ay > row)) {
            cuts.push(points[j] + (row - ay) * (points[i] - points[j]) / (by - ay));
          }
        }
        cuts.sort((a, b) => a - b);
        for (let i = 0; i + 1 < cuts.length; i += 2) {
          const left = Math.ceil(cuts[i] - 0.5);
          this.ctx.fillRect(left, y, Math.ceil(cuts[i + 1] - 0.5) - left, 1);
        }
      }
    }
    line(color, x, y, endX, endY) {
      const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
      const stepX = x < endX ? 1 : -1, stepY = y < endY ? 1 : -1;
      let error = dx + dy;
      this.ctx.fillStyle = color;
      for (;;) {
        this.ctx.fillRect(x, y, 1, 1);
        if (x === endX && y === endY) break;
        const twice = 2 * error;
        if (twice >= dy) { error += dy; x += stepX; }
        if (twice <= dx) { error += dx; y += stepY; }
      }
    }
    stamp(colors, x, y, design, flip = false) {
      const rows = design.trim().split(/\s+/);
      const width = Math.max(...rows.map(row => row.length));
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        let i = 0;
        while (i < row.length) {
          const ch = row[i];
          let end = i + 1;
          while (end < row.length && row[end] === ch) end++;
          if (ch !== '.') this.rect(colors[ch], x + (flip ? width - end : i), y + j, end - i, 1);
          i = end;
        }
      }
    }
  }

  function hero(p, frame) {
    p.stamp(ranger, 3, 18, frame ?
      `...KMMKKMMK
       ..KUUMKKMLK
       .KXUUK.KLLK
       .KLLK..KGGK
       KLGGK..KLLLK
       KLLLK..KKKKK
       KKKKK.......` :
      `...KMMKKMMK
       ...KUMKKUUK
       ..KMMK.KLLK
       ..KLLK.KLGK
       ..KLGK.KLLLK
       .KLLLK.KLLLK
       .KKKKK.KKKKK`);
    // The scarf, arm, and silver sword all have different silhouettes.
    p.stamp(ranger, 1, 10, `
      .....KKKKKKKK..
      ...KKRBOOTOBKK.
      ..KBROOBBBRRUKK
      .KBOTOBUUUMUJJUK
      KBOTOBKUUULUUMUK
      KORBKKKUULGLUMUK
      KBRK.KKULGLUMKXK
      KRK.KBKUUGUUUKLK
      .K..KRBULLLGLKXK
      ....KXKUUMUUUKK.
      ....KKKMMKMMMK..`);
    p.stamp(ranger, 4, frame ? 1 : 0, `
      .....KKKKK....
      ...KKOAAOBKK..
      ..KOTTTTOOOBK.
      .KBOTTTTTTOOBK
      KBOTTTTOOOBBBK
      KBOOOOOBRRRRBK
      KROOBRKKKKKKRK
      KRBORKMMMMNNKK
      .KBBKMWAMNWAK.
      .KRBKMMNNNMNK.
      ..KRBKNNNNNKK.
      ...KBOBRRRBK..
      ...KROOTTOK...
      ....KBBBRK....`);
    p.stamp(ranger, 15, frame ? 9 : 8, `
      ........K
      .......KE
      ......KEC
      .....KECK
      ....KECK.
      ...KECK..
      ..KECK...
      AKCCK....
      KTAK.....
      .KGAK....
      KLGK.....
      KKK......`);
  }

  function portrait(p) {
    const c = ranger;
    // Hood silhouette and stitched folds, seen close enough to read the face.
    p.polygon(ink, [0,32,0,29,3,26,7,24,9,21,6,20,4,16,4,11,6,7,11,3,17,1,23,2,28,6,29,9,28,11,29,15,28,21,26,23,30,25,32,29,32,32]);
    p.polygon(c.X, [1,32,2,28,8,25,11,22,23,21,29,26,31,30,31,32]);
    p.polygon(c.U, [3,30,8,26,14,24,23,24,27,26,26,32,2,32]);
    p.polygon(c.J, [3,30,8,26,11,26,8,30,6,32,2,32]);
    p.line(c.V, 3,30, 7,27);
    p.polygon(c.M, [14,25,22,24,25,26,20,32,12,32]);
    p.polygon('#ae7947', [10,30,20,24,24,24,13,32,8,32]);
    p.line(c.G, 10,31, 20,25);
    p.rect('#ead393', 15,28, 2,2);
    p.rect(c.L, 16,29);
    p.polygon(c.R, [5,11,7,7,12,3,17,2,23,3,27,6,28,9,26,12,28,15,27,20,24,23,25,25,20,26,15,29,10,28,8,26,9,23,6,20,5,16]);
    p.polygon(c.B, [5,12,8,7,12,4,18,2,23,3,27,7,27,9,23,9,17,11,13,15,11,20,12,24,9,24,7,21,5,17]);
    p.polygon(c.O, [6,11,9,7,14,4,19,3,23,4,27,7,26,8,19,8,15,10,11,14,9,19,9,23,7,20,6,17]);
    p.polygon(c.T, [8,10,13,5,18,3,22,4,24,6,18,7,13,10,9,14,7,17]);
    p.polygon(c.A, [10,9,14,5,18,4,20,4,17,6,14,7,11,10,9,12]);
    p.line('#e17a3e', 12,10, 14,8);
    p.line('#f59348', 7,16, 9,12);
    p.line('#ae4d30', 8,20, 7,17);
    p.polygon(c.X, [10,17,13,12,18,9,23,8,26,9,27,11,26,13,27,15,26,19,23,22,20,24,15,24,12,22]);
    p.polygon(c.N, [11,17,14,13,19,10,23,9,26,10,25,13,26,15,25,18,22,21,17,23,13,21]);
    p.polygon(c.M, [12,17,15,14,19,11,23,10,25,11,21,13,17,14,14,18,13,20]);
    p.polygon('#536264', [13,17,16,14,20,13,18,15,15,16,14,18]);
    p.polygon('#627174', [22,13,25,12,24,14,22,14]);
    p.rect('#101b24', 15,16, 4,2);
    p.rect('#101b24', 22,15, 3,2);
    p.rect(c.A, 15,16, 4,1); p.rect(c.W, 15,16, 2,1);
    p.rect(c.A, 22,15, 3,1); p.rect(c.W, 22,15);
    p.line('#35494c', 20,16, 19,18);
    p.line('#405659', 19,20, 22,19);
    p.polygon(c.B, [9,22,14,23,20,22,26,20,25,23,20,26,14,28,10,27,8,25]);
    p.polygon(c.O, [9,22,14,24,20,23,25,21,22,24,15,27,11,26]);
    p.line(c.T, 11,24, 15,25);
    p.line(c.A, 21,24, 23,23);
    p.polygon(c.R, [26,21,28,20,27,23,29,25,27,28,25,25,23,25]);
    p.line(c.O,26,22,26,24);
    p.polygon('#637d7d',[24,31,26,27,28,26,30,28,31,31,31,32,24,32]);
    p.line(c.J,26,28,28,27);
    p.rect(c.V,28,28);
  }

  const slimeColors = {
    K:'#18312e', m:'#1e5142', s:'#287451', g:'#3e9b5d',
    l:'#6fbf6f', a:'#a4de89', h:'#d6eda5', e:'#ddeb9b', i:'#233f34'
  };
  function slime(p, frame) {
    p.stamp(slimeColors, 0, frame ? 2 : 1, frame ? `
       .....KKKKKK.....
       ...KKlllaggKK...
       ..KlahhlgggggK..
       .KlgllgggggssgK.
       .KlgllgggggggsK.
       KgggggiegggiesmK
       KgggggiigggiismK
       KsggggggssggssmK
       .KsssggssssssmK.
       .KmmsssssssmmK..
       ..KKKKKKKKKKK...` : `
       .....KKKKK......
       ....KaaallKK....
       ...KahhllglgK...
       ..KllallgggggK..
       .KlgllgggggssgK.
       .KggggggggggssK.
       KgggggiegggiesmK
       KsggggiigggiismK
       KssgggggssggssmK
       .KsssggssssssmK.
       .KmmsssssssmmK..
       ..KKKKKKKKKKK...`);
  }

  const batColors = {
    K:'#222237', S:'#4c375b', V:'#72508c', L:'#9a70b8',
    H:'#cba2dd', O:'#f5a573', Y:'#ffe0a2'
  };
  function bat(p, frame) {
    const wing = frame ? `
      ....KKKKKK..
      ..KKLLVVVVK.
      .KLLVVVSSVVK
      KLVVVSSSSVVK
      KVVVSSKSSVVK
      KVVSKK.KSSVK
      KSKK....KSVK
      KK.......KKK` : `
      KK..........
      KHK.........
      KVLKKK......
      KSVLHVKK....
      KSVVVLLVK...
      KKSVVVVVVK..
      ..KSSVSVVVK.
      ..KSSSKSSVVK
      ...KSK.KSSVK
      ....K...KSVK
      .........KKK`;
    p.stamp(batColors, 0, frame ? 5 : 0, wing);
    p.stamp(batColors, 15, frame ? 5 : 0, wing, true);
    p.stamp(batColors, 9, frame ? 3 : 4, `
      .KK...KK.
      .KVK.KVK.
      .KLKKKLK.
      KLVVVVVVK
      KVSVSVSVK
      .KOYVYOK.
      .KSSVSSK.
      ..KVHVK..
      ..KSLSK..
      ...KVK...
      ...K.K...`);
  }

  const bone = {
    K:'#232b32', X:'#3d3940', D:'#5a5360', M:'#81807a',
    B:'#b8b597', L:'#d9d2a7', H:'#f4e6bd', A:'#ffa463',
    T:'#785240', R:'#995641', S:'#596d70', C:'#91a8a1', E:'#dbe5d1'
  };
  function skeleton(p, frame) {
    p.stamp(bone, 4, 16, frame ? `
      .KBBK.KBK
      .KLBK.KBK
      .KBLK.KLK
      KBBK..KLBK
      KLK...KBBK
      KBLK..KKKK
      KKKK......` : `
      ..KBK.KBK
      ..KLK.KBK
      ..KBK.KLK
      .KBBK.KBK
      .KLBK.KLBK
      KBBBK.KBBK
      KKKKK.KKKK`);
    p.stamp(bone, 0, 8, `
      ...KKKKKKKKKK....
      ..KSSKBBBBKRRK...
      ..KCCKLKKLKTRRK..
      .KCSSKLBLBKKRRK..
      .KSSKKKBBK..KLBK.
      .KSK.KLBLBK.KBBK.
      .KK..KKBBK...KK..
      .....KTTTTK......
      ....KXTRTRK......
      ....KRRKRRK......
      ....KKK.KKK......`);
    p.stamp(bone, 3, frame, `
      ...KKKKKK...
      .KKLHHLLBKK.
      KBLHHHLLLBBK
      KLLHHLLLBBBK
      KBLLLBBLLBBK
      KBBKKKLBKKLK
      .KBXAKBLXAK.
      .KBLBBKBBBK.
      ..KBLBLBLK..
      ...KKBBKK...`);
    p.stamp(bone, 13, frame ? 8 : 6, `
      .....K
      ....KE
      ....KC
      ...KEK
      ...KCK
      ..KEK.
      ..KSK.
      .TCCK.
      .KTTK.
      .KTL..
      KTK...
      KK....`);
  }

  const fungus = {
    K:'#28272f', S:'#653b49', P:'#8f4153', R:'#b75562', V:'#d36d74',
    F:'#ef9092', I:'#f9cbac', L:'#e1bd91', M:'#bf987b', D:'#927369',
    U:'#72785e', G:'#8f9a75', B:'#434341'
  };
  function shroom(p, frame) {
    p.stamp(fungus, 3, 9, frame ? `
       ...KKKKKKK...
       ..KMLLLLMMK..
       ..KLILLLLLK..
       .KLLBLLBLLK..
       .KMMBLLBMDK..
       ..KMLLMLMK...
       .KGMMLMMUGK..
       KUGMKKMMUUK..
       KUGK..KKKK...
       KKKK.........` : `
       ...KKKKKKK...
       ..KMLLLLMMK..
       ..KLILLLLLK..
       .KLLBLLBLLK..
       .KMMBLLBMDK..
       ..KMLLMLMK...
       ..KMMLMMMK...
       .KUGMKKMUGK..
       .KUGK..KUGK..
       .KKKK..KKKK..`);
    p.stamp(fungus, 0, frame ? 1 : 0, `
       .......KKKKKK.......
       .....KKPVVVVRKK.....
       ....KRVVFIIVVRPK....
       ...KRVVVIIIVVPPRK...
       ..KRIIRVVFVRRRVVRK..
       ..KRIIRRVRRRRRIIRK..
       .KVRRRRVVVRRRRIIIPK.
       KVVVRRRIIVRRRPPPRRPK
       KRRRRPPIIRPPRRPPPPSK
       .KSPPPPPRPPRPPPPPSK.
       ..KKSMMLLMMDLLMMSK..
       ....KKKKSKKKKSKK....`);
  }

  const wood = {
    K:'#222536', N:'#323343', B:'#463948', P:'#5d4555', D:'#785463',
    V:'#927078', G:'#304e54', M:'#3c7170', T:'#52948a', S:'#83b39a',
    O:'#ac734b', A:'#e7a255', Y:'#ffda78', W:'#fff0b3'
  };
  function warden(p, frame) {
    const c = wood;
    const horn = `
      ..KK.........
      .KOK...KK....
      .KVK..KOK....
      ..KOK.KOK.KK.
      K..KOKKOKKOK.
      KOKKVOOOKOK..
      .KOVVVOOKK...
      ..KKKVVOOK...
      .....KVOOOK..
      ......KVPOOK.
      .......KVPBK.
      ........KBBBK
      .........KKKK`;
    p.stamp(c, 1, 0, horn);
    p.stamp(c, 22, 1, horn, true);
    // Root feet, two long bark arms, and a plated trunk.
    p.polygon(c.K, [9,25,18,25,18,32,16,35,15,38,8,38,7,36,4,37,5,34,8,31]);
    p.polygon(c.P, [10,26,16,26,16,32,13,34,13,37,9,37,10,34,7,35,9,31]);
    p.line(c.V,11,29,10,33); p.line(c.D,14,31,13,34);
    p.polygon(c.K, [18,26,26,25,27,30,29,32,29,34,33,37,30,37,27,36,28,38,21,38,20,34,18,31]);
    p.polygon(c.B, [20,27,25,26,26,31,28,33,28,35,30,36,25,34,26,37,22,37,22,33,20,30]);
    p.line(c.D,23,30,24,34); p.line(c.M,26,33,27,35);
    const arm = `
      .....KKKK..
      ...KKMTTTKK
      ..KTTSSSMTK
      .KMSSTMMMGK
      .KMMMTGGMGK
      .KGMMPBPKK.
      .KGPVPPK...
      KGPVPDK....
      KBPDPBK....
      KPPPPK.....
      KVPVBK.....
      KDPKPK.....
      KBK.KK.....
      .K.........`;
    p.stamp(c, 1, frame ? 15 : 14, arm);
    p.stamp(c, 24, frame ? 14 : 15, arm, true);
    p.polygon(c.K, [7,18,10,15,18,17,25,14,29,17,27,21,27,26,24,30,21,29,19,33,16,31,14,33,12,29,8,29,9,24]);
    p.polygon(c.P, [9,19,12,16,18,19,25,16,27,18,25,22,25,26,23,29,21,27,19,31,17,28,15,31,14,27,10,28,11,24]);
    p.polygon(c.D, [11,20,16,20,16,23,18,25,16,27,14,24,13,27,12,24]);
    p.polygon(c.B, [20,22,26,19,23,25,22,28,21,26,19,29,19,26]);
    p.line(c.V,12,22,13,23); p.line(c.D,23,23,22,25);
    p.rect(c.O,17,24,2,3); p.rect(c.Y,17,24);
    p.stamp(c, 8, frame ? 8 : 7, `
      .......KKK..........
      .....KKMTTKK..K.....
      ...KKMTSSSTTKKTK....
      ..KTTSTSSTTTMMTK....
      .KMSSTTTMMTMMMKK....
      KMSTTMMMGGMMGGMMKK..
      .KMTMGGVVDDPGTMGGK..
      .KMMGGVDDDPPPBMGGK..
      ..KGGVDPPBPPPBMGK...
      ..KGVDBBBPDBBPDGK...
      ...KVDAYBPBADYPK....
      ...KVDWYBPBYWYPK....
      ....KPDPPVPPPDK.....
      ....KPPVDVDPPBK.....
      .....KVDVBVDBK......
      .....KPBPDPPBK......
      ......KBVBVBK.......
      .......KPBBK........
      ........KKK.........`);
    p.rect(c.S,6,18); p.rect(c.T,29,19);
  }

  const flame = {
    K:'#342b2c', L:'#59362d', B:'#885039', C:'#b77642', A:'#e8a459',
    R:'#a94930', O:'#de5930', T:'#f78b37', Y:'#ffc04d', H:'#ffdf72', W:'#fff1a3'
  };
  function fire(p, frame) {
    p.stamp(flame, 1, 16, `
      ..KKKK......KKKK..
      .KACBBKK.KKBCBAK..
      .KACCLBBKBCLLLCK..
      ..KKCBLBCBBBLCK...
      .....KKABBBKK.....
      ..KKBBBBKCCBBKK...
      KACCCBBK.KKBCBAKK.
      KABBBKK....KBCBAK.
      .KKKK.......KKKK..`);
    p.stamp(flame, 2, 1, frame ? `
      ........T.........
      .......Y..........
      ..........O.......
      .......OO.........
      .......OT.........
      .....O.OT.........
      .....OOTYO........
      ....OOTTYO..O.....
      ....OTTTYYO.OO....
      ...OTTTYYYT.OO....
      ..OOTTTYYYTTTO....
      ..OTYTYYHYYTYOO...
      .OOTYTYHHHYTTTO...
      .OTYYTYHHWHYYTTO..
      .OTYYYHHHWHHYYTO..
      .OOTYYHHWWWHYYTO..
      ..OTYYHHWWWWHYO...
      ..OOTYYHHHHHYYO...
      ...ROTYYYYYYYTO...
      ....ROTTTTTTOR....
      .....RROOOORR.....` : `
      .........Y........
      ....T.............
      ........O.........
      ........T.........
      .......OT.........
      .......OTO..O.....
      ....O.OOTYO.......
      ....OOOTYYO.O.....
      ....OTTTYYOOT.....
      ...OOTTTYYTTTO....
      ..OOYTTTYYTYTO....
      ..OTYTTYYHTYYOO...
      .OOTYTYHHHTYYTO...
      .OTYYTYHHHHTYTO...
      .OTYYTYHWHHTYYTO..
      .OTYYYHHWWHTYYTO..
      .OOTYYHHWWHHYYTO..
      ..OTYYYHWWWHYYO...
      ..OOTYYYHHHYYTO...
      ...ROTTYYYYYTOR...
      ....RROTTTTORR....`);
  }

  function brand(p) {
    const c = flame;
    p.polygon(c.R,[3,23,6,21,22,25,24,28,21,29,4,25]);
    p.polygon(c.A,[4,22,7,21,22,25,23,27,20,27,4,24]);
    p.polygon(c.B,[2,27,3,25,21,20,24,21,24,24,5,29,2,29]);
    p.polygon(c.T,[3,26,21,21,23,21,23,23,5,28,3,28]);
    p.rect(c.H,4,26,3); p.rect(c.O,19,22,3);
    p.polygon(c.O,[3,14,6,16,7,12,9,10,8,6,10,4,10,8,13,7,14,4,13,1,16,2,18,5,18,8,20,10,21,7,23,10,22,14,24,12,24,17,22,20,18,23,9,23,5,21,3,18]);
    p.polygon(c.T,[5,15,7,17,8,13,11,10,11,8,14,9,16,6,16,3,17,5,18,10,20,13,22,10,21,15,23,14,22,18,19,21,10,22,6,20]);
    p.polygon(c.Y,[8,16,10,17,10,14,13,10,14,8,15,12,17,13,19,10,19,14,21,15,20,18,18,21,12,22,9,20]);
    p.polygon(c.W,[11,17,13,18,13,15,15,12,15,15,17,17,18,15,18,18,16,21,13,21,11,19]);
    p.rect(c.Y,6,7,2,2); p.rect(c.T,21,3,2,2);
  }

  const metal = {
    K:ink, D:'#414558', B:'#584541', G:'#b57944', O:'#e7974e',
    Y:'#f5c877', M:'#63808a', S:'#95b3b6', L:'#cfdfd8', H:'#f5f3d8',
    V:'#3c6280'
  };
  function blade(p) {
    p.stamp(metal, 0, 0, `
      ..................KK
      .................KLK
      ................KHSM
      ...............KHLMM
      ..............KHLSMK
      .............KHLSMK.
      ............KHLSMK..
      ...........KHLSMK...
      ..........KHLSMK....
      .........KHLSMK.....
      ..KK....KHLSMK......
      ..KOK..KHLSMK.......
      ...KYGKLSMMK........
      ....KOGMVMK.........
      .....KYOYK..........
      ....KBVKOOK.........
      ...KGVK.KYOK........
      ..KOYK...KKK........
      .KGOK...............
      .KKK................`);
  }

  function dash(p) {
    const c={K:ink,D:'#293e4b',N:'#33576a',B:'#467e8b',M:'#54a3a6',T:'#76c5bc',L:'#a5e0cb',W:'#ddf0ce',C:'#84593e',G:'#c08a51',Y:'#edbd72'};
    p.stamp(c,0,0,`
      ...............KKK..
      .....K......KKKMTK..
      .....KTK..KKMTTLLK..
      ......KLTKMTTWLLK...
      ...K...KTLLWLLKK....
      ...KLTKKTTLLKKKNK...
      ....KTLTTLLKKMBNK...
      KK...KTLLTKNMBMKK...
      KTLTK.KTLTKMBBBNK...
      .KTTLTKTTKNBMBNNK...
      ..KTTLLTKDNNGGGNK...
      ...KTTTKNNBGYYGDBK..
      ....KKKDBBBBGGMBBBK.
      ......KNBBBNNNBMTTK.
      ......KNBNNNNNNBBBK.
      .....KGGCCCBBBGCCKK.
      .....KYYGGGGGGGCK...
      ......KKKKKKKKKK....`);
  }

  function orbit(p) {
    const c={K:'#4e3933',D:'#995139',O:'#d97634',T:'#f29b3c',Y:'#ffca57',H:'#ffe48c',W:'#fff2b6'};
    p.stamp(c,0,0,`
      ...........OT.......
      ..........OT........
      ........OOTT...Y....
      ......OOTYTO........
      .....OTTYTTOO.......
      ....OTYYYTTTT...O...
      ...OTYYHYYTTTO.OT...
      ..OTYYHHHYYTTTOOTO..
      ..OTYHHHHHYYTTTYTO..
      .OTYHHHWWWHYYTYYTO..
      .OTYHWWWWWHHYYYTO...
      .OTYHHWWWWWHHYYTO...
      .OOTYHHHWWWWHHYTO...
      ..DOTYYHHHHHHYTO....
      ..DOOTTYYYYYYTOO....
      ...DOOTTYYYTTOD.....
      ....DDOOTTTODD......
      ......DDDDDD........`);
  }

  function frost(p) {
    const c={K:'#273b55',D:'#405879',B:'#587fa7',M:'#70a5c8',C:'#83d5e1',L:'#b2eee9',W:'#e9fbec'};
    p.stamp(c,0,0,`
      ............K.......
      ...........KCK......
      ..........KCLBK.....
      ..........KCWBK.....
      ....K....KCLWBK.....
      ...KCK...KCWCBK.....
      ...KLBK.KCLWCBK.....
      ...KLCBKKCLWMBK..K..
      ...KCLBKKCLWMBK.KLK.
      ....KLCBKCLWMBKKLCK.
      ....KCLBKCLMCBKLCK..
      .....KLBKCLMBKLMBK..
      .....KCLBCLMBKLCK...
      ......KCBCMBKLMBK...
      ......KBBMBBKLCK....
      .......KBBBBBMK.....
      .....DKKMBBBBKDK....
      .....KBBBMMDMMBK....
      ......KKKKKKKKK.....`);
  }

  function chain(p) {
    const c={K:'#3c3453',D:'#63477c',P:'#8f60b0',V:'#b786d1',L:'#d5aaeb',W:'#f0dafa'};
    p.stamp(c,0,0,`
      .............KKKKKK.
      ............KVLLLWK.
      ...........KVLLWWK..
      ..........KVLLWWK...
      .........KVLLWWK....
      ........KVLWLLK.....
      .......KVLWLLKKKKK..
      ......KVLWWWLLLLWK..
      .....KVLLWWWWLLWK...
      ....KVLLLWWWLLWK....
      ...KPPPVVLWWLWK.....
      ...KKKKKVLWLWK......
      .......KVLWLK.......
      ......KVLWLK........
      .....KVLWLK.........
      ....KVLLLK..........
      ...KPVLLK...........
      ..KPVLK.............
      .KVLK...............
      .KK.................`);
  }

  function vigor(p) {
    const c={K:'#3b3037',D:'#773846',R:'#ac4050',P:'#d85262',V:'#ee6971',L:'#ff9a94',W:'#ffcfb0'};
    p.stamp(c,0,1,`
      ...KKKKK....KKKKK...
      .KKPVVVPK..KRVVVRKK.
      KRVLLLVVPKKPVVVVVRRK
      KPVLWWLVVVVVVVVVVPRK
      KVLLWLVVVVVVVVVVPRRK
      KPVLLVVVVVVVVVVVPRRK
      KPVVVVVVVVVVVVVPPRDK
      .KPVVVVVVVVVVVPPRDK.
      .KPPVVVVVVVVVPPPRDK.
      ..KPPVVVVVVVPPPRDK..
      ...KRPPVVVPPPPRDK...
      ....KRPPPPPPRRDK....
      .....KRRPPPRRDK.....
      ......KRRRRRDK......
      .......KRRRDK.......
      ........KDDK........
      .........KK.........`);
  }

  function magnet(p) {
    const c={K:'#263642',D:'#32576a',B:'#377b8a',M:'#44a3ac',T:'#75d3c8',L:'#b6e9d9',S:'#718792',C:'#a9bfc1',W:'#e3e8d5'};
    p.stamp(c,0,1,`
      ..KKKKK.....KKKKK..
      .KWWCCCK...KWWCCCK.
      .KCCCSSK...KCCCSSK.
      .KCSSSSK...KCSSSSK.
      .KTLTMBK...KTLTMBK.
      .KTLTMBK...KTLTMBK.
      .KTLTMBK...KTLTMBK.
      .KTLTMBK...KTLTMBK.
      .KTLTMBK...KTLTMBK.
      .KTTMMBK...KTMMBDK.
      .KBTTMMBK.KTMMBBDK.
      ..KBTMMMBKMMMBBDK..
      ..KBTTMMMMMMBBDDK..
      ...KBTTTTMMBBDDK...
      ....KBBTTMBBDDK....
      .....KDBBBDDDK.....
      ......KKKKKKK......`);
  }

  function haste(p) {
    const c={K:'#2d3d3e',D:'#345e50',B:'#468267',M:'#57a276',T:'#79bf82',L:'#a4d894',W:'#d9e9a4',S:'#b69263',Y:'#e4be7a'};
    p.stamp(c,0,0,`
      .................KK.
      ...............KKLK.
      .............KKMLLK.
      ............KMLLWKK.
      ..........KKMLLWTK..
      .........KTTLWWTKK..
      ........KTTLLWTTK...
      .......KMTTLWTTKK...
      ......KMTTLWTTK.....
      .....KMTTLWTTMKK....
      ....KMTTLWTTMMK.....
      ....KMTLWTMMKK......
      ...KMTLWTMMK........
      ...KBLYTMMK.........
      ...KLYTMBK..........
      ...KYSBBK...........
      ..KYSKKK............
      .KYSK...............
      KSSK................
      KK..................`);
  }

  function force(p) {
    const c={K:'#392f35',D:'#785143',B:'#a96941',O:'#cb8547',M:'#e7a350',Y:'#f7c474',H:'#ffdc96',T:'#826468',V:'#ae8e85'};
    p.stamp(c,0,0,`
      .........KKK........
      .....KKKKYHMKKK.....
      ....KYHOKHYMKYMK....
      ...KHYMBKYYOKHYMKK..
      ...KHYMBKYYOKYYOKYOK
      ...KMYOBKMOBKYYOKMMK
      ...KOBBBKOBBKMOBKOBK
      ...KBOOBKOOOBMMOBBOK
      .KKKMMOOOMMMOOOOOBBK
      KYHMMYMMMYMMMOOOBBDK
      KHYMBBOMMYYMMOOBBDK.
      .KMMOOBBMMMMMOOBBDK.
      ..KOMMOBBBMMOOBBDK..
      ...KBMMOOOMMOOBDK...
      ....KBBBBOOOOBBK....
      ....KVTTVVVVVTK.....
      ....KVTTVVVVTK......
      ....KBOOOOOOBK......
      ....KKKKKKKKKK......`);
  }

  function gem(p) {
    p.stamp({K:'#254b51',B:'#297b76',T:'#3cb8a2',L:'#79e1c6',W:'#cdfbe1'},0,0,`
      ...KK...
      ..KTWK..
      .KTLWLK.
      KBTLWLWK
      KBTLLLTK
      .KBTLTK.
      .KBBLTK.
      ..KBTK..
      ...KK...`);
  }

  const atlas = {
    hero:[24,25,hero], portrait:[32,32,portrait], slime:[17,13,slime],
    bat:[27,16,bat], skeleton:[19,23,skeleton], shroom:[20,20,shroom],
    warden:[36,38,warden], fire:[22,25,fire], brand:[26,29,brand],
    blade:[20,20,blade], dash:[20,19,dash], orbit:[20,19,orbit],
    frost:[20,20,frost], chain:[20,20,chain], vigor:[20,19,vigor],
    magnet:[20,19,magnet], haste:[20,20,haste], force:[20,20,force], gem:[8,9,gem]
  };
  const surfaces = new Map();
  const icons = new Map();

  function spriteSurface(id, frame, hit) {
    if (!Object.hasOwn(atlas, id)) return null;
    const phase = Math.abs(Math.floor(frame)) % 2;
    const key = id + '/' + phase + (hit ? '/hit' : '');
    if (surfaces.has(key)) return surfaces.get(key);
    const [width, height, paint] = atlas[id];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    paint(new Brush(ctx), phase);
    if (hit) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,242,201,0.72)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
    }
    surfaces.set(key, canvas);
    return canvas;
  }

  function draw(ctx, id, x, y, { scale = 1, flip = false, frame = 0, hit = false } = {}) {
    const image = spriteSurface(id, frame, hit);
    if (!image || !Number.isFinite(scale) || scale <= 0) return;
    const w = image.width * scale, h = image.height * scale;
    const left = Math.round(x - w / 2), top = Math.round(y - h);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(left + w, top);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, w, h);
    } else {
      ctx.drawImage(image, left, top, w, h);
    }
    ctx.restore();
  }

  function iconData(id, scale = 3) {
    const size = Math.max(1, Math.min(32, Math.round(scale) || 1));
    const key = id + '/' + size;
    if (icons.has(key)) return icons.get(key);
    const image = spriteSurface(id, 0, false);
    if (!image) return '';
    const canvas = document.createElement('canvas');
    canvas.width = image.width * size;
    canvas.height = image.height * size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    icons.set(key, png);
    return png;
  }

  window.PixelArt = Object.freeze({ draw, iconData });
})();
