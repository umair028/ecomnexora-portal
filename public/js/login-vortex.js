// Sign-in page "vortex" (views/pages/login-vortex.ejs): a slowly turning vortex of glowing screens
// (mini dashboards, charts and store pages) inside a dome of screens, a lone figure standing in its
// light, everything mirrored in a dark reflective floor.
import * as THREE from 'three';

// ===== Adjust these =====
const CONFIG = {
  ringSpinSeconds: 140,   // one full turn of the vortex ring
  domeSpinSeconds: 420,   // one full turn of the surrounding dome (opposite direction)
  coreColor: 0xff3b30,    // glow in the middle of the vortex
  brightness: 0.9,        // overall screen brightness
  reflection: 0.42,       // strength of the floor reflection
  parallax: 0.7,          // how far the view drifts with the pointer (desktop)
  focusX: 0.5,            // where the vortex centre sits across the screen (0.5 = middle, between headline and form)
  focusY: 0.42,           // ...and down the screen on desktop
  focusYCompact: 0.34,    // ...and on phones / tablets
};
// ========================

const canvas = document.querySelector('.lv-canvas');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const compact = innerWidth < 768;
const FLOOR = -2;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  renderer = null; // no WebGL: the CSS gradient on .lv stays as the background
}
if (renderer) init();

function init() {
  renderer.setClearColor(0x030203, 1);
  renderer.autoClear = false;
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const world = new THREE.Scene();
  world.fog = new THREE.FogExp2(0x030203, 0.017);
  const floorScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);
  const camBase = new THREE.Vector3(0, 0, 0);
  const lookAt = new THREE.Vector3(0, 2.2, -30);

  // everything in the world is cut at the floor; the mirrored pass keeps only what is below it
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR);
  const shared = { uTime: { value: 0 }, uDim: { value: 1 } };

  // ---------- screen atlas: 16 little "screens" drawn on one canvas (4 x 4, 16:10 each) ----------
  const CW = 256, CH = 160;
  const atlas = document.createElement('canvas');
  atlas.width = CW * 4; atlas.height = CH * 4;
  const g = atlas.getContext('2d');
  const R = (a, b) => a + Math.random() * (b - a);
  const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const text = (s, x, y, size, c, weight = 700) => { g.font = `${weight} ${size}px Poppins, Arial, sans-serif`; g.fillStyle = c; g.fillText(s, x, y); };
  const W = CW, H = CH;
  const screens = [
    () => { rect(0, 0, W, H, lin(0, 0, 0, H, [[0, '#1b0d12'], [1, '#09070a']])); for (let i = 0; i < 9; i++) { const h = R(30, 110); rect(22 + i * 24, H - 20 - h, 14, h, i % 3 ? '#ff3131' : '#ff8a4c'); } rect(16, H - 20, W - 32, 2, '#3a2a2e'); },
    () => { rect(0, 0, W, H, '#0e1118'); g.strokeStyle = 'rgba(138,163,189,.15)'; for (let y = 30; y < H; y += 28) { g.beginPath(); g.moveTo(14, y); g.lineTo(W - 14, y); g.stroke(); } const pts = Array.from({ length: 9 }, (_, i) => [16 + i * 28, R(40, 120)]); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineTo(W - 16, H - 14); g.lineTo(16, H - 14); g.closePath(); g.fillStyle = 'rgba(255,122,61,.25)'; g.fill(); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = '#ff7a3d'; g.lineWidth = 3; g.stroke(); },
    () => { rect(0, 0, W, H, '#140b0d'); [['$24.8k', '#ffe3c4'], ['1,204', '#ff6a5a'], ['+18%', '#ffb347']].forEach(([s, c], i) => { rect(14, 14 + i * 46, W - 28, 38, '#22151a'); text(s, 24, 42 + i * 46, 22, c); rect(W - 70, 28 + i * 46, 44, 8, '#3a262c'); }); },
    () => { rect(0, 0, W, H, '#f1ebe4'); rect(0, 0, W, 26, '#ff3131'); ['#ff7a3d', '#5b7088', '#ff3131', '#ffb347', '#2a1220', '#ff8a4c'].forEach((c, i) => { const x = 14 + (i % 3) * 80, y = 36 + Math.floor(i / 3) * 62; rect(x, y, 70, 38, c); rect(x, y + 43, 50, 5, '#b9aea4'); rect(x, y + 51, 34, 5, '#d4cbc2'); }); },
    () => { rect(0, 0, W, H, lin(0, 0, 0, H, [[0, '#2a1640'], [0.55, '#ff6a3d'], [1, '#ffcf8a']])); g.fillStyle = '#ffe9c9'; g.beginPath(); g.arc(W * 0.62, H * 0.58, 22, 0, 7); g.fill(); g.fillStyle = '#1a0c14'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, 110); g.lineTo(70, 92); g.lineTo(130, 118); g.lineTo(200, 96); g.lineTo(W, 112); g.lineTo(W, H); g.fill(); },
    () => { rect(0, 0, W, H, '#0b121b'); for (let x = 12; x < W; x += 9) for (let y = 14; y < H; y += 9) { const d = Math.hypot((x - 120) / 110, (y - 80) / 60); if (d < 1 && Math.random() < 0.7 - d * 0.3) rect(x, y, 3, 3, Math.random() < 0.08 ? '#ff3131' : 'rgba(138,163,189,.55)'); } },
    () => { rect(0, 0, W, H, '#15100f'); for (let i = 0; i < 7; i++) { const y = 14 + i * 20; rect(12, y, W - 24, 16, i % 2 ? '#1d1617' : '#241b1c'); rect(20, y + 5, 60, 6, '#6e5f5c'); rect(100, y + 5, 40, 6, '#4d413f'); rect(W - 60, y + 3, 40, 10, ['#ff3131', '#ffb347', '#5b7088'][i % 3]); } },
    () => { rect(0, 0, W, H, '#100a0c'); let a = -Math.PI / 2; [[0.42, '#ff3131'], [0.25, '#ff7a3d'], [0.18, '#ffb347'], [0.15, '#5b7088']].forEach(([p, c]) => { g.beginPath(); g.arc(80, 80, 52, a, a + p * Math.PI * 2); g.strokeStyle = c; g.lineWidth = 20; g.stroke(); a += p * Math.PI * 2; }); text('72%', 60, 88, 20, '#ffe3c4'); for (let i = 0; i < 4; i++) { rect(160, 40 + i * 22, 70, 8, '#3a2a2e'); } },
    () => { rect(0, 0, W, H, lin(0, 0, 0, H, [[0, '#0a0d18'], [0.7, '#3a0f14'], [1, '#ff5a36']])); for (let i = 0; i < 14; i++) { const w = R(12, 22), h = R(30, 100), x = i * 19; rect(x, H - h, w, h, '#07060a'); for (let j = 0; j < 8; j++) if (Math.random() < 0.4) rect(x + 3 + (j % 2) * 7, H - h + 6 + Math.floor(j / 2) * 10, 3, 4, '#ffb347'); } },
    () => { rect(0, 0, W, H, '#fff7ef'); rect(12, 12, W - 24, 64, lin(0, 0, W, 0, [[0, '#ff3131'], [1, '#ff8a4c']])); text('SALE', 24, 56, 28, '#fff'); for (let i = 0; i < 3; i++) { rect(12 + i * 80, 88, 70, 44, '#efe3d6'); rect(12 + i * 80, 138, 44, 6, '#c8b9aa'); } },
    () => { rect(0, 0, W, H, lin(0, 0, 0, H, [[0, '#8aa3bd'], [1, '#121a26']])); g.fillStyle = '#26354a'; g.beginPath(); g.moveTo(0, H); g.lineTo(60, 70); g.lineTo(110, 120); g.lineTo(170, 50); g.lineTo(W, 130); g.lineTo(W, H); g.fill(); g.fillStyle = '#e8eef5'; g.beginPath(); g.moveTo(160, 62); g.lineTo(170, 50); g.lineTo(182, 64); g.fill(); },
    () => { rect(0, 0, W, H, '#ebe7e3'); rect(0, 0, 46, H, '#141213'); for (let i = 0; i < 5; i++) rect(12, 16 + i * 18, 22, 6, i ? '#3b3638' : '#ff3131'); for (let i = 0; i < 3; i++) rect(56 + i * 64, 14, 56, 34, '#fff'); g.beginPath(); for (let i = 0; i < 8; i++) g.lineTo(60 + i * 26, R(80, 140)); g.strokeStyle = '#ff3131'; g.lineWidth = 3; g.stroke(); },
    () => { rect(0, 0, W, H, '#1b0d10'); [['rgba(255,49,49,.85)', 60], ['rgba(255,138,76,.8)', 95]].forEach(([c, base]) => { g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 32) g.lineTo(x, base + R(-25, 25)); g.lineTo(W, H); g.fillStyle = c; g.fill(); }); },
    () => { rect(0, 0, W, H, '#f4ece6'); rect(0, 0, W, 24, '#231f20'); for (let i = 0; i < 28; i++) { const x = 10 + (i % 7) * 34, y = 32 + Math.floor(i / 7) * 31; rect(x, y, 30, 27, Math.random() < 0.18 ? '#ff3131' : '#ffffff'); } },
    () => { rect(0, 0, W, H, '#070506'); const rg = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, 90); rg.addColorStop(0, '#ffd2b0'); rg.addColorStop(0.3, '#ff3131'); rg.addColorStop(1, 'rgba(255,49,49,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,227,196,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, 54, 0, 7); g.stroke(); },
    () => { rect(0, 0, W, H, lin(0, 0, W, H, [[0, '#ff7a3d'], [1, '#ffe3c4']])); g.strokeStyle = 'rgba(42,18,32,.35)'; g.lineWidth = 2; for (let k = 0; k < 6; k++) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 30 + k * 20 + Math.sin(x / 26 + k) * 8); g.stroke(); } },
  ];
  screens.forEach((draw, i) => {
    g.save();
    g.translate((i % 4) * CW, Math.floor(i / 4) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    draw();
    // screen glass: soft top highlight, dark bezel
    rect(0, 0, CW, CH, lin(0, 0, 0, CH, [[0, 'rgba(255,255,255,.08)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.2)']]));
    g.strokeStyle = '#060405'; g.lineWidth = 12; g.strokeRect(0, 0, CW, CH);
    g.restore();
  });
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---------- screens as one instanced mesh per group ----------
  const tileGeo = new THREE.PlaneGeometry(1.6, 1);
  const tint = [new THREE.Color(1, 1, 1), new THREE.Color(1, 0.86, 0.8), new THREE.Color(1, 0.75, 0.66), new THREE.Color(0.86, 0.9, 1)];
  const makeTiles = (items, brightMin, brightMax) => {
    const mat = new THREE.MeshBasicMaterial({ map: atlasTex, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [clip] });
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;\nattribute float aBright;\nattribute float aPhase;\nuniform float uTime;\nvarying float vBright;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = (uv + vec2(mod(aCell, 4.0), 3.0 - floor(aCell / 4.0))) / 4.0;
          vBright = aBright * (0.78 + 0.22 * sin(uTime * (0.4 + aPhase) + aPhase * 40.0));`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDim;\nvarying float vBright;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb *= vBright * uDim * (gl_FrontFacing ? 1.0 : 0.12);`);
    };
    // per-screen data (which picture, how bright, flicker phase) lives on this group's own geometry
    const geo = tileGeo.clone();
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const cell = new Float32Array(items.length), bright = new Float32Array(items.length), phase = new Float32Array(items.length);
    items.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint[Math.floor(Math.random() * tint.length)]);
      cell[i] = Math.floor(Math.random() * screens.length);
      bright[i] = R(brightMin, brightMax) * CONFIG.brightness * (Math.random() < 0.08 ? 1.5 : 1);
      phase[i] = Math.random();
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
    geo.setAttribute('aBright', new THREE.InstancedBufferAttribute(bright, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.frustumCulled = false; // instances surround the camera; the base quad's bounds don't cover them
    return mesh;
  };
  const dummy = new THREE.Object3D();
  const place = (pos, target, up, scale) => {
    dummy.position.copy(pos);
    dummy.up.copy(up);
    dummy.lookAt(target);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  const density = compact ? 0.6 : 1;

  // dome of screens around the viewer, facing inwards
  const dome = new THREE.Group();
  dome.position.set(0, 6, -22);
  {
    const items = [], RAD = 54, step = 1.18 / density;
    const up = new THREE.Vector3(0, 1, 0), centre = new THREE.Vector3();
    for (let lat = -0.2; lat < 1.32; lat += step / RAD) {
      const rr = RAD * Math.cos(lat), y = RAD * Math.sin(lat);
      const n = Math.floor((Math.PI * 2 * rr) / (1.95 / density));
      const shift = Math.random();
      for (let j = 0; j < n; j++) {
        if (Math.random() < 0.14) continue;
        const az = ((j + shift + R(-0.15, 0.15)) / n) * Math.PI * 2;
        const r = rr + R(-0.4, 0.4);
        const p = new THREE.Vector3(r * Math.sin(az), y + R(-0.15, 0.15), -r * Math.cos(az));
        items.push(place(p, centre.set(0, y * 0.4, 0), up, Math.random() < 0.06 ? R(1.6, 2.2) : R(0.75, 1.15)));
      }
    }
    dome.add(makeTiles(items, 0.3, 0.75));
  }
  world.add(dome);

  // the vortex ring: a torus of screens facing outwards, tilted so we look up into it
  const ringTilt = new THREE.Group();
  ringTilt.position.set(0, 4.6, -40);
  ringTilt.rotation.x = -0.3;
  const ringSpin = new THREE.Group();
  ringTilt.add(ringSpin);
  {
    const items = [], RM = 14.5, rm = 3.3;
    const vSteps = Math.floor((Math.PI * 2 * rm) / (0.8 / density));
    for (let a = 0; a < vSteps; a++) {
      const v = (a / vSteps) * Math.PI * 2;
      const n = Math.floor((Math.PI * 2 * (RM + rm * Math.cos(v))) / (1.25 / density));
      const shift = Math.random();
      for (let b = 0; b < n; b++) {
        if (Math.random() < 0.1) continue;
        const u = ((b + shift) / n) * Math.PI * 2;
        const normal = new THREE.Vector3(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
        const p = new THREE.Vector3((RM + rm * Math.cos(v)) * Math.cos(u), rm * Math.sin(v), (RM + rm * Math.cos(v)) * Math.sin(u));
        p.addScaledVector(normal, R(-0.12, 0.12));
        const tangent = new THREE.Vector3(-Math.sin(v) * Math.cos(u), Math.cos(v), -Math.sin(v) * Math.sin(u));
        items.push(place(p, p.clone().add(normal), tangent, R(0.6, 0.8)));
      }
    }
    ringSpin.add(makeTiles(items, 0.55, 1.05));
  }
  world.add(ringTilt);

  // ---------- light: glow in the ring, a soft shaft down to the floor ----------
  const radial = (stops, size = 256) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const rg = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => rg.addColorStop(o, col));
    x.fillStyle = rg;
    x.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const softTex = radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
  const glowMat = (color, opacity) => new THREE.SpriteMaterial({
    map: softTex, color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, clippingPlanes: [clip],
  });
  const core = new THREE.Sprite(glowMat(CONFIG.coreColor, 0.75));
  core.scale.set(30, 20, 1);
  core.position.set(0, 4.6, -41);
  const hot = new THREE.Sprite(glowMat(0xffc9a8, 0.55));
  hot.scale.set(8, 6, 1);
  hot.position.copy(core.position);
  world.add(core, hot);

  const shaftCanvas = document.createElement('canvas');
  shaftCanvas.width = 64; shaftCanvas.height = 256;
  {
    const x = shaftCanvas.getContext('2d');
    const v = x.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,.9)'); v.addColorStop(0.7, 'rgba(255,255,255,.35)'); v.addColorStop(1, 'rgba(255,255,255,.05)');
    x.fillStyle = v; x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = 'destination-in';
    const hgrad = x.createLinearGradient(0, 0, 64, 0);
    hgrad.addColorStop(0, 'rgba(0,0,0,0)'); hgrad.addColorStop(0.5, 'rgba(0,0,0,1)'); hgrad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = hgrad; x.fillRect(0, 0, 64, 256);
  }
  const shaftTex = new THREE.CanvasTexture(shaftCanvas);
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), new THREE.MeshBasicMaterial({
    map: shaftTex, color: 0xff5a3c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, clippingPlanes: [clip],
  }));
  shaft.position.set(0, FLOOR + 4, -36);
  world.add(shaft);

  // ---------- the lone figure, seen from behind, rim-lit by the vortex ----------
  const fig = document.createElement('canvas');
  fig.width = 128; fig.height = 256;
  {
    const x = fig.getContext('2d');
    const body = () => {
      x.beginPath();
      x.arc(64, 30, 15, 0, 7);                                  // head
      x.moveTo(40, 58); x.quadraticCurveTo(64, 46, 88, 58);     // shoulders
      x.lineTo(94, 150); x.lineTo(84, 154); x.lineTo(82, 246); x.lineTo(68, 246); x.lineTo(65, 160);
      x.lineTo(63, 160); x.lineTo(60, 246); x.lineTo(46, 246); x.lineTo(44, 154); x.lineTo(34, 150); x.closePath();
      x.fill();
    };
    x.shadowColor = 'rgba(255,110,80,.95)';
    x.shadowBlur = 10;
    x.fillStyle = '#050304';
    body();
    x.shadowBlur = 0;
    body();
  }
  const figTex = new THREE.CanvasTexture(fig);
  figTex.colorSpace = THREE.SRGBColorSpace;
  const figure = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), new THREE.MeshBasicMaterial({
    map: figTex, transparent: true, depthWrite: false, fog: false, toneMapped: false, clippingPlanes: [clip],
  }));
  figure.position.set(0, FLOOR + 0.95, -17);
  world.add(figure);

  // ---------- floor: dark and glossy, lets a dimmed mirror image through ----------
  const floorAlpha = radial([[0, '#7a7a7a'], [0.45, '#b4b4b4'], [1, '#e0e0e0']], 256);
  floorAlpha.colorSpace = THREE.NoColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({
    color: 0x040304, transparent: true, alphaMap: floorAlpha, depthWrite: false,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR, -30);
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), new THREE.MeshBasicMaterial({
    map: softTex, color: CONFIG.coreColor, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, FLOOR + 0.01, -32);
  floorScene.add(floor, floorGlow);

  // ---------- layout: vortex centre (and the figure under it) in the middle of the screen ----------
  const focus = new THREE.Vector3();
  const layout = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 68 : 56;
    camera.clearViewOffset();
    camera.position.copy(camBase);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // shift the view so the ring centre lands at (focusX, focusY) of the screen
    focus.copy(ringTilt.position).project(camera);
    const px = (focus.x + 1) / 2, py = (1 - focus.y) / 2;
    const fy = w >= 1024 ? CONFIG.focusY : CONFIG.focusYCompact;
    camera.setViewOffset(w, h, (px - CONFIG.focusX) * w, (py - fy) * h, w, h);
  };

  // pointer drift, eased
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (finePointer && !still) addEventListener('pointermove', e => {
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  const t0 = performance.now();
  const frame = now => {
    const t = still ? 20 : (now - t0) / 1000 + 20;
    shared.uTime.value = t;
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    pointer.y += (pointer.ty - pointer.y) * 0.03;
    ringSpin.rotation.y = -(t / CONFIG.ringSpinSeconds) * Math.PI * 2;
    dome.rotation.y = (t / CONFIG.domeSpinSeconds) * Math.PI * 2;
    camera.position.set(
      camBase.x + Math.sin(t * 0.05) * 0.5 + pointer.x * CONFIG.parallax,
      camBase.y + Math.sin(t * 0.07) * 0.15 - pointer.y * CONFIG.parallax * 0.4,
      camBase.z + Math.sin(t * 0.04) * 1.2,
    );
    camera.lookAt(lookAt);
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.6);
    core.material.opacity = 0.75 * pulse;
    floorGlow.material.opacity = 0.4 * pulse;

    renderer.clear();
    // 1) mirror image below the floor
    world.scale.y = -1;
    world.position.y = 2 * FLOOR;
    clip.set(new THREE.Vector3(0, -1, 0), FLOOR);
    shared.uDim.value = CONFIG.reflection;
    renderer.render(world, camera);
    // 2) the glossy floor over it
    renderer.render(floorScene, camera);
    // 3) the scene itself
    world.scale.y = 1;
    world.position.y = 0;
    clip.set(new THREE.Vector3(0, 1, 0), -FLOOR);
    shared.uDim.value = 1;
    renderer.render(world, camera);
  };

  let raf = 0, shown = false;
  const loop = now => {
    frame(now);
    if (!shown) { shown = true; canvas.classList.add('on'); }
    raf = still ? 0 : requestAnimationFrame(loop);
  };
  const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  const onResize = () => { layout(); if (still) requestAnimationFrame(loop); };
  addEventListener('resize', onResize);

  layout();
  start();
}
