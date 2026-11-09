// Small dependency-free SVG charts with hover tooltips. Each chart redraws on resize.
window.Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const RED = '#ff3131';
  let uid = 0;

  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtMoney = v => '$' + Math.round(v).toLocaleString('en-US');
  const fmtAxis = v => v === 0 ? '$0' : Math.abs(v) >= 1e6 ? '$' + +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1000 ? '$' + +(v / 1000).toFixed(1) + 'k' : '$' + v;
  const fmtCount = v => Math.round(v).toLocaleString('en-US');
  const fmtCountAxis = v => v === 0 ? '0' : Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1000 ? +(v / 1000).toFixed(1) + 'K' : String(v);
  // cfg.unit: 'money' (default) or 'count' for plain numbers such as views
  const formats = cfg => (cfg.unit === 'count' ? { val: fmtCount, axis: fmtCountAxis } : { val: fmtMoney, axis: fmtAxis });

  function niceScale(max, ticks = 4) {
    if (max <= 0) return { max: 100, step: 25 };
    const raw = max / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    return { max: step * Math.ceil(max / step), step };
  }

  // floorY: the zero line; control points are kept above it so the curve never dips below $0
  function smooth(pts, floorY = Infinity) {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
    const cy = v => Math.min(v, floorY);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const t = 0.18;
      d += ` C${p1[0] + (p2[0] - p0[0]) * t},${cy(p1[1] + (p2[1] - p0[1]) * t)} ${p2[0] - (p3[0] - p1[0]) * t},${cy(p2[1] - (p3[1] - p1[1]) * t)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  function setup(el, cfg) {
    el.innerHTML = '';
    el.classList.add('chart');
    if (!cfg.points || !cfg.points.length || cfg.points.every(p => !(p.amount || p.total))) {
      el.innerHTML = `<div class="chart-empty" style="height:${cfg.height || 260}px"><div>${cfg.empty || 'No data yet.'}</div></div>`;
      return null;
    }
    const w = Math.max(280, el.clientWidth);
    const h = cfg.height || 280;
    const tip = document.createElement('div');
    tip.className = 'tip';
    el.appendChild(tip);
    return { w, h, tip };
  }

  function grid(svg, { L, R, T, ih, w, scale, y, F }) {
    let s = '';
    for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e4e9" stroke-dasharray="4 4"/>`;
      s += `<text x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${(F ? F.axis : fmtAxis)(v)}</text>`;
    }
    return s;
  }

  function showTip(tip, x, y, l1, l2) {
    tip.innerHTML = `${l1}<b>${l2}</b>`;
    // flip below the point near the top, and keep it inside the chart horizontally
    tip.classList.toggle('below', y < 70);
    const half = (tip.offsetWidth || 110) / 2, max = tip.parentElement.clientWidth;
    tip.style.left = Math.min(Math.max(x, half), max - half) + 'px';
    tip.style.top = y + 'px';
    tip.classList.add('show');
  }

  /* ---------- Area / line chart ---------- */
  function line(el, cfg) {
    const F = formats(cfg);
    const base = setup(el, cfg); if (!base) return;
    const { w, h, tip } = base;
    const pts = cfg.points;
    const L = 58, R = 14, T = 24, B = 34, iw = w - L - R, ih = h - T - B;
    const scale = niceScale(Math.max(...pts.map(p => p.amount)));
    const x = i => L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1));
    const y = v => T + ih - (v / scale.max) * ih;
    const id = 'g' + (++uid);
    const coords = pts.map((p, i) => [x(i), y(p.amount)]);
    const d = smooth(coords, T + ih);
    const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 70))));

    let s = `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" height="${h}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${RED}" stop-opacity=".24"/><stop offset="1" stop-color="${RED}" stop-opacity="0"/></linearGradient></defs>`;
    s += grid(null, { L, R, T, ih, w, scale, y, F });
    // count back from the newest point so the latest label is always shown
    pts.forEach((p, i) => { if ((pts.length - 1 - i) % every === 0) s += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle">${p.label}</text>`; });
    s += `<path d="${d} L${x(pts.length - 1)},${T + ih} L${x(0)},${T + ih}Z" fill="url(#${id})"/>`;
    s += `<path d="${d}" fill="none" stroke="${RED}" stroke-width="2.6" stroke-linecap="round" class="draw"/>`;
    s += `<line class="cross" y1="${T}" y2="${T + ih}" stroke="${RED}" stroke-dasharray="3 4" stroke-width="1.4" opacity="0"/>`;
    s += `<circle class="dot" r="6" fill="#fff" stroke="${RED}" stroke-width="2.6" opacity="0"/>`;
    s += `<rect class="hit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.insertAdjacentHTML('afterbegin', s);

    const svg = el.querySelector('svg');
    const path = svg.querySelector('.draw');
    if (cfg.animate !== false && !reduced()) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)';
      path.style.strokeDashoffset = 0;
      setTimeout(() => { path.style.cssText = ''; }, 1100);
    }

    const cross = svg.querySelector('.cross'), dot = svg.querySelector('.dot');
    const focus = i => {
      const [cx, cy] = coords[i];
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('y1', cy); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('opacity', 1);
      const k = el.clientWidth / w;
      showTip(tip, cx * k, cy * k, pts[i].label, F.val(pts[i].amount));
    };
    const peak = pts.reduce((m, p, i) => (p.amount > pts[m].amount ? i : m), 0);
    focus(peak);
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (w / r.width);
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(pts.length === 1 ? 0 : (px - L) / (iw / (pts.length - 1)))));
      focus(i);
    });
    hit.addEventListener('pointerleave', () => focus(peak));
  }

  /* ---------- Several lines on one axis, each switchable (cfg.series[].on) ----------
     cfg: { labels: [...], series: [{ key, label, color, values: [...], on }], range: last N points (optional) } */
  function multi(el, cfg) {
    const F = formats(cfg);
    const n = cfg.range ? Math.min(cfg.range, cfg.labels.length) : cfg.labels.length;
    const labels = cfg.labels.slice(-n);
    const series = cfg.series.filter(s => s.on).map(s => ({ ...s, values: s.values.slice(-n) }));
    const all = series.flatMap(s => s.values);
    const base = setup(el, { ...cfg, points: all.map(v => ({ amount: v })), empty: series.length ? cfg.empty : 'Switch a line on to see it.' }); if (!base) return;
    const { w, h, tip } = base;
    tip.classList.add('tip-card');
    const L = 58, R = 18, T = 20, B = 34, iw = w - L - R, ih = h - T - B;
    const scale = niceScale(Math.max(...all));
    const x = i => L + (labels.length === 1 ? iw / 2 : i * iw / (labels.length - 1));
    const y = v => T + ih - (v / scale.max) * ih;
    const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 64))));

    let s = `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" height="${h}">`;
    s += grid(null, { L, R, T, ih, w, scale, y, F });
    labels.forEach((l, i) => {
      s += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + ih}" stroke="#f0f0f3"/>`;
      if ((labels.length - 1 - i) % every === 0) s += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle">${l}</text>`;
    });
    const paths = series.map(sr => smooth(sr.values.map((v, i) => [x(i), y(v)]), T + ih));
    // cfg.fill: a soft area under each line, fading to nothing at the bottom
    if (cfg.fill) series.forEach((sr, k) => {
      const id = 'm' + (++uid);
      s += `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${sr.color}" stop-opacity=".2"/><stop offset="1" stop-color="${sr.color}" stop-opacity="0"/></linearGradient></defs>`;
      s += `<path d="${paths[k]} L${x(labels.length - 1)},${T + ih} L${x(0)},${T + ih}Z" fill="url(#${id})"/>`;
    });
    // a wide faint copy under each line gives it the soft glow
    series.forEach((sr, k) => { s += `<path d="${paths[k]}" fill="none" stroke="${sr.color}" stroke-width="9" stroke-linecap="round" opacity=".12"/>`; });
    series.forEach((sr, k) => { s += `<path d="${paths[k]}" fill="none" stroke="${sr.color}" stroke-width="3" stroke-linecap="round" class="draw"/>`; });
    s += `<line class="cross" y1="${T}" y2="${T + ih}" stroke="#8a8b93" stroke-dasharray="3 4" stroke-width="1.2" opacity="0"/>`;
    series.forEach(sr => { s += `<circle class="dot" r="6.5" fill="${sr.color}" stroke="#fff" stroke-width="3" opacity="0"/>`; });
    s += `<rect class="hit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.insertAdjacentHTML('afterbegin', s);

    const svg = el.querySelector('svg');
    if (cfg.animate !== false && !reduced()) svg.querySelectorAll('.draw').forEach(path => {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)';
      path.style.strokeDashoffset = 0;
      setTimeout(() => { path.style.cssText = ''; }, 1200);
    });

    const cross = svg.querySelector('.cross'), dots = [...svg.querySelectorAll('.dot')];
    const focus = i => {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
      series.forEach((sr, k) => { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(sr.values[i])); dots[k].setAttribute('opacity', 1); });
      const top = Math.min(...series.map(sr => y(sr.values[i]))), k = el.clientWidth / w;
      tip.innerHTML = `<div class="tc-h">${labels[i]}</div>` + series.map(sr => `<div class="tc-r"><i style="background:${sr.color}"></i>${sr.label}<b>${F.val(sr.values[i])}</b></div>`).join('');
      tip.classList.toggle('below', top < 110);
      const half = (tip.offsetWidth || 160) / 2, max = el.clientWidth;
      tip.style.left = Math.min(Math.max(x(i) * k, half), max - half) + 'px';
      tip.style.top = top * k + 'px';
      tip.classList.add('show');
    };
    const latest = labels.length - 1;
    focus(latest);
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (w / r.width);
      focus(Math.max(0, Math.min(latest, Math.round(labels.length === 1 ? 0 : (px - L) / (iw / (labels.length - 1))))));
    });
    hit.addEventListener('pointerleave', () => focus(latest));
  }

  /* ---------- Bar chart (optionally stacked) ---------- */
  function bar(el, cfg) {
    const F = formats(cfg);
    const pts = cfg.points.map(p => ({ ...p, total: cfg.stack ? cfg.stack.reduce((a, s) => a + (p[s.key] || 0), 0) : p.amount }));
    const base = setup(el, { ...cfg, points: pts }); if (!base) return;
    const { w, h, tip } = base;
    const L = 58, R = 14, T = 20, B = 34, iw = w - L - R, ih = h - T - B, step = iw / pts.length;
    const scale = niceScale(Math.max(...pts.map(p => p.total)));
    const y = v => T + ih - (v / scale.max) * ih;
    const bw = Math.max(6, Math.min(cfg.barWidth || 46, step * 0.6));
    const id = 'b' + (++uid);
    const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 64))));
    const avg = pts.reduce((a, p) => a + p.total, 0) / pts.length;

    let s = `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" height="${h}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff3131"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs>`;
    s += grid(null, { L, R, T, ih, w, scale, y, F });
    const rr = Math.min(6, bw / 3);
    const roundTop = (x, top, bottom, width) => bottom - top < rr * 1.5
      ? `M${x},${bottom} V${top} h${width} V${bottom}Z`
      : `M${x},${bottom} V${top + rr} q0,-${rr} ${rr},-${rr} h${width - 2 * rr} q${rr},0 ${rr},${rr} V${bottom}Z`;
    // soft band behind the active column
    pts.forEach((p, i) => { s += `<rect class="band" data-i="${i}" x="${L + step * i + Math.min(2, step / 4)}" y="${T}" width="${Math.max(0, step - Math.min(4, step / 2))}" height="${ih}" rx="6" fill="#ff3131" opacity="0"/>`; });
    pts.forEach((p, i) => {
      const cx = L + step * i + step / 2;
      if (cfg.stack) {
        let acc = 0;
        cfg.stack.forEach((sk, k) => {
          const v = p[sk.key] || 0; if (!v) return;
          const top = y(acc + v), bottom = y(acc);
          const isTop = cfg.stack.slice(k + 1).every(n => !(p[n.key] > 0));
          s += `<path class="bar" data-i="${i}" d="${isTop ? roundTop(cx - bw / 2, top, bottom, bw) : `M${cx - bw / 2},${bottom} V${top} h${bw} V${bottom}Z`}" fill="${sk.color}"/>`;
          acc += v;
        });
      } else {
        const fill = `url(#${id})`;
        s += `<path class="bar" data-i="${i}" d="${roundTop(cx - bw / 2, y(p.total), T + ih, bw)}" fill="${fill}"/>`;
      }
      if ((pts.length - 1 - i) % every === 0) s += `<text x="${cx}" y="${h - 10}" text-anchor="middle">${p.label.length > 12 ? p.label.slice(0, 11) + '…' : p.label}</text>`;
    });
    if (cfg.average) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(avg)}" y2="${y(avg)}" stroke="#55565e" stroke-dasharray="6 5" stroke-width="1.4" pointer-events="none"/>`;
      s += `<text x="${w - R}" y="${y(avg) - 8}" text-anchor="end" pointer-events="none" style="font-weight:600;fill:#231f20">Average ${F.val(avg)}</text>`;
    }
    // full-height hit areas, so every bar (even a short one) is easy to hover or tap
    pts.forEach((p, i) => { s += `<rect class="hit-col" data-i="${i}" x="${L + step * i}" y="${T}" width="${step}" height="${ih}" fill="transparent"/>`; });
    s += '</svg>';
    el.insertAdjacentHTML('afterbegin', s);

    const svg = el.querySelector('svg');
    const bars = [...svg.querySelectorAll('.bar')];
    if (cfg.animate !== false && !reduced()) bars.forEach(b => {
      b.style.transformOrigin = `0 ${T + ih}px`;
      b.style.transform = 'scaleY(0)';
      b.style.transition = `transform .7s cubic-bezier(.2,.7,.2,1) ${(+b.dataset.i) * 25}ms, opacity .2s`;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(b => (b.style.transform = ''))));
    // make sure bars end fully drawn even if animation frames are paused (background tab)
    setTimeout(() => bars.forEach(b => { b.style.transform = ''; }), 1200);

    const bands = [...svg.querySelectorAll('.band')];
    const ACTIVE = '#c81e1e';
    const restFill = () => `url(#${id})`;
    // highlight one bar: solid brand red + column band + tooltip; the rest dim slightly
    const focus = i => {
      bars.forEach(x => {
        const on = +x.dataset.i === i;
        if (!cfg.stack) x.setAttribute('fill', on ? ACTIVE : restFill());
        x.style.opacity = 1;
        x.style.filter = on && cfg.stack ? 'brightness(.82)' : '';
      });
      bands.forEach(b => b.setAttribute('opacity', +b.dataset.i === i ? 0.08 : 0));
      const p = pts[i], k = el.clientWidth / w;
      const detail = cfg.stack ? cfg.stack.map(sk => `${sk.label}: ${F.val(p[sk.key] || 0)}`).join(' · ') : p.label;
      showTip(tip, (L + step * i + step / 2) * k, y(p.total) * k, detail, F.val(p.total));
    };
    const reset = () => {
      tip.classList.remove('show');
      bars.forEach(x => { if (!cfg.stack) x.setAttribute('fill', restFill(+x.dataset.i)); x.style.opacity = 1; x.style.filter = ''; });
      bands.forEach(b => b.setAttribute('opacity', 0));
    };
    const pick = e => { const c = e.target.closest('.hit-col'); if (c) focus(+c.dataset.i); };
    svg.addEventListener('pointermove', pick);
    svg.addEventListener('pointerdown', pick); // taps on touch screens
    svg.addEventListener('pointerleave', reset);
  }

  /* ---------- Donut ---------- */
  function donut(el, cfg) {
    const F = formats(cfg);
    const base = setup(el, { ...cfg, height: cfg.size }); if (!base) return;
    const { tip } = base;
    const size = cfg.size || 180, stroke = cfg.stroke || 26, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const total = cfg.points.reduce((a, p) => a + p.amount, 0);
    let off = 0;
    let s = `<svg xmlns="${NS}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="width:${size}px"><g transform="rotate(-90 ${size / 2} ${size / 2})">`;
    cfg.points.forEach((p, i) => {
      const len = (p.amount / total) * c;
      const gap = cfg.points.length > 1 ? 2 : 0;
      s += `<circle class="slice" data-i="${i}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${cfg.colors[i % cfg.colors.length]}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap)} ${c - len + gap}" stroke-dashoffset="${-off}"/>`;
      off += len;
    });
    s += `</g><text x="50%" y="48%" text-anchor="middle" style="font-family:Poppins;font-weight:700;font-size:21px;fill:#231f20">${cfg.center || ''}</text><text x="50%" y="62%" text-anchor="middle">${cfg.sub || ''}</text></svg>`;
    el.insertAdjacentHTML('afterbegin', s);
    el.style.width = size + 'px';
    const svg = el.querySelector('svg');
    const slices = [...svg.querySelectorAll('.slice')];
    // intro: the slices draw themselves one after another, sweeping round the circle
    if (cfg.animate !== false && !reduced()) {
      const SWEEP = 1000;   // ms for the whole circle
      let at = 0;
      slices.forEach(sl => {
        const final = sl.getAttribute('stroke-dasharray'), len = parseFloat(final), ms = Math.max(30, (len / c) * SWEEP);
        sl.style.strokeDasharray = `0 ${c}`;
        sl.getBoundingClientRect();
        sl.style.transition = `stroke-dasharray ${ms}ms linear ${at}ms`;
        sl.style.strokeDasharray = final;
        at += (len / c) * SWEEP;
      });
      setTimeout(() => slices.forEach(sl => { sl.style.strokeDasharray = ''; sl.style.transition = ''; }), SWEEP + 150);
    }
    svg.addEventListener('pointermove', e => {
      const sl = e.target.closest('.slice');
      if (!sl) { tip.classList.remove('show'); slices.forEach(x => { x.style.opacity = 1; x.setAttribute('stroke-width', stroke); }); return; }
      const i = +sl.dataset.i, p = cfg.points[i];
      slices.forEach(x => { x.style.opacity = x === sl ? 1 : 0.4; x.setAttribute('stroke-width', x === sl ? stroke + 4 : stroke); });
      const r2 = el.getBoundingClientRect();
      showTip(tip, e.clientX - r2.left, e.clientY - r2.top, `${p.label} · ${((p.amount / total) * 100).toFixed(1)}%`, F.val(p.amount));
    });
    svg.addEventListener('pointerleave', () => { tip.classList.remove('show'); slices.forEach(x => { x.style.opacity = 1; x.setAttribute('stroke-width', stroke); }); });
  }

  return { line, multi, bar, donut };
})();
