/* 基准点插件 · 核心算法（浏览器、Node 共用；Python 版 jizhundian/core.py 是同一套）
 * 输入：板（楼面 / 板底面）轮廓，平面坐标 mm，y 向下（读文件的部分在 bp-read.js）
 * 输出：每栋楼、每个方向的竖线横线 → 按 50 余数分组 → 推荐基准点；客户自选基准点；切割判断（片区、坐标系、切割线）；每块板的局部基准点
 * 规则来源：《角点C槽参数规则》第 6、19、21、22 节；和《基准点推荐》页面第一步、第二步同一套算法。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const TOL = 0.5;                 // 50 倍数的容差（mm）
  const LINE_TOL = 2.0;            // 同一条线：坐标相差 ≤2 合并
  const DEF = {czN: 3, czGap: 600, bldGap: 3000, famTol: 0.5, seamGap: 1000, seamAdj: 3000, fall: 'best'};
  const PI = Math.PI;
  // 和 Python 一样的取整（四舍五入，不用银行家舍入）
  const rnd = (v, d = 0) => { const k = Math.pow(10, d); return Math.floor(v * k + 0.5) / k; };
  const rr = v => Math.abs(v - rnd(v)) < 0.25 ? rnd(v) : rnd(v, 1);
  const r1 = v => rnd(v, 1);
  const mod = (v, m) => ((v % m) + m) % m;
  const RT = (p, a) => { const c = Math.cos(a * PI / 180), s = Math.sin(a * PI / 180); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const m50 = v => { const m = mod(v, 50); return m < TOL || m > 50 - TOL; };
  const is50t = v => { const m = mod(v, 50); return m <= 0.6 || m >= 49.4; };
  const czRem = v => { let m = mod(v, 50); m = rnd(m, 1); return m < .5 || m > 49.5 ? 0 : m; };
  const pad2 = i => (i < 10 ? '0' : '') + i;
  const fmt = v => (Math.abs(v - Math.round(v)) < 0.25 ? String(Math.round(v)) : v.toFixed(1));
  const area2 = P => { let A = 0; for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A; };

  // ---------- 0. 板的轮廓统一写法：去掉重复点；顺时针（平面坐标 y 向下时面积为正）；从最上面、再最左边的角点开始。
  //   这样角点编号 K1、K2… 和“第一个基准角点”不跟着读图工具（JSTS／GEOS）给的起点走，网页、Node、Python 算出来一样。
  function canon(poly){ const o = []; for (const p of poly){ const q = [r1(p[0]), r1(p[1])]; if (!o.length || Math.hypot(o[o.length - 1][0] - q[0], o[o.length - 1][1] - q[1]) > 0.05) o.push(q); }
    while (o.length > 3 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) <= 0.05) o.pop();
    if (area2(o) < 0) o.reverse(); let k = 0; for (let i = 1; i < o.length; i++) if (o[i][1] < o[k][1] || (o[i][1] === o[k][1] && o[i][0] < o[k][0])) k = i;
    return o.slice(k).concat(o.slice(0, k)); }
  // ---------- 1. 板的方向角：边长加权，最多的那个角度（0.1° 一档）；返回让边横平竖直要转的角 a（RT(p, a)）
  function plateAng(poly){
    const acc = new Map(), n = poly.length;
    for (let i = 0; i < n; i++){ const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      let t = mod(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / PI, 90); t = mod(rnd(t, 1), 90); acc.set(t, (acc.get(t) || 0) + L); }
    let best = 0, bl = -1; for (const [k, L] of acc) if (L > bl){ best = k; bl = L; }
    let th = best > 45 ? best - 90 : best; if (Math.abs(th) <= 0.05) th = 0;
    return th === 0 ? 0 : -th;
  }
  // ---------- 2. 分楼栋：板的外框相距 ≤ bldGap 的连成一栋
  function splitBuildings(plates, gap){
    const bb = plates.map(p => { const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
    const par = plates.map((_, i) => i), f = i => (par[i] === i ? i : (par[i] = f(par[i])));
    for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++){ const a = bb[i], b = bb[j];
      if (a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3]) par[f(i)] = f(j); }
    const G = new Map(); plates.forEach((p, i) => { const k = p.bld || ('#' + f(i)); if (!G.has(k)) G.set(k, []); G.get(k).push(p); });
    const out = [...G.entries()].map(([k, ps]) => ({key: k, plates: ps, x0: Math.min(...ps.map(p => Math.min(...p.poly.map(q => q[0]))))}));
    out.sort((a, c) => a.x0 - c.x0);
    out.forEach((B, i) => { B.id = 'B' + (i + 1); B.name = B.key.startsWith('#') ? (out.length > 1 ? `楼 ${i + 1}` : '整栋') : B.key; });
    return out;
  }
  // ---------- 3. 一个方向的竖线、横线（同 grid2.py）
  function buildLines(plates, a, pre){
    const segs = {V: [], H: []};
    for (const s of plates){ const O = s.poly.map(p => RT(p, a)), n = O.length;
      for (let i = 0; i < n; i++){ const p = O[i], q = O[(i + 1) % n]; let k, c, t0, t1;
        if (Math.abs(p[0] - q[0]) < 0.5){ k = 'V'; c = (p[0] + q[0]) / 2; t0 = Math.min(p[1], q[1]); t1 = Math.max(p[1], q[1]); }
        else if (Math.abs(p[1] - q[1]) < 0.5){ k = 'H'; c = (p[1] + q[1]) / 2; t0 = Math.min(p[0], q[0]); t1 = Math.max(p[0], q[0]); }
        else continue;
        segs[k].push({c, t0, t1, L: t1 - t0, slab: s.id}); } }
    const out = {};
    for (const k of ['V', 'H']){
      const S = segs[k].slice().sort((x, y) => x.c - y.c), groups = [];
      for (const x of S){ const g = groups[groups.length - 1]; if (g && x.c - g.c[g.c.length - 1] <= LINE_TOL){ g.c.push(x.c); g.s.push(x); } else groups.push({c: [x.c], s: [x]}); }
      out[k] = groups.map((g, i) => { const c = g.c.reduce((a, v) => a + v, 0) / g.c.length, ss = g.s.slice().sort((x, y) => x.t0 - y.t0);
        return {id: `${pre}${k}${pad2(i + 1)}`, c: r1(c), t0: r1(Math.min(...ss.map(x => x.t0))), t1: r1(Math.max(...ss.map(x => x.t1))),
          len: ss.reduce((a, x) => a + rr(x.L), 0), nseg: ss.length, segs: ss.map(x => ({slab: x.slab, L: rr(x.L), t0: r1(x.t0), t1: r1(x.t1)}))}; });
    }
    return out;
  }
  // ---------- 4. 按“到第一条线的距离 ÷ 50 的余数”分组，按长度计分（同 datum.py 的 0|none|len）
  function groups(L){
    if (!L.length) return [];
    const x0 = L[0].c, G = new Map();
    for (const l of L){ let r = mod(l.c - x0, 50); r = (r < TOL || r > 50 - TOL) ? 0 : rr(r); if (!G.has(r)) G.set(r, []); G.get(r).push(l); }
    const tot = L.reduce((a, l) => a + l.len, 0) || 1, out = [];
    for (const [r, ls] of G){ const s = ls.reduce((a, l) => a + l.len, 0); let base = ls[0];
      for (const l of ls) if (l.len > base.len || (l.len === base.len && l.c < base.c)) base = l;
      out.push({r, ids: ls.map(l => l.id), n: ls.length, score: s, pct: rnd(100 * s / tot, 1), base: base.id, basec: r1(base.c)}); }
    out.sort((a, c) => (c.score - a.score) || (c.n - a.n) || (a.r - c.r));
    return out;
  }
  // ---------- 5. 角点（同 corners.py ＋ 页面里的内角、270°）
  function corners(s, F){
    const pts = s.poly.map(p => RT(p, F.ang)), n = pts.length, C = [];
    pts.forEach(([x, y], i) => { const rx = x - F.dV, ry = F.dH - y;
      let mx = 0, my = 0, mb = 0; pts.forEach((q, j) => { if (j === i) return; const ax = m50(q[0] - x), ay = m50(q[1] - y); if (ax) mx++; if (ay) my++; if (ax && ay) mb++; });
      C.push({k: `K${i + 1}`, i, x: rr(rx), y: rr(ry), gx: m50(rx), gy: m50(ry), mx, my, mb, pg: [r1(s.poly[i][0]), r1(s.poly[i][1])]}); });
    let A2 = 0; for (let i = 0; i < n; i++){ const a = C[i], c = C[(i + 1) % n]; A2 += a.x * c.y - c.x * a.y; } const sg = A2 > 0 ? 1 : -1;
    C.forEach((c, i) => { const a = C[(i + n - 1) % n], b = C[(i + 1) % n], L0 = Math.hypot(c.x - a.x, c.y - a.y) || 1, L1 = Math.hypot(b.x - c.x, b.y - c.y) || 1, d0 = [(c.x - a.x) / L0, (c.y - a.y) / L0], d1 = [(b.x - c.x) / L1, (b.y - c.y) / L1];
      c.th = rnd(180 - sg * Math.atan2(d0[0] * d1[1] - d0[1] * d1[0], d0[0] * d1[0] + d0[1] * d1[1]) * 180 / PI, 2); c.r270 = Math.abs(c.th - 270) < 1; });
    return C;
  }

  // =====================================================================================
  function analyze(model, opt){
    opt = Object.assign({}, DEF, opt || {});
    const picks = opt.picks || {}, adopt = opt.adopt || {}, manual = opt.manual || {};
    const plates = (model.plates || []).filter(p => p.poly && p.poly.length >= 3).map((p, i) => ({id: p.id || ('P' + pad2(i + 1)), bld: p.bld, poly: canon(p.poly), z: p.z, ang: p.ang})).filter(p => p.poly.length >= 3);
    const B = splitBuildings(plates, opt.bldGap), res = {version: VERSION, settings: {czN: opt.czN, czGap: opt.czGap, fall: opt.fall}, buildings: [], plates: []};
    for (const Bd of B){
      // 方向：每块板的转角，相差 ≤ famTol 的归一个方向；板多的方向排前面
      const fams = [];
      for (const s of Bd.plates){ const a = s.ang != null ? rnd(s.ang, 1) : plateAng(s.poly);   /* 读图时给了方向（被墙隔开分出来的板跟原来那块板走）就用它 */ let F = fams.find(F => Math.abs(F.a0 - a) <= opt.famTol); if (!F){ F = {a0: a, ps: [], acc: new Map()}; fams.push(F); } F.ps.push(s); F.acc.set(a, (F.acc.get(a) || 0) + 1); s.a = a; }
      fams.forEach(F => { let best = F.a0, bn = -1; for (const [a, n] of F.acc) if (n > bn){ best = a; bn = n; } F.ang = best; });
      fams.sort((x, y) => (y.ps.length - x.ps.length) || (Math.abs(x.ang) - Math.abs(y.ang)) || (x.ang - y.ang));
      const many = fams.length > 1, LET = 'ABCDEFGHIJ';
      const bld = {id: Bd.id, name: Bd.name, fams: [], plates: Bd.plates.map(p => p.id)};
      fams.forEach((F, fi) => {
        const pre = many ? LET[fi] + '-' : '', name = many ? `方向 ${LET[fi]}（${F.ang > 0 ? '+' : F.ang < 0 ? '−' : ''}${fmt(Math.abs(F.ang))}°）` : Bd.name;
        const lines = buildLines(F.ps, F.ang, pre), G = {V: groups(lines.V), H: groups(lines.H)};
        if (!G.V.length || !G.H.length) return;
        const fk = Bd.id + '|' + name;
        const fam = {fk, key: LET[fi], name, ang: F.ang, lines, G, bV: G.V[0].base, bH: G.H[0].base, dV: G.V[0].basec, dH: G.H[0].basec, plates: F.ps.map(s => s.id), bld: Bd.id};
        bld.fams.push(fam);
        for (const s of F.ps){ s.fk = fk; s.fam = name; s.bld = Bd.id; s.C = corners(s, fam); s.n = s.C.length; }
      });
      res.buildings.push(bld);
      for (const s of Bd.plates) if (s.C) res.plates.push(s);
    }
    const FAM = new Map(); res.buildings.forEach(b => b.fams.forEach(F => FAM.set(F.fk, F)));
    // ---------- 6. 基准点：推荐的（默认单选）＋ 客户自选的 ＋ 切割判断新建的坐标系
    const lineOf = (F, k, id) => F.lines[k].find(l => l.id === id);
    function bpMk(F, v, h){ const lv = lineOf(F, 'V', v), lh = lineOf(F, 'H', h); if (!lv || !lh) return null;
      const gv = F.G.V.find(g => g.ids.includes(v)), gh = F.G.H.find(g => g.ids.includes(h));
      return {v, h, nm: `${v}×${h}`, cv: lv.c, ch: lh.c, dx: r1(lv.c - F.dV), dy: r1(F.dH - lh.c), def: v === F.bV && h === F.bH, rv: gv ? gv.r : null, rh: gh ? gh.r : null}; }
    function bpPicks(F){ const out = [];
      for (const q of picks[F.fk] || []){ const k = q[0], id = q.slice(2), gg = F.G[k] && F.G[k].find(g => g.ids.includes(id)); if (!gg) continue;
        const g = k === 'V' ? bpMk(F, gg.base, F.bH) : bpMk(F, F.bV, gg.base); if (g && !g.def && !out.some(x => x.nm === g.nm)){ g.pk = k; out.push(g); } }
      return out; }
    // ---------- 7. 切割判断（同 czsteps.js）
    const czCache = new Map();
    const useR = R => adopt[R.key] != null ? !!adopt[R.key] : R.rec;
    function czOf(b){ if (czCache.has(b.id)) return czCache.get(b.id);
      const P = res.plates.filter(r => r.bld === b.id).map(r => { const C = r.C, n = C.length, cv = new Map(), ch = new Map(); let A = 0;
        for (let i = 0; i < n; i++){ const a = C[i], c = C[(i + 1) % n], L = Math.hypot(c.x - a.x, c.y - a.y); A += a.x * c.y - c.x * a.y;
          if (Math.abs(a.x - c.x) < 1){ const m = czRem(a.x); cv.set(m, (cv.get(m) || 0) + L); } else if (Math.abs(a.y - c.y) < 1){ const m = czRem(a.y); ch.set(m, (ch.get(m) || 0) + L); } }
        const dom = M => { let best = null; for (const [m, L] of M) if (!best || L > best[1] + .5 || (Math.abs(L - best[1]) <= .5 && (m === 0 || (best[0] !== 0 && m < best[0])))) best = [m, L]; return best ? best[0] : null; };   /* 并列（边一样长）时取 0，再取余数小的（11-06：原来按边的先后，结果跟着板的起点变） */
        const xs = C.map(c => c.x), ys = C.map(c => c.y);
        return {r, fk: r.fk, fam: r.fam, V: dom(cv), H: dom(ch), bx: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], area: Math.abs(A) / 2e6}; });
      const fks = b.fams.map(F => F.fk), fams = b.fams.map(F => { const Q = P.filter(p => p.fk === F.fk);
        return {fk: F.fk, nm: F.name, n: Q.length, bx: [Math.min(...Q.map(p => p.bx[0])), Math.min(...Q.map(p => p.bx[1])), Math.max(...Q.map(p => p.bx[2])), Math.max(...Q.map(p => p.bx[3]))], bV: F.bV, bH: F.bH,
          gV: new Set(Q.map(p => p.V).filter(v => v != null)).size, gH: new Set(Q.map(p => p.H).filter(v => v != null)).size}; });
      const near = (a, c) => a.bx[0] - opt.czGap <= c.bx[2] && c.bx[0] - opt.czGap <= a.bx[2] && a.bx[1] - opt.czGap <= c.bx[3] && c.bx[1] - opt.czGap <= a.bx[3];
      const regs = [], loose = [];
      for (const fk of fks) for (const dir of ['V', 'H']){ const F = FAM.get(fk), off = P.filter(p => p.fk === fk && p[dir] != null && p[dir] !== 0), seen = new Set();
        for (const p of off){ if (seen.has(p)) continue; const G = [p]; seen.add(p);
          for (let i = 0; i < G.length; i++) for (const q of off) if (!seen.has(q) && q[dir] === p[dir] && near(G[i], q)){ seen.add(q); G.push(q); }
          const m = p[dir], bx = [Math.min(...G.map(q => q.bx[0])), Math.min(...G.map(q => q.bx[1])), Math.max(...G.map(q => q.bx[2])), Math.max(...G.map(q => q.bx[3]))];
          const acc = new Map(), acc2 = new Map(), o2 = dir === 'V' ? 'H' : 'V';
          for (const q of G){ const C = q.r.C, n = C.length; for (let i = 0; i < n; i++){ const a = C[i], c = C[(i + 1) % n], L = Math.hypot(c.x - a.x, c.y - a.y);
            if (Math.abs(a.x - c.x) < 1){ const k = rnd(a.x, 1); if (dir === 'V' && czRem(a.x) === m) acc.set(k, (acc.get(k) || 0) + L); if (o2 === 'V' && czRem(a.x) === 0) acc2.set(k, (acc2.get(k) || 0) + L); }
            if (Math.abs(a.y - c.y) < 1){ const k = rnd(a.y, 1); if (dir === 'H' && czRem(a.y) === m) acc.set(k, (acc.get(k) || 0) + L); if (o2 === 'H' && czRem(a.y) === 0) acc2.set(k, (acc2.get(k) || 0) + L); } } }
          let bl = null; for (const [k, L] of acc) if (!bl || L > bl[1]) bl = [k, L];
          let b2 = null; for (const [k, L] of acc2) if (!b2 || L > b2[1]) b2 = [k, L];
          const bxy = dir === 'V' ? [bl ? bl[0] : bx[0], b2 ? b2[0] : 0] : [b2 ? b2[0] : 0, bl ? bl[0] : bx[1]];
          const on = P.filter(q => q.fk === fk && q[dir] === 0), ov = q => dir === 'V' ? q.bx[1] < bx[3] && q.bx[3] > bx[1] : q.bx[0] < bx[2] && q.bx[2] > bx[0], i0 = dir === 'V' ? 0 : 1, i1 = dir === 'V' ? 2 : 3;
          const cuts = []; let step = false;
          for (const side of [-1, 1]){ const S = on.filter(q => ov(q) && (side < 0 ? (q.bx[i0] + q.bx[i1]) / 2 < bx[i0] : (q.bx[i0] + q.bx[i1]) / 2 > bx[i1])); if (!S.length) continue;
            const edge = side < 0 ? Math.max(...S.map(q => q.bx[i1])) : Math.min(...S.map(q => q.bx[i0])), mine = side < 0 ? bx[i0] : bx[i1];
            if ((side < 0 && edge > mine + 1) || (side > 0 && edge < mine - 1)){ step = true; continue; }
            const c = (edge + mine) / 2, lo = (dir === 'V' ? bx[1] : bx[0]) - 600, hi = (dir === 'V' ? bx[3] : bx[2]) + 600;
            cuts.push(dir === 'V' ? [toPage(F, c, lo), toPage(F, c, hi)] : [toPage(F, lo, c), toPage(F, hi, c)]); }
          const R = {b: b.id, fk, fam: F.name, dir, m, plates: G.map(q => q.r.id), G, n: G.length, area: G.reduce((a, q) => a + q.area, 0), bx, box: boxPg(F, bx, 150), cuts, step, base: toPage(F, bxy[0], bxy[1]), bxy, bl, rec: G.length >= opt.czN};
          R.key = `${fk}|${dir}|${m}|${Math.round(bx[0])},${Math.round(bx[1])}`; R.no = 0; (R.rec ? regs : loose).push(R); } }
      regs.sort((a, c) => (a.fk < c.fk ? -1 : a.fk > c.fk ? 1 : 0) || (a.dir > c.dir ? 1 : a.dir < c.dir ? -1 : 0) || (c.n - a.n)); regs.forEach((R, i) => { R.no = i + 1; });
      const o = {b: b.id, P, fams, regs, loose, dirCuts: seams(b)}; czCache.set(b.id, o); return o; }
    function czSys(b){ const Z = czOf(b); if (Z.sys) return Z.sys;
      const fams = Z.fams.slice().sort((a, c) => c.n - a.n), F0 = fams[0], S = [], rounds = [];
      const units = [...fams.slice(1).map(F => ({kind: 'fam', F, fk: F.fk, n: F.n, key: 'fam|' + F.fk, nm: F.nm})), ...Z.regs.filter(useR).map(R => ({kind: 'reg', R, fk: R.fk, n: R.n, key: `${R.fk}|${R.dir}|${R.m}`, nm: `片区 ${R.no}（${R.fam}${R.dir === 'V' ? '竖线' : '横线'}余 ${fmt(R.m)}）`}))];
      const addPicks = F => { const out = []; for (const g of bpPicks(FAM.get(F.fk))){ const rx = czRem(g.dx), ry = czRem(g.dy), key = rx && !ry ? `${F.fk}|V|${rx}` : ry && !rx ? `${F.fk}|H|${ry}` : `${F.fk}|VH|${rx}|${ry}`; if (S.some(q => q.key === key)) continue;
        const q = {no: S.length + 1, fk: F.fk, key, nm: `${F.nm}的自选基准点 ${g.nm}`, by: null, pick: g, rx, ry}; S.push(q); out.push(q); } return out; };
      const has = u => S.find(q => q.key === u.key);
      S.push({no: 1, fk: F0.fk, key: 'fam|' + F0.fk, nm: `${F0.nm}的基准点 ${F0.bV}×${F0.bH}`, by: null, rx: 0, ry: 0});
      const pk0 = addPicks(F0), pre = units.filter(has); let left = units.filter(u => !has(u));
      rounds.push({no: 1, sys: S[0], picks: pk0, pre: pre.map(u => ({u, s: has(u)})), upTo: S.length, red: left.slice()});
      while (left.length){ left.sort((a, c) => c.n - a.n); const u = left[0], s0 = {no: S.length + 1, fk: u.fk, key: u.key, nm: u.kind === 'fam' ? `${u.nm}的基准点 ${u.F.bV}×${u.F.bH}` : `${u.nm}的片区基准点`, by: u,
          rx: u.kind === 'reg' && u.R.dir === 'V' ? u.R.m : 0, ry: u.kind === 'reg' && u.R.dir === 'H' ? u.R.m : 0}; S.push(s0);
        const pk = u.kind === 'fam' ? addPicks(u.F) : [], reuse = left.filter(v => v !== u && has(v)); left = left.filter(v => v !== u && !has(v));
        rounds.push({no: s0.no, sys: s0, cut: u, picks: pk, reuse: reuse.map(v => ({u: v, s: has(v)})), upTo: S.length, red: left.slice()}); }
      const of = new Map(); for (const u of units) of.set(u.kind === 'fam' ? 'fam|' + u.F.fk : u.R.key, has(u)); of.set('fam|' + F0.fk, S[0]);
      Z.sys = {S, rounds, of, F0, units}; return Z.sys; }
    // 片区用的坐标系的偏法
    function zoneOff(b, R){ const y = czSys(b).of.get(R.key) || {}; return {rx: y.rx != null ? y.rx : R.dir === 'V' ? R.m : 0, ry: y.ry != null ? y.ry : R.dir === 'H' ? R.m : 0, no: y.no, mine: !!(y.by && y.by.R === R), pick: !!y.pick}; }
    // 切割判断新建的坐标系换成这个方向的网格
    function bpOff(F, k, m){ if (!m) return k === 'V' ? F.bV : F.bH; const gg = F.G[k].find(g => { const l = lineOf(F, k, g.base); return l && czRem(k === 'V' ? l.c - F.dV : F.dH - l.c) === m; }); return gg ? gg.base : null; }
    const gridCache = new Map();
    function grids(F){ if (gridCache.has(F.fk)) return gridCache.get(F.fk); const b = res.buildings.find(x => x.id === F.bld), out = [bpMk(F, F.bV, F.bH)]; out[0].src = 'def';
      for (const g of bpPicks(F)) if (!out.some(q => q.nm === g.nm)){ g.src = 'pick'; out.push(g); }
      for (const q of czSys(b).S){ if (q.fk !== F.fk || !q.by || q.by.kind !== 'reg') continue; const v = bpOff(F, 'V', q.rx), h = bpOff(F, 'H', q.ry), g = v && h ? bpMk(F, v, h) : null; if (g && !out.some(x => x.nm === g.nm)){ g.src = 'cut'; g.sys = q.no; out.push(g); } }
      let np = 0; out.forEach((g, i) => { g.slot = i; g.tag = !i ? '基准点' : g.src === 'pick' ? `自选基准点 ${++np}` : `坐标系 ${g.sys} 基准点`; g.pg = toPage(F, g.dx, g.dy); });
      gridCache.set(F.fk, out); return out; }
    const onG = (c, g) => (Math.abs(g.dx) < 1e-6 ? !!c.gx : is50t(c.x - g.dx)) && (Math.abs(g.dy) < 1e-6 ? !!c.gy : is50t(c.y - g.dy));
    // ---------- 8. 方向之间的切割长线（同第九步的长线，用两个方向相对的板边，中间隔墙 ≤ seamGap）
    function seams(b){
      if (b.fams.length < 2) return [];
      const EE = [];
      for (const r of res.plates.filter(r => r.bld === b.id)){ const P = r.poly, n = P.length, sg = area2(P) > 0 ? 1 : -1;
        for (let i = 0; i < n; i++){ const A = P[i], C = P[(i + 1) % n], L = Math.hypot(C[0] - A[0], C[1] - A[1]); if (L < 200) continue; const t = [(C[0] - A[0]) / L, (C[1] - A[1]) / L];
          EE.push({r, A, C, L, t, n: [-t[1] * sg, t[0] * sg]}); } }   // n：朝板里
      const PR = [];
      for (let x = 0; x < EE.length; x++) for (let y = x + 1; y < EE.length; y++){ const e = EE[x], g = EE[y]; if (e.r === g.r) continue;
        if (e.n[0] * g.n[0] + e.n[1] * g.n[1] > -0.9999) continue;
        const d = -(e.n[0] * (g.A[0] - e.A[0]) + e.n[1] * (g.A[1] - e.A[1])); if (d <= 1 || d > opt.seamGap) continue;
        let t = e.t; if (t[0] < -1e-9 || (Math.abs(t[0]) < 1e-9 && t[1] < 0)) t = [-t[0], -t[1]]; const nu = [-t[1], t[0]];
        const pr = q => q[0] * t[0] + q[1] * t[1], Pp = [pr(e.A), pr(e.C)].sort((a, c) => a - c), Qq = [pr(g.A), pr(g.C)].sort((a, c) => a - c);
        const lo = Math.max(Pp[0], Qq[0]), hi = Math.min(Pp[1], Qq[1]); if (hi - lo <= 1) continue;
        const oe = e.A[0] * nu[0] + e.A[1] * nu[1], og = g.A[0] * nu[0] + g.A[1] * nu[1];
        PR.push({e, g, t, ang: Math.atan2(t[1], t[0]), o0: Math.min(oe, og), o1: Math.max(oe, og), s0: lo, s1: hi, seed: e.r.fk !== g.r.fk}); }
      const AX = b.fams.flatMap(F => [-F.ang, -F.ang + 90].map(d => d * PI / 180));
      const snapT = t => { const a0 = Math.atan2(t[1], t[0]); let best = null; for (const d of AX){ const e = Math.abs(Math.sin(a0 - d)); if (e < Math.sin(0.1 * PI / 180) && (!best || e < best.e)) best = {d, e}; } if (!best) return t;
        let u = [Math.cos(best.d), Math.sin(best.d)]; if (u[0] * t[0] + u[1] * t[1] < 0) u = [-u[0], -u[1]]; return u; };
      const lines = [], used = new Set();
      for (const sd of PR){ if (!sd.seed || used.has(sd)) continue;
        const t0 = snapT(sd.t), L = {t: t0, nu: [-t0[1], t0[0]], ang: Math.atan2(t0[1], t0[0]), o0: sd.o0, o1: sd.o1, s0: sd.s0, s1: sd.s1, pairs: [sd]}; used.add(sd);
        let more = true;
        while (more){ more = false;
          for (const p of PR){ if (used.has(p) || Math.abs(Math.sin(p.ang - L.ang)) > 0.009) continue;
            const o0 = Math.max(L.o0, p.o0), o1 = Math.min(L.o1, p.o1); if (o1 - o0 < 1) continue;
            if (p.s0 > L.s1 + opt.seamAdj || p.s1 < L.s0 - opt.seamAdj) continue;
            L.o0 = o0; L.o1 = o1; L.s0 = Math.min(L.s0, p.s0); L.s1 = Math.max(L.s1, p.s1); L.pairs.push(p); used.add(p); more = true; } }
        L.off = (L.o0 + L.o1) / 2; const fs = [...new Set(L.pairs.flatMap(p => [p.e.r.fam, p.g.r.fam]))]; L.nm = fs.join('／') + ' 衔接';
        L.a = [L.t[0] * (L.s0 - 600) + L.nu[0] * L.off, L.t[1] * (L.s0 - 600) + L.nu[1] * L.off]; L.c = [L.t[0] * (L.s1 + 600) + L.nu[0] * L.off, L.t[1] * (L.s1 + 600) + L.nu[1] * L.off];
        L.plates = [...new Set(L.pairs.flatMap(p => [p.e.r.id, p.g.r.id]))]; lines.push(L); }
      lines.forEach((L, i) => { L.no = i + 1; });
      return lines.map(L => ({no: L.no, nm: L.nm, a: [r1(L.a[0]), r1(L.a[1])], c: [r1(L.c[0]), r1(L.c[1])], plates: L.plates})); }
    // 第一步坐标（x 右、y 上，相对方向的基准点）→ 平面坐标
    function toPage(F, x, y){ const p = RT([x + F.dV, F.dH - y], -F.ang); return [r1(p[0]), r1(p[1])]; }
    function boxPg(F, bx, e){ return [[bx[0] - e, bx[1] - e], [bx[2] + e, bx[1] - e], [bx[2] + e, bx[3] + e], [bx[0] - e, bx[3] + e]].map(p => toPage(F, p[0], p[1])); }
    // ---------- 9. 每块板的局部基准点（第二步）
    function bestOf(r){ let b = null; const C2 = r.C.filter(c => !c.r270); for (const c of C2){ const h = C2.filter(d => m50(d.x - c.x) && m50(d.y - c.y)); if (!b || h.length > b.h.length) b = {c, h}; } return b; }
    for (const r of res.plates){ const F = FAM.get(r.fk), G = grids(F);
      r.grid = null; for (const g of G) if (r.C.some(c => !c.r270 && onG(c, g))){ r.grid = g; break; }
      r.C.forEach(c => { c.isB = !c.r270 && !!r.grid && onG(c, r.grid); });
      const y = r.C.filter(c => c.isB).length, n2 = r.C.filter(c => !c.r270).length;
      r.state = y === n2 ? 'full' : y === 0 ? 'none' : 'part';
      const bo = bestOf(r), mp = manual[r.id];
      r.best = bo ? {k: bo.c.k, x: bo.c.x, y: bo.c.y, hit: bo.h.length, of: n2} : null;
      if (mp && isFinite(mp.x) && isFinite(mp.y)) r.base = {src: 'pick', x: mp.x, y: mp.y, k: mp.k || null, txt: `人工点${mp.k ? ' ' + mp.k : ''} (${fmt(mp.x)}, ${fmt(mp.y)})`};
      else { const yc = r.C.find(c => c.isB);
        if (yc) r.base = {src: 'corner', x: yc.x, y: yc.y, k: yc.k, txt: `基准角点 ${yc.k}`};
        else if (opt.fall === 'best' && bo) r.base = {src: 'best', x: bo.c.x, y: bo.c.y, k: bo.c.k, txt: `推荐点 ${bo.c.k}（拟设，要人工确认）`};
        else r.base = {src: 'origin', x: 0, y: 0, txt: '整体原点（暂用）'}; }
      r.base.pg = toPage(F, r.base.x, r.base.y);
      const ev = (x, y) => { const C2 = r.C.filter(c => !c.r270); return {x: C2.filter(c => m50(c.x - x)).length, y: C2.filter(c => m50(c.y - y)).length, both: C2.filter(c => m50(c.x - x) && m50(c.y - y)).length, total: C2.length}; };
      r.base.ev = ev(r.base.x, r.base.y); r.needPick = r.state === 'none'; }
    // ---------- 片区线条统计（11-06 用户：每个片区竖向、横向一共多少条线，原来不在 50 倍数上多少条，切割后优化了多少条）
    function czLines(Q, k){ const pos = [];
      for (const q of Q){ const C = q.r.C, n = C.length; for (let i = 0; i < n; i++){ const a = C[i], c = C[(i + 1) % n]; if (k === 'V' ? Math.abs(a.x - c.x) < 1 : Math.abs(a.y - c.y) < 1) pos.push([k === 'V' ? a.x : a.y, Math.hypot(c.x - a.x, c.y - a.y)]); } }
      pos.sort((a, c) => a[0] - c[0]); const out = []; for (const [p, L] of pos){ const g = out[out.length - 1]; if (g && p - g.p1 <= .6){ g.p1 = p; g.L += L; g.ps.push(p); } else out.push({p0: p, p1: p, L, ps: [p]}); }
      return out.map(g => ({p: g.ps.reduce((a, v) => a + v, 0) / g.ps.length, L: g.L})); }
    function czStats(b){ const Z = czOf(b), Y = czSys(b), used = Z.regs.filter(useR), inReg = new Set(), rows = [];
      used.forEach(R => R.G.forEach(q => inReg.add(q.r.id)));
      const cnt = (Q, rx, ry, rot) => { const o = {}; for (const k of ['V', 'H']){ const off = k === 'V' ? rx : ry; let bad = 0, fix = 0, left = 0, worse = 0, n = 0;
          for (const l of czLines(Q, k)){ n++; const m = czRem(l.p), was = rot || m !== 0, ok = m === off; if (was) bad++; if (was && ok) fix++; if (!ok){ left++; if (!was) worse++; } }
          o[k] = {n, bad, fix, left, worse}; } return o; };
      const fams = Z.fams.slice().sort((a, c) => (a.fk === Y.F0.fk ? -1 : c.fk === Y.F0.fk ? 1 : 0));
      for (const F of fams){ const Q = Z.P.filter(p => p.fk === F.fk && !inReg.has(p.r.id)), y = Y.of.get('fam|' + F.fk); if (!Q.length) continue;
        rows.push(Object.assign({kind: 'fam', fk: F.fk, nm: Z.fams.length > 1 ? F.nm : '主体（没切出去的板）', sys: y ? y.no : 1, n: Q.length, plates: Q.map(q => q.r.id)}, cnt(Q, 0, 0, F.fk !== Y.F0.fk))); }
      for (const R of used){ const o = zoneOff(b, R);
        rows.push(Object.assign({kind: 'reg', key: R.key, fk: R.fk, nm: `片区 ${R.no}（${Z.fams.length > 1 ? R.fam : ''}${R.dir === 'V' ? '竖线' : '横线'}余 ${fmt(R.m)}）`, sys: o.no, n: R.n, mine: o.mine, plates: R.plates}, cnt(R.G, o.rx, o.ry, R.fk !== Y.F0.fk))); }
      const tot = {V: {n: 0, bad: 0, fix: 0, left: 0, worse: 0}, H: {n: 0, bad: 0, fix: 0, left: 0, worse: 0}};
      for (const r of rows) for (const k of ['V', 'H']) for (const x in tot[k]) tot[k][x] += r[k][x];
      return {rows, tot}; }
    // ---------- 10. 汇总
    for (const b of res.buildings){ const Y = czSys(b), Z = czOf(b);
      b.cz = {count: Y.S.length, regs: Z.regs.map(R => czRegOut(b, R)), loose: Z.loose.map(R => czRegOut(b, R)), dirCuts: Z.dirCuts,
        systems: Y.S.map(q => ({no: q.no, fk: q.fk, key: q.key, nm: q.nm, rx: q.rx, ry: q.ry, src: q.pick ? 'pick' : q.by ? (q.by.kind === 'fam' ? 'fam' : 'cut') : 'def'})),
        rounds: roundsText(Y), fams: Z.fams.map(F => ({fk: F.fk, nm: F.nm, n: F.n, gV: F.gV, gH: F.gH, sys: (Y.of.get('fam|' + F.fk) || {}).no})), stats: czStats(b)};
      for (const F of b.fams){ F.grids = grids(F).map(g => Object.assign({}, g)); F.picks = (picks[F.fk] || []).slice(); F.sys = (Y.of.get('fam|' + F.fk) || {}).no; } }
    function czRegOut(b, R){ const o = R.rec && useR(R) ? zoneOff(b, R) : null;
      return {key: R.key, no: R.no, fk: R.fk, fam: R.fam, dir: R.dir, m: R.m, n: R.n, plates: R.plates, area: rnd(R.area, 2), bx: R.bx, box: R.box, cuts: R.cuts, step: R.step, base: R.base, bxy: R.bxy, bl: R.bl,
        rec: R.rec, use: R.rec ? useR(R) : false, sys: o ? o.no : null, sysNew: o ? o.mine : false, sysPick: o ? o.pick : false, rx: o ? o.rx : null, ry: o ? o.ry : null}; }
    function roundsText(Y){ const nm = u => `${u.nm}（${u.n} 块板）`, pk = r => r.picks && r.picks.length ? `，加上自选的${r.picks.map(q => `坐标系 ${q.no}＝${q.pick.nm}`).join('、')}` : '';
      const ok = L => L.map(({u, s}) => `${nm(u)}在坐标系 ${s.no}${s.pick ? '（自选）' : ''}里是绿的`).join('、');
      return Y.rounds.map(r => r.no === 1 ? `只用坐标系 1＝${r.sys.nm}${pk(r)}：${r.pre.length ? ok(r.pre) + '；' : ''}${r.red.length ? `成片红的：${r.red.map(nm).join('、')}` : '没有成片红的'}。`
        : `切出${nm(r.cut)}，建坐标系 ${r.no}${r.cut.kind === 'fam' ? '（转了角度，在前面的坐标系里整片都是红的）' : ''}${pk(r)}${r.reuse.length ? `；${ok(r.reuse)}，复用` : ''}${r.red.length ? `；${r.red.map(nm).join('、')}在坐标系 1～${r.upTo} 里还是红的` : '；没有成片红的了'}。`); }
    // ---------- 11. 给界面用的：线的颜色分类、片区里的线
    res.api = {
      fam: fk => FAM.get(fk), grids, czOf: bid => czOf(res.buildings.find(b => b.id === bid)), czSys: bid => czSys(res.buildings.find(b => b.id === bid)), useR, toPage, onG,
      zoneOff: (bid, R) => zoneOff(res.buildings.find(b => b.id === bid), R),
      zoneLines(R){ if (R._zl) return R._zl; const Z = {V: new Map(), H: new Map()};
        for (const q of R.G){ const C = q.r.C, n = C.length; for (let i = 0; i < n; i++){ const a = C[i], c = C[(i + 1) % n], L = Math.hypot(c.x - a.x, c.y - a.y);
          if (Math.abs(a.x - c.x) < 1){ const k = rnd(a.x, 1); Z.V.set(k, (Z.V.get(k) || 0) + L); } else if (Math.abs(a.y - c.y) < 1){ const k = rnd(a.y, 1); Z.H.set(k, (Z.H.get(k) || 0) + L); } } }
        return (R._zl = Z); },
      linePos: (F, k, l) => k === 'V' ? l.c - F.dV : F.dH - l.c,
      zoneLen(F, k, l, R){ const p = this.linePos(F, k, l); for (const [x, L] of this.zoneLines(R)[k]) if (Math.abs(x - p) < .6) return L; return 0; },
      // 线的状态：base 推荐基准线／pick 自选基准线／ok 对得上（推荐的或自选的网格）／zone 片区里对上自己坐标系／hard 成片对不上（推荐切、没采用）／soft 零散对不上
      lineState(F, k, l){ const b = res.buildings.find(x => x.id === F.bld), Z = czOf(b), pos = this.linePos(F, k, l), P = bpPicks(F);
        if (l.id === (k === 'V' ? F.bV : F.bH)) return 'base';
        if (P.some(g => g.pk === k && (k === 'V' ? g.v : g.h) === l.id)) return 'pick';
        if (m50(pos) || P.some(g => g.pk === k && m50(pos - (k === 'V' ? g.dx : g.dy)))) return 'ok';
        const m = czRem(pos);
        for (const R of Z.regs.filter(R => R.fk === F.fk && useR(R))){ const o = zoneOff(b, R); if ((k === 'V' ? o.rx : o.ry) === m && this.zoneLen(F, k, l, R)) return 'zone'; }
        if (Z.regs.some(R => R.fk === F.fk && R.dir === k && R.m === m && !useR(R) && this.zoneLen(F, k, l, R) > 0)) return 'hard';
        return 'soft'; }
    };
    res.summary = res.buildings.map(b => ({bld: b.name, plates: b.plates.length, fams: b.fams.map(F => ({name: F.name, ang: F.ang, base: `${F.bV}×${F.bH}`, V: `余 ${fmt(F.G.V[0].r)} · ${F.G.V[0].n} 条 · ${F.G.V[0].pct}%`, H: `余 ${fmt(F.G.H[0].r)} · ${F.G.H[0].n} 条 · ${F.G.H[0].pct}%`})), coordSystems: b.cz.count,
      need: res.plates.filter(r => r.bld === b.id && r.needPick).length}));
    return res;
  }
  // 结果去掉内部引用，变成能存 JSON 的样子
  function toJSON(res, model){
    const T = (model && model.meta && model.meta.T) || null, W = p => T ? [r1(T.ox + T.sx * p[0]), r1(T.oy + T.sy * p[1])] : p;
    return {version: res.version, settings: res.settings, input: model ? {kind: model.kind, name: model.name, unit: 'mm', plates: (model.plates || []).length, coord: T ? (T.note || '') : '平面坐标'} : null, summary: res.summary,
      buildings: res.buildings.map(b => ({id: b.id, name: b.name, plates: b.plates,
        fams: b.fams.map(F => ({fk: F.fk, name: F.name, ang: F.ang, coordSystem: F.sys, recommend: {V: F.bV, H: F.bH, cV: F.dV, cH: F.dH}, groups: F.G,
          basePoints: F.grids.map(g => ({tag: g.tag, src: g.src, nm: g.nm, v: g.v, h: g.h, sys: g.sys || null, xy: g.pg, world: W(g.pg)})), picks: F.picks,
          lines: {V: F.lines.V.map(l => ({id: l.id, c: l.c, t0: l.t0, t1: l.t1, len: l.len, nseg: l.nseg})), H: F.lines.H.map(l => ({id: l.id, c: l.c, t0: l.t0, t1: l.t1, len: l.len, nseg: l.nseg}))}})),
        cut: {coordSystems: b.cz.count, systems: b.cz.systems, rounds: b.cz.rounds, lineStats: b.cz.stats, regions: b.cz.regs.map(R => Object.assign({}, R, {baseWorld: W(R.base)})), loose: b.cz.loose.map(R => ({key: R.key, fam: R.fam, dir: R.dir, m: R.m, plates: R.plates})), dirCuts: b.cz.dirCuts}})),
      plates: res.plates.map(r => ({id: r.id, bld: r.bld, fam: r.fam, poly: r.poly.map(p => [r1(p[0]), r1(p[1])]), grid: r.grid ? r.grid.nm : null, state: r.state, needPick: r.needPick,
        base: {src: r.base.src, k: r.base.k || null, x: r.base.x, y: r.base.y, xy: r.base.pg, world: W(r.base.pg), txt: r.base.txt}, best: r.best,
        corners: r.C.map(c => ({k: c.k, x: c.x, y: c.y, gx: c.gx, gy: c.gy, r270: c.r270, isB: c.isB, xy: c.pg}))}))};
  }
  return {VERSION, DEF, analyze, toJSON, canon, plateAng, buildLines, groups, corners, RT, m50, czRem, rr, r1, rnd, fmt};
});
