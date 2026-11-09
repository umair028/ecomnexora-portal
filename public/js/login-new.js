// Shared by the two scenes below, so the astronaut stands in the same water that fills the page: one clock,
// the footstep ripples (written by the astronaut, read by the water) and the GLSL that models the waves.
const LN = {
  t0: performance.now() - 6000,   // start a few seconds in, so the first frame already looks settled
  MAX_RIPPLES: 8,
  ripples: [],                    // { X, Y (page px), size (page px per ripple unit), born (ms), seed }
  walk: null,                     // the astronaut's settings (ripple speed, wavelength, …) once he is on the page
};
LN.glsl = `
const float H = 0.30;               // horizon height (0 = bottom, 1 = top)
const float PIX = 1. / 420.;        // the pixel row (in page heights) wave detail is filtered for, the same in both scenes

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = m * p; a *= .5; }
  return v;
}

// the water as a plane seen from just above it: the world point under page point s (x in page heights, y from
// the bottom; x across, y away from us) and how much world distance one pixel row covers there
vec3 plane(vec2 s, float aspect){
  float depth = clamp((H - s.y) / H, 0., 1.);        // 0 at the horizon, 1 at the bottom edge
  float z = 1. / (depth + .045);
  return vec3((s.x - aspect * .5) * z * .9, z * 1.4, 1.4 * z * z / H * PIX);
}
// wave detail of angular frequency f fades out where it would be finer than ~2 pixel rows (it would only
// flicker), so the waves get finer towards the horizon and settle into a calm mirror there
float lod(float f, float fp){ return 1. - smoothstep(1.4, 3., f * fp); }

// height of the open water: three low swells with crests running across the view, bent and gathered into
// groups by slow noise (so no crest runs straight across the whole width), and finer ripples stretched
// sideways, all rolling slowly towards us
float swell(vec2 w, float t, float fp){
  float g1 = noise(w * vec2(2.2, .8) + vec2(t * .1, 0.)), g2 = noise(w * vec2(3.4, 1.3) + vec2(-t * .12, 9.));
  return sin(dot(w, vec2(.09, 1.)) * 6. + t * 1.10 + g2 * 3.)         * .040 * (.3 + 1.3 * g1) * lod(6., fp)
       + sin(dot(w, vec2(-.16, 1.)) * 11. + t * 1.55 + 1.7 + g1 * 4.) * .022 * (.2 + 1.5 * g2) * lod(11., fp)
       + sin(dot(w, vec2(.23, 1.)) * 19. + t * 2.10 + 4.2 + g2 * 5.)  * .011 * lod(19., fp)
       + (noise(w * vec2(3.2, 6.) + vec2(-t * .1, t * .8) + 5.) - .5) * .07 * lod(22., fp)
       + (noise(w * vec2(6., 16.) + vec2(t * .15, t * 1.6)) - .5) * .025 * lod(50., fp);
}
// how the waves move the reflection at page point s: where the reflected ray lands instead of the mirror
// point, in page heights (y = up the sky)
vec2 waveTilt(vec2 s, float aspect, float t){
  vec3 P = plane(s, aspect);
  const float e = .02;
  float h0 = swell(P.xy, t, P.z);
  return vec2((swell(P.xy + vec2(e, 0.), t, P.z) - h0) * .012, (swell(P.xy + vec2(0., e), t, P.z) - h0) * .028) / e;
}`;

// Footstep ripples (the astronaut's scene): from the sole outwards, a damped wavelet that spreads, widens and dies
// out, flattened by our low view over the water. It is never a clean ring: its radius wanders and its crest breaks
// into uneven arcs, and the wavelets of successive steps overlap. p and the ripple centres are in video px; uRipPx
// is one pixel in that unit: crests too fine for the pixels are drawn wider and fainter instead of flickering.
// Height and slope come out of one pass (the slope of the crest itself), so the shader stays small: a big shader
// takes long to compile on some GPUs, and a long stall can make the browser reset the GPU and switch WebGL off.
LN.ripplesGlsl = `
uniform vec4 uRipA[${LN.MAX_RIPPLES}];   // x, y, age (s), strength
uniform vec4 uRipB[${LN.MAX_RIPPLES}];   // size scale, seed, fade time, speed
uniform float uSquash, uLambda, uRipPx;
// x = height of all ripples at p, yz = its slope (per video px), w = a soft light flash where a boot has just touched
vec4 water(vec2 p){
  vec4 o = vec4(0.);
  for (int i = 0; i < ${LN.MAX_RIPPLES}; i++) {
    vec4 a = uRipA[i];
    if (a.w <= 0.) continue;
    vec4 b = uRipB[i];
    float age = a.z, S = b.x, seed = b.y, life = b.z;
    vec2 d = (p - a.xy) / S;
    d.y *= uSquash;                                  // on the water the wave runs out evenly; from our low view, flat
    float len = length(d), R = b.w * age;            // how far the front has spread
    o.w += a.w * exp(-age / .14) * exp(-len * len / 40.);
    if (abs(len - R) > uLambda * 6. + 10. * (1. + age)) continue;   // the wave hasn't reached here / has passed
    vec2 dir = d / max(len, 1e-3);
    float r = len + (noise(dir * 1.6 + seed) - .5) * 7. * (1. + age);   // the front wanders
    float lam = uLambda * (1. + age * .35);          // rings widen and soften a little as they spread
    float lamPx = lam * S / mix(1., uSquash, abs(dir.y));   // crest spacing here, in video px
    float aa = min(1., lamPx / (3. * uRipPx));
    lam /= aa;
    float w = lam * 1.25;
    float env = exp(-pow((r - R + .4 * w) / w, 2.)); // one leading crest with a weaker one or two behind it
    float fade = exp(-age * .6) * (1. - smoothstep(life * .45, life, age)) / (1. + R / 220.);
    float arcs = smoothstep(.2, .75, noise(dir * 2.4 + vec2(seed * 3.1, age * .4)));   // the crest breaks into uneven arcs
    float amp = a.w * fade * (.25 + .75 * arcs) * aa * env, ph = 6.2832 * (r - R) / lam;
    o.x += amp * sin(ph);
    o.yz += amp * cos(ph) * 6.2832 / lam * dir * vec2(1., uSquash) / S;
  }
  return o;
}`;

// Sign-in page (new): aurora ribbons sweeping in from the top-right over a starry sky, mirrored in shallow
// water below the horizon that rolls with low swells and fine ripples, catches the warm horizon glow in
// broken streaks. One fragment shader, rendered at a reduced resolution (the scene is soft, so the upscale is
// invisible), paused when hidden, and rebuilt if the browser resets the GPU.
(() => {
  const canvas = document.querySelector('.ln-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return; // the CSS gradient on .ln stays as the background

  const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const frag = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
${LN.glsl}

// s: x in units of screen height (0..aspect), y 0..1 from the bottom. detail 0 (for reflections, which the
// waves blur anyway) skips the fine filaments and the stars, at about half the cost.
vec3 sky(vec2 s, float aspect, float t, float detail){
  s += uMouse * vec2(.025, .015);   // slight parallax with the pointer
  vec3 col = mix(vec3(.035, .022, .026), vec3(.008, .006, .008), smoothstep(H, 1., s.y));

  // aurora ribbons: run from the top-right corner down towards the horizon left of centre
  vec2 a = vec2(aspect * .96, 1.14), b = vec2(aspect * .46, H + .04);
  vec2 dir = normalize(b - a), nrm = vec2(-dir.y, dir.x);
  vec2 d = s - a;
  float len = length(b - a);
  float along = dot(d, dir), across = dot(d, nrm), k = along / len;
  float spread = mix(.62, .12, clamp(k, 0., 1.));
  float fade = smoothstep(-.02, .3, k) * (1. - smoothstep(.78, 1.08, k));

  vec3 aur = vec3(0.);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float off = (fi / 4. - .5) * spread
              + (fbm(vec2(along * 1.1 + fi * 7.3, t * .045 + fi * 1.9)) - .5) * .55 * (.35 + k)
              + .07 * sin(along * 2.2 + t * .22 + fi * 1.3);
    float x = across - off;
    float w = mix(.11, .035, clamp(k, 0., 1.)) * (.75 + .12 * fi);
    float band = exp(-x * x / (w * w));
    float haze = exp(-x * x / (w * w * 9.)) * .22;
    // fine filaments running along the ribbon, drifting slowly downstream
    float fil = detail > .5 ? smoothstep(.28, .82, fbm(vec2(x * 26. + fi * 5., along * 1.6 - t * .18))) : .5;
    vec3 c = i == 0 ? vec3(.55, .03, .05)      // deep crimson
           : i == 1 ? vec3(1., .16, .16)       // brand red  #ff3131
           : i == 2 ? vec3(1., .85, .74)       // warm white core
           : i == 3 ? vec3(1., .45, .2)        // ember orange
           :          vec3(.42, .5, .66);      // a cool steel thread for depth
    float gain = i == 2 ? .7 : i == 4 ? .45 : 1.;
    aur += c * gain * (band * (.25 + 1.1 * fil) + haze);
  }
  col += aur * fade * .62;

  // warm glow where the light meets the horizon
  float hx = (s.x - aspect * .58) / (aspect * .48);
  col += vec3(1., .42, .32) * exp(-abs(s.y - H) * 10.) * exp(-hx * hx) * .32;
  col += vec3(1., .19, .19) * exp(-abs(s.y - H) * 34.) * exp(-hx * hx * 2.) * .18;

  // stars, hidden where the aurora is bright
  vec2 g = s * 140.;
  vec2 cell = floor(g), f = fract(g) - .5;
  float h = hash(cell);
  if (detail > .5 && h > .982 && s.y > H + .02) {
    vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) - .5;
    float tw = .55 + .45 * sin(t * (1. + h * 3.) + h * 40.);
    float star = smoothstep(.22, 0., length(f - o * .5)) * tw;
    col += vec3(1., .93, .9) * star * (1. - clamp(length(aur) * 1.6, 0., 1.)) * .9;
  }
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 s = vec2(uv.x * aspect, uv.y);
  float t = uTime;
  vec3 col;

  if (s.y >= H) {
    col = sky(s, aspect, t, 1.);
  } else {
    float depth = (H - s.y) / H;                    // 0 at the horizon, 1 at the bottom edge
    // the waves move the reflection: sideways a little, along the view a lot (long, broken streaks)
    vec2 tilt = waveTilt(s, aspect, t);
    // (rough water also smears a reflection along the view: the sample sits a little up the sky)
    vec2 rs = vec2(s.x + tilt.x, 2. * H - s.y + tilt.y + .003 + .015 * depth);
    rs.y = max(rs.y, H + .002);
    vec3 refl = sky(rs, aspect, t, 0.);
    float fres = mix(.92, .45, pow(depth, .75));    // the near water reflects less and looks darker
    col = refl * fres + vec3(.010, .007, .008);

    // the warm horizon glow caught by the wave faces tilted towards it: a broad glitter path,
    // broken into streaks, widening as it comes closer
    float gx = (s.x - aspect * .58) / (aspect * (.2 + .38 * depth));
    float facing = exp(-pow((tilt.y + .006 + depth * .02) / (.009 + .014 * depth), 2.));
    col += vec3(1., .42, .28) * facing * exp(-gx * gx) * (.2 - .07 * depth) * smoothstep(0., .06, depth);
    col *= 1. - depth * .16;
  }

  // gentle filmic curve + vignette
  col = 1. - exp(-col * 1.35);
  vec2 q = uv - .5;
  col *= 1. - dot(q, q) * .55;
  gl_FragColor = vec4(pow(col, vec3(.95)), 1.);
}`;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  // compile the shader and set up the one triangle that covers the screen (again after a GPU reset)
  const U = {};
  const setup = () => {
    const vs = shader(gl.VERTEX_SHADER, vert), fs = shader(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uTime', 'uMouse'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    gl.viewport(0, 0, canvas.width, canvas.height);
    return true;
  };
  if (!setup()) return;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scale = Math.min(window.devicePixelRatio || 1, 2) * (innerWidth < 768 ? .5 : .62);
  const MAX_PIXELS = 1.1e6; // keeps big / high-DPI screens at roughly the cost of a 1440×860 one
  const resize = () => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const s = Math.min(scale, Math.sqrt(MAX_PIXELS / Math.max(1, cw * ch)));
    const w = Math.max(1, Math.round(cw * s));
    const h = Math.max(1, Math.round(ch * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };

  // pointer parallax, eased
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    mouse.tx = e.clientX / innerWidth - .5;
    mouse.ty = .5 - e.clientY / innerHeight;
  }, { passive: true });

  let raf = 0, last = 0, slow = 0, frames = 0, lost = false;
  const draw = now => {
    resize();
    mouse.x += (mouse.tx - mouse.x) * .04;
    mouse.y += (mouse.ty - mouse.y) * .04;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, (now - LN.t0) / 1000);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!frames++) canvas.classList.add('on');

    // on slow GPUs drop the render resolution a step (once or twice)
    // (gaps over 200ms are the browser throttling the tab, not the GPU struggling)
    const dt = now - last;
    if (last && dt < 200) slow = dt > 28 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && scale > .25) { scale *= .75; slow = 0; }
    last = now;
    if (!still) raf = requestAnimationFrame(draw);
  };
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(draw); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : !still && !lost && start()));
  addEventListener('resize', () => still && !lost && requestAnimationFrame(draw));
  // the browser can reset the GPU (driver hiccup, another tab, sleep): wait for it, then rebuild and carry on
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; if (setup()) (still ? requestAnimationFrame(draw) : start()); });
  start();
})();

// The astronaut carrying a parcel, walking on calm, shallow water (wide screens only, so phones never
// download the video). He walks towards us and grows to his final size; from then on he keeps walking
// in place: one stride of the video loops endlessly while his approach is cancelled out frame by frame,
// so his boots slide gently back and the water drifts away under him, as if the surface carries him.
// One WebGL canvas removes the green from the video and draws him; under him it models the water, where
// every footstep starts a damped wave that spreads, softens and dies out (the water behind carries the same
// waves), throws up a few small droplets, and bends his reflection. His reflection also moves with the
// open water's swells, and his soles sink a little under its surface.
// Two copies of the video take turns at the end of each stride, so the loop never stalls on a seek.
// With "reduce motion" or without WebGL: his cut-out last frame (astronaut-last.png), still.
(() => {
  // ===== Adjust these =====
  const WALK = {
    // --- position and size on the page ---
    horizon: 0.70,         // the page's water line, as a share of the page height (H = .30 in the shader above)
    height: 0.58,          // video frame height as a share of the page height (he is shrunk further if needed to fit the gap)
    centerX: 0.5,          // where he walks, as a share of the page width (0.5 = the middle of the screen)
    margin: 24,            // px kept clear between him and the headline / the login card (he is shrunk if needed)
    nudgeX: 0,             // px to move him right (+) or left (−) from centerX
    // --- measured from astronaut.mp4 (1280×720, 10s); x, y are fractions of the video frame ---
    duration: 10,                                        // length of the video
    startFeet: 0.676,                                    // his boots at the first frame: placed on the water line
    // the water line under him: the bottom of his lowest boot, every 0.1s from 0 to 10s
    ground: [.676, .676, .685, .685, .685, .685, .685, .685, .69, .699, .704, .707, .713, .713, .713, .713, .713, .713, .726, .732,
      .74, .749, .751, .751, .751, .751, .751, .751, .751, .76, .774, .782, .799, .799, .799, .801, .804, .821, .826, .84, .84, .838,
      .838, .835, .832, .835, .832, .843, .854, .857, .865, .871, .871, .865, .863, .86, .857, .857, .863, .868, .879, .882, .89,
      .899, .896, .893, .89, .887, .882, .882, .885, .896, .904, .907, .915, .921, .915, .912, .907, .904, .899, .893, .899, .907,
      .912, .918, .929, .935, .929, .924, .918, .912, .91, .915, .915, .935, .935, .938, .951, .946, .943],
    endFeet: 0.95,                                       // his lowest boot at the last frame
    // top of his helmet, and the middle of his body, every 0.1s (used to cancel out his approach)
    top: [.3417, .3444, .3417, .3389, .3333, .3278, .325, .3222, .3222, .325, .3278, .3278, .3278, .3222, .3139, .3056, .3028, .3028, .3028, .3056,
      .3083, .3056, .3, .2917, .2806, .2694, .2611, .2556, .25, .2472, .2528, .2583, .2667, .2722, .2667, .2583, .2528, .2528, .2556, .2556,
      .25, .2444, .2361, .2306, .225, .2222, .2222, .2222, .2278, .2306, .2333, .2306, .2278, .2222, .2139, .2083, .2056, .2028, .2028, .2028,
      .2056, .2083, .2111, .2111, .2056, .1972, .1944, .1889, .1861, .1833, .1833, .1861, .1889, .1944, .1972, .1944, .1889, .1861, .1778, .175,
      .1694, .1694, .1694, .1722, .175, .1806, .1806, .1806, .1722, .1694, .1611, .1556, .1528, .1528, .1528, .1583, .1611, .1667, .1667, .1611, .1556],
    cx: [.4947, .494, .493, .4921, .4916, .4914, .4914, .4916, .492, .4926, .4934, .4944, .4953, .4963, .4966, .4968, .4967, .4967, .4963, .4957,
      .4943, .4933, .4926, .4918, .4914, .4915, .4917, .4919, .4923, .493, .494, .4948, .4958, .4968, .497, .4969, .4967, .4961, .4946, .4931,
      .4917, .4911, .4906, .4904, .4903, .4906, .4908, .4913, .4921, .4929, .4947, .4958, .4969, .4979, .4985, .4988, .4988, .4988, .4985, .4983,
      .4975, .4967, .4954, .4933, .4924, .4913, .4909, .4908, .4908, .4912, .4917, .4924, .4932, .4945, .4961, .4986, .4997, .5008, .502, .5025,
      .5027, .5026, .5023, .5015, .5008, .4992, .4973, .4954, .4937, .4927, .492, .4919, .4922, .4929, .4936, .4953, .4966, .4981, .5016, .5033, .5046],
    end: { left: 0.409, right: 0.583, top: 0.153, x: 0.496 }, // his outline at the last frame
    growth: 2.4,                                         // how much bigger he is at the end than at the start
    // --- his boots, measured from astronaut.mp4 frame by frame (24 fps, 240 frames; video px) ---
    // per frame: the screen-left boot's x, sole y, left edge, right edge, then the same for the screen-right boot
    // (sole y = the lowest point of the boot, x = the middle of that lowest part)
    fps: 24,
    boots: (
      '627,486,613,634,645,473,637,652;625,487,614,633,645,473,637,652;624,488,614,633,645,474,637,652;623,490,614,633,645,474,637,652;622,492,613,633,645,474,637,653;622,492,613,633,645,473,637,653;623,492,613,633,645,473,637,653;623,492,613,633,645,473,638,653;622,492,612,633,646,471,638,654;623,492,612,633,647,471,638,654;623,492,612,633,649,473,638,655;622,493,612,633,649,476,638,656;' +
      '622,493,611,633,651,480,638,657;622,493,611,633,651,483,638,658;623,492,611,633,652,487,637,659;623,492,611,633,653,490,637,659;622,493,612,633,652,492,639,661;622,493,612,634,651,493,639,661;622,493,613,634,651,494,639,662;622,493,613,634,650,496,639,663;622,493,613,633,647,500,638,663;622,493,613,633,646,503,638,662;622,493,613,633,645,505,638,661;622,493,612,633,644,507,637,659;' +
      '622,494,612,633,645,507,636,658;622,494,612,633,646,507,636,657;622,494,612,633,647,509,636,657;621,494,612,633,648,512,636,657;621,494,613,632,647,512,636,657;620,494,613,631,647,512,636,657;621,492,612,631,647,512,636,657;620,490,611,630,647,512,636,657;618,491,608,630,647,512,636,657;617,493,607,630,647,512,636,658;614,497,606,631,647,512,636,658;613,501,604,631,647,512,636,658;' +
      '613,506,602,628,647,512,636,658;612,509,602,629,647,512,636,658;611,512,600,629,648,513,636,658;612,513,600,629,647,513,636,658;614,513,599,629,647,513,636,658;615,516,598,629,648,513,636,657;618,519,598,629,648,513,636,658;619,522,598,629,648,513,636,658;619,524,599,629,648,514,636,658;620,527,601,629,648,514,636,658;620,528,602,630,648,514,635,658;619,530,603,630,648,514,635,658;' +
      '616,533,603,630,648,514,635,658;615,537,602,630,648,514,635,658;614,539,602,630,648,514,636,658;614,539,602,630,648,514,636,658;614,540,602,630,648,515,637,657;614,540,602,630,648,514,637,657;614,540,602,630,649,511,637,658;614,540,602,630,651,510,638,659;614,540,602,630,652,511,639,661;614,540,602,630,653,512,638,662;614,540,602,630,655,516,638,664;614,540,602,630,655,520,635,665;' +
      '614,540,602,629,656,525,635,666;614,540,602,630,658,529,637,667;614,541,602,630,659,533,638,669;614,541,602,629,660,536,638,671;614,541,602,630,662,538,640,672;614,541,602,630,660,537,642,674;614,541,602,630,659,537,642,675;614,541,602,630,657,541,643,677;614,541,602,630,656,544,642,676;614,541,602,630,655,547,642,676;614,541,602,630,654,550,642,676;614,541,602,630,653,553,642,675;' +
      '614,541,602,630,653,556,641,673;614,541,602,630,653,559,640,672;614,541,602,631,655,561,638,670;614,541,601,630,655,572,639,669;613,542,601,627,656,575,638,669;613,541,601,627,656,575,638,669;613,540,599,626,656,575,638,669;610,544,597,626,656,575,638,669;609,550,595,628,656,574,638,669;607,557,593,629,656,574,638,669;604,565,592,628,656,574,638,669;602,572,590,628,656,574,639,669;' +
      '602,576,589,627,656,573,638,669;603,578,588,627,656,573,638,669;607,580,587,627,656,573,638,669;613,586,587,627,656,572,638,669;614,590,588,628,656,572,638,669;616,593,590,629,655,572,638,669;616,595,592,629,655,571,638,669;611,595,593,631,655,571,638,669;610,600,594,629,656,571,638,669;609,605,594,629,656,570,639,668;609,606,594,629,655,570,639,668;609,606,594,629,656,570,639,668;' +
      '609,605,594,629,656,571,640,669;609,604,594,629,655,569,640,669;609,604,594,629,656,566,641,669;609,603,594,629,658,566,641,670;609,602,594,629,659,567,641,672;609,602,594,629,661,571,640,673;609,601,594,630,661,575,638,673;609,601,594,630,662,580,635,674;609,600,594,630,663,585,637,675;609,599,594,629,664,590,638,677;609,599,594,629,665,595,638,678;609,598,594,630,667,598,638,679;' +
      '610,597,594,630,668,600,640,682;610,596,594,630,667,600,642,683;610,596,595,630,664,599,642,685;610,595,595,630,662,603,643,687;610,595,595,630,660,607,643,688;610,594,595,630,660,609,643,688;610,594,595,630,659,612,643,688;610,593,595,630,658,614,642,687;611,592,595,630,658,616,641,686;610,592,595,630,658,617,641,684;610,591,595,630,658,617,640,682;611,590,595,630,662,618,640,680;' +
      '610,590,595,630,663,623,642,680;610,589,595,630,663,627,642,679;610,589,595,630,663,627,642,679;610,588,595,629,663,626,642,679;609,588,595,629,662,626,642,679;610,587,595,627,662,625,642,679;610,587,595,626,662,624,641,679;610,584,594,625,662,623,641,679;607,582,592,625,662,622,641,678;605,583,590,625,662,621,641,678;604,586,589,627,662,620,641,678;603,590,588,629,662,619,641,678;' +
      '603,595,587,631,662,618,641,678;601,602,586,631,661,618,641,678;600,607,586,631,662,617,641,678;599,612,585,631,662,615,642,678;598,617,583,630,662,615,640,677;599,619,582,629,662,614,640,677;598,621,580,629,661,613,640,677;599,621,579,628,661,612,640,677;605,622,578,628,661,612,640,677;611,625,578,629,661,611,640,677;613,628,580,629,661,610,640,677;613,631,581,629,661,609,640,677;' +
      '615,633,584,629,661,608,640,676;616,634,585,632,661,607,640,676;616,635,587,633,661,607,640,676;609,636,587,633,661,606,640,676;606,641,588,631,661,605,640,675;606,646,588,631,660,604,640,675;605,648,588,631,660,604,640,675;605,647,588,631,660,603,641,675;605,646,588,631,660,602,642,675;605,645,588,631,660,602,642,674;606,644,588,631,660,601,642,675;606,643,588,631,661,599,643,675;' +
      '606,642,588,631,663,597,644,677;606,641,588,631,664,598,645,679;606,640,588,631,666,600,645,680;606,639,588,631,667,604,644,681;606,638,589,631,667,609,642,683;606,636,589,631,669,615,641,684;606,636,589,631,671,621,641,686;606,635,589,631,672,627,642,688;607,633,590,632,674,631,644,690;607,632,590,631,676,635,646,692;607,631,590,632,677,637,646,694;607,630,590,631,677,638,648,696;' +
      '607,629,590,632,675,637,649,697;608,628,590,632,672,639,648,699;608,627,590,632,669,644,649,700;608,626,590,632,669,648,648,701;608,625,591,632,669,651,648,700;608,624,591,632,667,652,648,699;608,623,591,632,666,652,646,697;608,622,591,632,667,652,645,694;608,621,591,632,672,654,647,693;608,620,591,631,673,659,648,693;608,619,591,631,673,663,648,692;608,618,591,631,674,663,649,692;' +
      '608,617,592,631,673,662,649,692;608,616,592,631,673,660,649,691;608,615,591,630,672,659,648,691;608,615,591,628,672,658,648,691;608,614,591,627,672,656,648,691;607,611,590,627,672,655,648,690;606,609,589,626,671,654,648,690;604,610,587,626,671,652,648,690;603,613,586,628,671,651,648,690;603,617,586,631,671,650,648,689;602,623,585,633,671,648,648,689;601,629,584,634,671,647,648,689;' +
      '600,634,583,634,671,646,648,689;599,639,582,633,670,644,648,688;597,643,580,633,670,643,647,688;596,646,577,630,670,642,647,688;595,647,575,629,670,641,647,687;600,645,573,629,670,639,647,687;603,648,571,629,669,638,646,687;610,652,570,628,669,637,646,687;610,655,571,630,669,636,646,687;611,657,574,630,669,635,646,686;613,659,576,630,669,633,646,686;613,659,580,632,669,632,646,686;' +
      '610,660,582,633,668,631,646,685;606,662,583,632,669,629,646,685;603,668,583,630,668,628,646,685;603,673,583,630,668,627,646,685;603,672,583,630,668,626,646,684;603,671,583,630,668,625,645,684;603,669,583,631,668,623,646,684;604,667,584,631,668,623,647,684;604,666,584,631,668,621,648,683;604,665,584,631,668,617,648,685;605,663,584,631,670,615,648,686;604,662,585,631,671,616,648,687;' +
      '604,661,585,631,672,620,647,688;605,659,585,631,673,626,644,689;605,658,586,631,675,632,641,690;605,656,585,631,677,639,642,692;605,655,586,632,679,647,643,694;605,653,586,631,681,652,645,697;604,652,586,631,683,657,648,700;605,650,586,632,685,659,650,703;606,649,587,632,685,659,652,705;606,648,587,632,681,658,653,708;606,647,587,632,673,664,653,710;606,645,588,632,675,669,654,710;' +
      '606,644,588,632,675,672,653,710;606,643,588,631,674,673,652,709;606,641,588,632,673,672,651,707;606,640,588,632,676,672,650,704;606,638,588,632,680,674,651,703;606,637,588,631,681,682,653,702;606,636,588,631,681,686,654,702;606,634,588,631,682,685,654,702;606,634,589,631,681,683,653,701;606,633,589,630,681,681,653,701;606,632,588,628,681,679,653,700;607,630,588,628,680,678,652,700'
    ),
    // the frames each boot stands on the water: from the frame its sole touches down (the first frame at its
    // planted height) to the last frame before it lifts (found where the sole stops / starts moving). Ripples start
    // on the touch-down frame, at that sole; while a boot stands, the water stays put under it.
    stance: {
      left: [[3, 31], [49, 77], [93, 126], [149, 183], [207, 239]],
      right: [[0, 8], [22, 52], [76, 96], [121, 156], [178, 211], [228, 239]],
    },
    // --- walking in place ---
    approach: 12,          // seconds he takes to come from the water line to his final size (higher = slower)
    loopStart: 5.12,       // video time where the looping stride starts (right boot down)
    stride: 2.38,          // one full stride (right boot down → left → right again); this part of the video loops

    // --- ripples (sizes in video px at the start of the walk; they grow with him) ---
    strength: 1,           // overall ripple strength (0 = none, 2 = double)
    speed: 50,             // how fast a ring spreads, px per second
    wavelength: 15,        // distance between the crest and trough bands; rings widen as they age
    fade: 2.8,             // seconds until a ring has fully faded (so only the last step or two show rings)
    squash: 5.5,           // rings are this many times wider than tall (low view over the water)
    light: 0.14,           // how much light the wave crests catch (the water behind also bends the sky's reflection with them)
    dark: 0.16,            // how much the troughs darken the water
    tint: [1, 0.86, 0.76], // colour of that light (r, g, b 0–1): near neutral, a trace of aurora warmth
    refract: 7,            // how strongly the ripples bend (slice) his reflection
    contactDark: 0.25,     // the dark patch right under each planted boot
    splash: 1,             // the few droplets thrown up as a boot lands (0 = none)
    sink: 2.2,             // video px of a planted sole hidden under the water's surface (0 = he stands on top of it)
    // --- reflection ---
    reflection: 0.62,      // reflection opacity (0–1)
    reflectionLength: 0.95,// how far down it reaches, as a share of his height
    waves: 1,              // how much the open water's swells bend and break up his reflection (0 = not at all)
    wobble: 0.5,           // an extra slow sway of the reflection, in px
    wobbleSpeed: 1,        // 1 = calm and slow
    blur: 0.9,             // reflection softness, in screen px (it is also smeared along the view, more further down)
    // --- soft glow on the water under him ---
    glow: [1, 0.25, 0.18], // colour (r, g, b 0–1)
    glowStrength: 0.03,
    // --- green removal ---
    key: [0.06, 0.26],     // how much greener than red/blue a pixel must be to start / finish turning transparent
    edgeChoke: 1.5,        // video px the cut-out edge is pulled in, dropping the pixels mixed with green (0 = off)
    despill: 1,            // 0–1: how firmly any green cast on him is removed (1 = pulled to the average of red and blue)
    edgeGlow: 0.6,         // 0–1: warm aurora light on his outline, hiding what is left of the edge
    edgeGlowColor: [1, 0.52, 0.4], // colour of that light (r, g, b 0–1)
    sharpen: 1,            // 0–2: crisper detail on him (the video is soft); his outline is left alone (0 = off)
    // --- the shipping label on his parcel, printed with the Ecom Nexora logo ---
    labelLogo: true,       // false = the parcel keeps its original label
    labelGrow: 0.12,       // the printed label is drawn this much larger than the original, so it always covers it
    // where the label is (video px: left, top, right, bottom) in each of the video's 240 frames (24 per second),
    // tracked from the video, so the printed label moves exactly with the parcel
    labelFps: 24,
    label: [
    [636.7,344.1,645.9,353.3], [637.7,343.7,646,353.7], [636.4,342.2,646.4,354.3], [635.1,337.6,646.9,354.9], [635,330.4,647,354.9], [634.9,325.9,647.8,354.3], [634.8,324.6,649.7,353.7], [634.7,323.4,651,352.7],
    [634.7,322,651.7,351.2], [634.9,320.5,652.4,350], [635.3,319.1,653,349], [635.7,318,653.7,348], [636.1,317.1,654.3,347.3], [636.5,316.5,655,347], [637.1,316.1,655.7,347], [637.8,316.1,656.2,347],
    [638.4,316.3,657,347.3], [639.1,316.8,657.9,348], [639.8,317.3,658.5,348.7], [640.3,318.1,659.2,349.5], [640.9,319.2,660,350.7], [641.5,320.3,660.8,352], [642.1,321.3,661.4,353], [642.7,322.2,662.1,354],
    [643.3,323.1,662.9,355.1], [643.9,323.9,663.5,356.1], [644.2,324.2,663.9,356.8], [644.3,324,664.2,357], [644.3,323.3,664.5,356.7], [644.2,322,664.7,355.7], [643.9,320.4,664.4,354.2], [643.5,318.7,663.8,352.6],
    [642.9,316.9,663.2,351.1], [642,315.2,662.6,349.7], [641,313.9,662,348.5], [640.1,312.8,661.2,347.7], [639.5,312.2,660.3,347.2], [638.9,312.1,659.7,346.9], [638.1,312.2,659.2,347], [637.5,312.5,658.7,347.5],
    [637.1,313.1,658.3,348.4], [636.8,314,658,349.7], [636.2,315,657.5,350.8], [635.7,316,657,352.1], [635,317,656.5,353.7], [634.3,318,655.9,354.9], [633.8,318.8,655.4,356], [633.1,319.3,655,357],
    [632.5,319.8,654.7,357.8], [632.2,320,654.6,358.1], [632.1,319.8,654.7,358.1], [632.1,319,655,357.8], [632.2,317.7,655.2,356.7], [632.3,315.7,655.6,354.9], [632.4,313.1,656.2,352.7], [632.9,310.5,656.8,350.4],
    [633.5,307.9,657.6,348.1], [634.3,305.1,658.8,345.7], [635.2,302.5,660,343.3], [636.2,300.1,661,341.1], [637.2,298,662,339.3], [638.2,296.2,663,337.8], [639.2,294.7,664.1,336.2], [640.2,293.2,665.2,335.3],
    [641.1,292,666.3,334.8], [642,291.3,667.4,334.3], [643,291.1,668.2,334.1], [643.8,291.4,669,334.4], [644.5,292,670,335.1], [645.2,293,671.1,336.3], [646,294.1,672.2,337.9], [646.8,295.4,673.1,339.7],
    [647.4,297,673.9,341.8], [647.9,298.9,674.7,344.2], [648.3,301.3,675.4,347], [648.4,304.1,675.8,350], [648,306.8,675.7,353.1], [647.2,309.5,675,356], [646,311.8,673.8,358.6], [644.5,313.2,672.3,360.4],
    [642.7,313.6,670.6,361], [640.9,313.3,668.7,360.8], [639.1,312.3,667.1,360], [637.4,311.2,665.8,359.2], [636.1,310.1,664.8,358.6], [635,309.1,663.9,357.9], [634.1,308.4,663,357.3], [633.4,308.3,662.3,357.3],
    [632.9,308.7,662,358.2], [632.6,309.6,661.8,359.5], [632.3,310.8,661.8,360.9], [632.2,311.8,661.7,362.1], [632.2,312.3,662,363], [632.4,312.4,662.5,363.3], [632.7,311.7,663,362.9], [633.1,310.2,663.5,361.7],
    [633.7,308.2,664.1,360], [634.3,306.1,664.9,358], [634.9,303.9,665.8,356], [635.7,301.9,666.7,354.1], [636.7,300,667.8,352.5], [637.8,298.3,668.9,351], [638.8,297,669.9,349.8], [639.9,296.2,671,349.2],
    [641,295.8,672.2,348.9], [642,295.6,673.5,348.9], [643,295.7,674.7,349], [644.1,295.9,675.9,349.2], [645.2,296.2,677,349.6], [646.2,296.7,678,350.2], [647.1,297.2,679,351], [647.9,298,679.9,352],
    [648.5,299,680.8,353], [649.1,300,681.5,354.4], [649.6,301.2,682.1,355.9], [650.3,302.7,682.6,357.4], [650.9,304,683.2,358.8], [651.2,305.2,683.9,360.1], [651.6,306.3,684.5,361.4], [652.2,307.2,685.1,362.6],
    [652.5,307.9,685.7,363.6], [652.7,308.3,686.3,364.2], [653,308.2,686.6,364.3], [653.2,307.5,686.8,363.8], [653.3,306.2,687,362.5], [653.3,304.3,687.1,361], [653.1,302.2,686.9,359.1], [652.5,300.1,686.4,357.2],
    [651.6,298.2,685.5,355.5], [650.4,296.5,684.3,353.9], [649.1,295.1,683,352.3], [647.8,293.9,681.7,351], [646.3,292.8,680.2,350], [645,291.9,679,349.2], [643.7,291.1,677.9,348.6], [642.6,290.6,676.9,348.4],
    [641.8,290.6,676.1,348.6], [640.9,291.1,675.3,349.1], [640.1,291.8,674.7,349.9], [639.3,292.4,673.9,350.8], [638.5,293.2,673.2,351.9], [637.8,294.4,672.5,353], [636.9,295.8,671.7,354.3], [636.2,297,670.8,355.8],
    [635.4,298,670,357.1], [634.6,299.2,669.2,358.5], [633.8,300.4,668.5,359.8], [633.2,301.5,668,361], [632.8,302.4,667.8,362.1], [632.7,303.1,667.8,363], [632.8,303.4,667.9,363.5], [632.8,303,667.9,363.4],
    [632.6,302,668.1,362.4], [632.5,300.2,668.3,360.9], [632.6,297.9,668.6,358.9], [632.9,295.5,669.1,356.7], [633.4,293.2,669.8,354.7], [634.2,291.2,670.5,352.8], [635.1,289.5,671.3,351.2], [636,288.1,672.2,350],
    [636.9,287.3,673.2,349.2], [637.8,286.9,674.1,348.7], [638.7,286.6,675.1,348.4], [639.8,286.6,676.1,348.5], [640.8,286.9,677.2,348.9], [641.5,287.3,678.2,349.3], [642.3,288,679.1,350.1], [643.2,289,680.1,351.1],
    [644.1,290,681.1,352.1], [644.9,291.1,682.1,353.3], [645.6,292.4,683,354.8], [646.4,293.7,683.8,356.1], [647.2,294.8,684.5,357.2], [647.9,295.9,685.2,358.6], [648.6,297,685.9,359.9], [649.2,297.9,686.6,361.1],
    [649.9,298.6,687.4,362.1], [650.4,299.5,688,363], [650.7,300.1,688.5,363.7], [651.1,300.1,689.1,363.7], [651.6,299.3,689.5,363.2], [652,297.8,690,361.9], [652.4,295.5,690.4,360.1], [652.5,293,690.6,357.8],
    [652.5,290.6,690.8,355.4], [652.4,288.5,690.8,353.3], [651.9,286.6,690.4,351.6], [651.2,285.1,689.6,350.2], [650.4,284,688.6,349], [649.3,283,687.6,348], [648.3,282.3,686.6,347.3], [647.5,282,685.8,347],
    [646.8,281.9,684.9,347], [646.1,282,684.2,347], [645.4,282.3,683.5,347.3], [644.9,283,683,348], [644.3,283.8,682.4,348.9], [643.7,284.7,681.8,349.9], [642.9,285.8,681.1,350.9], [642,286.9,680.2,351.9],
    [641.1,288,679.4,353.1], [640.2,289.1,678.7,354.5], [639.3,290.4,677.9,356], [638.5,291.8,677.1,357.5], [637.8,292.9,676.4,358.9], [637.3,293.8,676.1,359.9], [637,294.4,676.2,360.7], [637.1,294.6,676.6,361],
    [637.5,294.1,677,360.7], [637.9,292.7,677.4,359.7], [638.1,290.7,677.8,357.7], [638.2,288.2,678,355.2], [638.5,285.3,678.3,352.5], [639.1,282.5,678.8,350], [639.9,280.4,679.7,348], [640.9,279,680.8,346.4],
    [642,277.9,682,345.3], [643.2,276.9,683.3,344.6], [644.4,276.1,684.8,344.1], [645.8,275.6,686,344], [647,275.6,687.1,344], [648,276.1,688.3,344.4], [649.1,276.9,689.5,345], [650.2,277.8,690.7,346],
    [651.3,278.9,691.8,347.1], [652.4,280.1,693,348.4], [653.4,281.5,694,349.9], [654.4,282.9,695,351.3], [655.4,284.2,695.9,352.8], [656.3,285.5,696.7,354.4], [657.1,286.7,697.6,355.8], [657.8,287.9,698.5,357.2],
    [658.5,288.8,699.5,358.4], [659.2,289.4,700.3,359.3], [659.9,289.7,700.8,359.6], [660.4,289.2,701.5,359.3], [660.8,287.8,702.5,358.2], [661.2,285.4,703.3,355.9], [661.4,282.6,703.5,353.2], [661.3,280.5,703.5,351.2]],
    fadeIn: 0.7,           // seconds he fades in at the start
    resolution: 2,         // highest pixel density the canvas is drawn at on high-DPI screens (lower = lighter, softer)
  };
  // ========================

  const video = document.querySelector('.ln-walk-video');
  const canvas = document.querySelector('.ln-walk-canvas');
  const scene = document.querySelector('.ln');
  if (!video || !canvas || !scene) return;
  const wide = matchMedia('(min-width: 1024px)');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FW = 1280, FH = 720, MAX_RIPPLES = LN.MAX_RIPPLES;

  // ---------- WebGL ----------
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  let prog = null, setup = null;
  const U = {};
  if (gl) {
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uOff;             // where the video frame's corner sits on the canvas (canvas px)
uniform float uS;              // canvas px per video px (changes every frame: he walks in, then walks in place)
uniform vec2 uRes, uKey;
uniform float uChoke, uSpill, uWrap;   // edge clean-up (see cut)
uniform float uSharp;
uniform vec3 uWrapColor;
uniform sampler2D uLabelTex;    // the printed label design (white paper, logo)
uniform vec4 uLabel;            // where the parcel's label is: left, top, right, bottom (video px)
uniform float uLabelOn;
uniform float uTime, uWobble, uReflLen, uRefl, uBlur, uLight, uDark, uRefract, uContactDark, uScale, uGround, uSink, uSplash, uWaves;
uniform vec3 uTint, uGlowColor;
uniform vec4 uGlow;            // x, y, width, strength
uniform vec2 uPage;            // the scene's size in page px
uniform float uPageX, uDpr, uWT; // the canvas's left edge on the page (px), canvas px per page px, the water's clock
uniform float uFigX;           // the middle of him in the video frame (video px)
uniform vec4 uBootL, uBootR;   // his boots in this frame (measured): left edge, right edge, water level under it, standing (0/1)
uniform vec4 uDrop;            // the newest touch-down, for its droplets: x, y (video px), age (s), size scale (0 = none)
uniform float uDropSeed;
const vec2 F = vec2(1280., 720.);
${LN.glsl}
${LN.ripplesGlsl}

// premultiplied colour at a point of the frame, with the green removed and despilled
// how solid the frame is at uv (green = see-through)
float keyA(vec2 uv){
  vec4 t = texture2D(uTex, uv);
  return (1. - smoothstep(uKey.x, uKey.y, t.g - max(t.r, t.b))) * t.a;
}
// premultiplied colour at a point of the frame, cut out of the green screen without a green rim:
// the edge is pulled in a little (choke) to drop the pixels mixed with green, any green cast left is
// pulled down to the average of red and blue (despill), and what remains of the edge takes on a soft
// warm glow from the aurora behind him (light wrap). sharp > 0 crisps his detail (unsharp mask), only
// well inside his outline so no green from the backdrop is pulled in
vec4 cut(vec2 p, float sharp){
  vec2 uv = p / F;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  vec4 t = texture2D(uTex, uv);
  float a0 = keyA(uv);
  if (a0 <= 0.) return vec4(0.);
  vec2 o = vec2(uChoke) / F;
  float an = min(min(keyA(uv + vec2(o.x, 0.)), keyA(uv - vec2(o.x, 0.))), min(keyA(uv + vec2(0., o.y)), keyA(uv - vec2(0., o.y))));
  float a = min(a0, an);
  if (sharp > 0. && an > .99) {
    vec2 px = max(1., 1. / uS) / F;                  // one screen pixel (or one video pixel, if he is drawn larger)
    vec3 nb = (texture2D(uTex, uv + vec2(px.x, 0.)).rgb + texture2D(uTex, uv - vec2(px.x, 0.)).rgb
             + texture2D(uTex, uv + vec2(0., px.y)).rgb + texture2D(uTex, uv - vec2(0., px.y)).rgb) * .25;
    t.rgb = clamp(t.rgb + (t.rgb - nb) * sharp, 0., 1.);
  }
  vec3 c = vec3(t.r, min(t.g, mix(max(t.r, t.b), (t.r + t.b) * .5, uSpill)), t.b);
  // the parcel's label: blank paper in the label's own light, printed with the logo (multiplied, so it
  // takes the lighting and shading of the paper)
  if (uLabelOn > 0.) {
    vec2 lu = (p - uLabel.xy) / (uLabel.zw - uLabel.xy);
    if (lu.x > 0. && lu.x < 1. && lu.y > 0. && lu.y < 1.) {
      vec3 s1 = texture2D(uTex, mix(uLabel.xy, uLabel.zw, vec2(.2, .1)) / F).rgb, s2 = texture2D(uTex, mix(uLabel.xy, uLabel.zw, vec2(.8, .1)) / F).rgb;
      vec3 s3 = texture2D(uTex, mix(uLabel.xy, uLabel.zw, vec2(.2, .9)) / F).rgb, s4 = texture2D(uTex, mix(uLabel.xy, uLabel.zw, vec2(.8, .9)) / F).rgb;
      vec3 avg = (s1 + s2 + s3 + s4) * .25;
      float lmax = max(max(dot(s1, vec3(.3, .59, .11)), dot(s2, vec3(.3, .59, .11))), max(dot(s3, vec3(.3, .59, .11)), dot(s4, vec3(.3, .59, .11))));
      vec3 paper = avg * (lmax / max(dot(avg, vec3(.3, .59, .11)), .001));     // its brightest paper tone, no print
      vec3 printed = paper * texture2D(uLabelTex, lu).rgb;
      float inside = smoothstep(0., .035, min(min(lu.x, 1. - lu.x), min(lu.y, 1. - lu.y)));
      c = mix(c, printed, inside);
    }
  }
  float edge = clamp(1. - an, 0., 1.);
  float lum = dot(c, vec3(.3, .59, .11));
  c = mix(c, uWrapColor * (lum * .8 + .15), edge * uWrap);
  return vec4(c * a, a);
}
// the same cut-out for his reflection, simply keyed and despilled: the reflection is blurred, bent and darkened,
// so the edge clean-up and the printed label would not show there (and this keeps the shader small)
vec4 cutSoft(vec2 p){
  vec2 uv = p / F;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  vec4 t = texture2D(uTex, uv);
  float a = (1. - smoothstep(uKey.x, uKey.y, t.g - max(t.r, t.b))) * t.a;
  return vec4(vec3(t.r, min(t.g, mix(max(t.r, t.b), (t.r + t.b) * .5, uSpill)), t.b) * a, a);
}

// how much column x belongs to boot b (1 across the boot, fading out just beyond its edges)
float over(vec4 b, float x){ return 1. - smoothstep(0., 7. * uScale, max(b.x - x, x - b.y)); }
// a standing boot keeps the water right around it faintly stirring (no new rings while it stands)
float stir(vec4 b, vec2 p){
  if (b.w <= 0.) return 0.;
  vec2 q = (p - vec2((b.x + b.y) * .5, b.z)) / uScale;
  q.y *= uSquash;
  return b.w * .3 * exp(-dot(q, q) / 900.) * (noise(q * .12 + vec2(uTime * .6, -uTime * .9)) - .5);
}
// a few small droplets thrown up as a boot lands: they rise, fall back and are gone within half a second
// (only the newest touch-down can still be splashing: steps are over a second apart)
float splash(vec2 p){
  vec4 a = uDrop;
  if (a.w <= 0. || a.z > .5) return 0.;
  float S = a.w, age = a.z, l = 0.;
  vec2 d0 = p - a.xy;
  if (dot(d0, d0) > 900. * S * S) return 0.;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float r1 = fract(sin(uDropSeed * 12.9898 + fk * 78.233) * 43758.5453), r2 = fract(sin(uDropSeed * 39.346 + fk * 11.135) * 24634.6345);
    vec2 v = vec2((r1 - .5) * 70., -(40. + 45. * r2)) * S;        // video px per second, out and up
    vec2 pos = a.xy + vec2(0., -1.5 * S) + v * age + vec2(0., 380. * S) * age * age;
    if (pos.y > a.y) continue;                                     // already fell back in
    float sz = (.8 + .6 * r2) * S;
    l += exp(-dot(p - pos, p - pos) / (sz * sz)) * (1. - smoothstep(.12, .45, age)) * (.5 + .5 * r1);
  }
  return min(1., l);
}

void main(){
  vec2 q = gl_FragCoord.xy / uRes;
  vec2 p = (vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) - uOff) / uS;
  vec4 fig = cut(p, uSharp);

  vec4 col = vec4(0.);
  if (p.y < uGround - 60. * uScale) { gl_FragColor = fig; return; }   // well above the water: just him

  // the water surface in this column, from the measured boots: right at the sole of a standing boot (so the
  // boot meets its reflection), on the water plane under a lifted one (so it hangs above its reflection), and
  // between the two elsewhere (his legs and body mirror in the water between his boots)
  bool near = abs(p.x - uFigX) < 160.;   // only columns near him hold his reflection (the rest of the band: open water)
  float wl = over(uBootL, p.x), wr = over(uBootR, p.x);
  float between = mix(uBootL.z, uBootR.z, smoothstep(uBootL.y, uBootR.x, p.x));
  float axis = (wl * uBootL.z + wr * uBootR.z + .001 * between) / (wl + wr + .001);
  float touching = clamp(wl * uBootL.w + wr * uBootR.w, 0., 1.);    // a standing boot is in this column
  float under = clamp(step(uBootL.x, p.x) * step(p.x, uBootL.y) * uBootL.w + step(uBootR.x, p.x) * step(p.x, uBootR.y) * uBootR.w, 0., 1.);

  // shallow water over the soles: the lowest bit of a standing boot sinks under the gently moving surface,
  // with a faint bright line where the water meets it, so he stands in the water rather than on a floor
  float lip = axis - (uSink + .45 * sin(p.x * .35 / uScale + uTime * 2.3) + .3 * sin(p.x * .9 / uScale - uTime * 3.1)) * uScale * touching;
  float sunk = smoothstep(lip - .9 * uScale, lip + .9 * uScale, p.y) * touching;
  fig *= 1. - sunk * .85;

  {
    // ripple height (plus the stirring around a standing boot) and slope, the slope per ripple unit so the look
    // doesn't depend on how big he is on screen
    vec4 w0 = water(p);
    w0.x += stir(uBootL, p) + stir(uBootR, p);
    float hx = w0.y * uScale, hy = w0.z * uScale;
    float d = p.y - lip;                             // below the water's surface here
    if (d > 0. && near) {
      // the open water's swells at this point (the same as in the water behind), in video px
      vec2 pg = vec2(uPageX + gl_FragCoord.x / uDpr, (uRes.y - gl_FragCoord.y) / uDpr);
      vec2 sp = vec2(pg.x, uPage.y - pg.y) / uPage.y;
      vec2 tilt = sp.y < H ? waveTilt(sp, uPage.x / uPage.y, uWT) * uWaves : vec2(0.);
      vec2 amb = tilt * uPage.y * uDpr / uS;
      // his reflection, flipped at the water line, joined to his boots and moving with the water further
      // down: bent by the swells and the ripples, smeared along the view, broken where a wave faces the light
      float anchor = clamp(d / (14. * uScale), 0., 1.);
      float wob = uWobble * anchor;
      float dx = (sin(p.y * .09 + uTime * .9) + .5 * sin(p.y * .031 - uTime * .6)) * wob + hx * uRefract * uScale + amb.x * anchor;
      float dy = sin(p.y * .06 + uTime * .7) * wob * .4 + hy * uRefract * uScale * .5 - amb.y * anchor;
      vec2 m = vec2(p.x + dx, lip - d + dy);
      vec2 bx = vec2(uBlur, 0.), by = vec2(0., uBlur * 1.5 + d * .03);
      vec4 r = cutSoft(m) * .3 + (cutSoft(m + bx) + cutSoft(m - bx)) * .15 + (cutSoft(m + by) + cutSoft(m - by)) * .2;
      float f = 1. - smoothstep(0., uReflLen, d);
      float broken = 1. - .45 * smoothstep(.003, .025, -tilt.y) * anchor;
      col = r * uRefl * pow(f, 1.4) * broken;
      col.rgb *= vec3(.92, .8, .76);
    }
    // the waves themselves: troughs darken a little, crests catch a little light from the sky behind
    // (thin bright crests and dark troughs, the way rings read on calm water, a little shifted by the slope)
    float s = w0.x * 1.6 - hy * .12;
    float dark = smoothstep(0., 1., -s) * uDark;
    float light = smoothstep(0., 1., s) * uLight + w0.w * uLight * 1.2;
    col.rgb *= 1. - dark;
    col.a = dark + col.a * (1. - dark);
    col.rgb += uTint * light;
    // a soft dark patch right where a boot meets the water
    float k = exp(-pow((p.y - lip - 1.2 * uScale) / (2.2 * uScale), 2.)) * touching * uContactDark;
    col.rgb *= 1. - k;
    col.a = k + col.a * (1. - k);
    // faint warm glow on the water under him
    vec2 g = (p - uGlow.xy) / vec2(uGlow.z, uGlow.z / 5.);
    col.rgb += uGlowColor * exp(-dot(g, g) * 2.) * uGlow.w;
  }
  gl_FragColor = fig + col * (1. - fig.a);   // he stands in front of the water
  // the bright line where the water meets a planted boot, and the droplets of a landing step, in front
  float men = exp(-pow((p.y - lip) / (.5 * uScale), 2.)) * under * .08;
  float drops = splash(p) * .6 * uSplash;
  float l = men + drops;
  gl_FragColor = vec4(uTint * l, l) + gl_FragColor * (1. - l);
}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : (console.warn(gl.getShaderInfoLog(s)), null); };
    // compile, the full-screen triangle and the video texture (again after a GPU reset)
    setup = () => {
      prog = null;
      const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) return;
      const p = gl.createProgram();
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return;
      prog = p;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uTex', 'uOff', 'uS', 'uRes', 'uKey', 'uTime', 'uWobble', 'uReflLen', 'uRefl', 'uBlur', 'uLight', 'uDark', 'uRefract', 'uSquash',
        'uLambda', 'uContactDark', 'uScale', 'uGround', 'uTint', 'uGlowColor', 'uRipA', 'uRipB', 'uGlow', 'uChoke', 'uSpill', 'uWrap', 'uWrapColor', 'uLabelTex', 'uLabel', 'uLabelOn', 'uSharp',
        'uSink', 'uSplash', 'uWaves', 'uPage', 'uPageX', 'uDpr', 'uWT', 'uRipPx', 'uFigX', 'uBootL', 'uBootR', 'uDrop', 'uDropSeed'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    setup();
  }

  // ---------- the printed label: white paper with the Ecom Nexora logo, drawn once ----------
  let labelReady = false, repaint = null;
  const makeLabel = () => {
    if (!prog || !WALK.labelLogo || !video.dataset.logo) return;
    const logo = new Image();
    logo.onload = () => {
      // designed at the label's own proportions (about 3:5)…
      const D = document.createElement('canvas'); D.width = 240; D.height = 400;
      const g = D.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 400);
      const markW = 80, markH = markW * logo.height / 46;          // the red E mark: the first 46px of the logo
      g.drawImage(logo, 6, 0, 46, logo.height, (240 - markW) / 2, 30, markW, markH);
      const wordW = 212, wordH = wordW * logo.height / logo.width;   // the full wordmark across the label
      let y = 30 + markH + 20;
      g.drawImage(logo, (240 - wordW) / 2, y, wordW, wordH);
      y += wordH + 24;
      g.fillStyle = '#8c8c8c';                                       // address lines
      for (const f of [0.78, 0.6, 0.7]) { g.fillRect(20, y, 200 * f, 8); y += 22; }
      g.fillStyle = '#1b1b1b';                                       // barcode
      for (let x = 20; x < 218;) { const w = 2 + ((x * 7) % 5); g.fillRect(x, y + 4, w, 42); x += w + 2 + ((x * 3) % 4); }
      // …then stretched onto a power-of-two texture, so it can be smoothly shrunk (mipmaps) when small
      const P = document.createElement('canvas'); P.width = 256; P.height = 512;
      P.getContext('2d').drawImage(D, 0, 0, 256, 512);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, P);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);                                 // the video stays on unit 0
      labelReady = true;
      if (repaint) repaint();                                        // the still picture (reduce motion) gets it too
    };
    logo.src = video.dataset.logo;
  };

  // ---------- layout: his final size and spot (centred, never touching the headline or the card) ----------
  const L = {}; // s: base screen px per video px, cx: his centre, horizon, Yf: where his boots end up
  const table = (arr, t) => {
    const i = Math.max(0, Math.min(arr.length - 1, t * 10)), a = Math.floor(i), b = Math.min(arr.length - 1, a + 1);
    return arr[a] + (arr[b] - arr[a]) * (i - a);
  };
  const smooth = (arr, t) => { let sum = 0; for (let k = -5; k <= 5; k++) sum += table(arr, Math.max(0, Math.min(WALK.duration, t + k * 0.11))); return sum / 11; };
  const topS = t => smooth(WALK.top, t) * FH, groundS = t => smooth(WALK.ground, t) * FH, cxS = t => smooth(WALK.cx, t) * FW;
  const ease = x => x * x * (3 - 2 * x);
  let canvasLeft = 0, canvasTop = 0, dpr = 1;
  const layout = () => {
    const box = scene.getBoundingClientRect();
    const horizon = box.height * WALK.horizon;
    const startFeet = WALK.startFeet;
    const cx = box.width * WALK.centerX + WALK.nudgeX;
    // what he must not touch: each line of the headline, and the login card (page coordinates)
    const blocks = [];
    const title = document.querySelector('.ln-title'), card = document.querySelector('.ln-card');
    if (title) {
      const range = document.createRange();
      range.selectNodeContents(title);
      for (const r of range.getClientRects()) blocks.push({ l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top });
    }
    if (card) { const r = card.getBoundingClientRect(); blocks.push({ l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top }); }
    // his outline at his final size (the biggest he gets)
    const endBox = k => ({
      l: cx - (WALK.end.x - WALK.end.left) * FW * k, r: cx + (WALK.end.right - WALK.end.x) * FW * k,
      t: horizon - (startFeet - WALK.end.top) * FH * k, b: horizon + (WALK.endFeet - startFeet) * FH * k,
    });
    const hits = k => {
      const e = endBox(k), m = WALK.margin;
      return blocks.some(b => e.l < b.r + m && e.r > b.l - m && e.t < b.b + m && e.b > b.t - m);
    };
    let s = Math.max(0.05, Math.min(
      (WALK.height * box.height) / FH,                                // the size we'd like
      (box.height - 12 - horizon) / ((WALK.endFeet - startFeet) * FH), // feet stay on screen
      (horizon - 100) / ((startFeet - WALK.end.top) * FH),             // helmet stays below the nav
    ));
    while (s > 0.1 && hits(s)) s *= 0.97;                              // shrink until he touches nothing
    Object.assign(L, {
      s, cx, horizon, pageW: box.width, pageH: box.height,
      Yf: horizon + (WALK.endFeet - startFeet) * FH * s,              // his boots, once he walks in place
      frameLeft0: cx - WALK.end.x * FW * s, frameTop0: horizon - startFeet * FH * s, // the frame's spot during the approach
    });
    // the canvas: a band around him, the full height of the scene
    const band = Math.min(box.width, (WALK.end.right - WALK.end.left) * FW * s * 6.5);   // wide enough for his footstep rings
    dpr = Math.min(window.devicePixelRatio || 1, WALK.resolution);
    // whole screen pixels for its position and size, so the browser shows the canvas 1:1 instead of resampling (softening) it
    canvas.width = Math.round(band * dpr);
    canvas.height = Math.round(box.height * dpr);
    canvasLeft = Math.round((cx - band / 2) * dpr) / dpr; canvasTop = 0;
    Object.assign(canvas.style, { left: `${canvasLeft}px`, top: '0px', width: `${canvas.width / dpr}px`, height: `${canvas.height / dpr}px` });
    if (prog) gl.viewport(0, 0, canvas.width, canvas.height);
  };

  // where the video frame sits on the page: S (page px per video px) and its corner. His legs follow the
  // video time tau; how close he is follows `elapsed` (seconds since he appeared), over WALK.approach
  // seconds: he grows from his size in the first frame to his final size, his boots moving down from the
  // water line to L.Yf in step with it (perspective), whatever pace his legs walk at.
  const place = (tau, elapsed) => {
    const size0 = (groundS(0) - topS(0)) * L.s, sizeF = (WALK.endFeet - WALK.end.top) * FH * L.s;
    const e = ease(Math.min(1, Math.max(0, elapsed) / WALK.approach));
    const size = size0 + (sizeF - size0) * e;
    const y = L.horizon + (L.Yf - L.horizon) * e;
    const S = size / (groundS(tau) - topS(tau));
    return { S, ox: L.cx - cxS(tau) * S, oy: y - groundS(tau) * S };
  };
  const growAt = t => 1 + (WALK.growth - 1) * Math.min(1, t / 10);   // his size in the video compared with the start

  // ---------- his boots in each video frame (measured, see WALK.boots / WALK.stance) ----------
  const BOOTS = WALK.boots.split(';').map(r => r.split(',').map(Number));   // [lx, ly, lx0, lx1, rx, ry, rx0, rx1]
  const SIDE = { left: 0, right: 4 };
  const frameAt = tau => Math.max(0, Math.min(BOOTS.length - 1, Math.floor(tau * WALK.fps + 1e-3)));
  // one boot in frame f: x, sole y, edges, whether it stands on the water (and since which frame), and the
  // water level under it: its sole while it stands; while it swings, the water plane under it, running from
  // where it lifted off to where it lands next (so a lifted boot hangs above its reflection, never touches it)
  const boot = (side, f) => {
    const o = SIDE[side], b = BOOTS[f], list = WALK.stance[side];
    const st = list.find(([a, z]) => f >= a && f <= z);
    let water = b[o + 1];
    if (!st) {
      const prev = list.filter(([, z]) => z < f).pop(), next = list.find(([a]) => a > f);
      const y0 = prev && BOOTS[prev[1]][o + 1], y1 = next && BOOTS[next[0]][o + 1];
      water = prev && next ? y0 + (y1 - y0) * (f - prev[1]) / (next[0] - prev[1]) : prev ? y0 : next ? y1 : water;
      water = Math.max(water, b[o + 1]);
    }
    return { side, x: b[o], y: b[o + 1], x0: b[o + 2], x1: b[o + 3], planted: !!st, from: st ? st[0] : -1, water };
  };
  const landings = Object.keys(SIDE).flatMap(side => WALK.stance[side].map(([f]) => ({ side, f }))).filter(l => l.f > 0);

  // ---------- ripples (kept in page coordinates; they move with the water, which stays put under a planted boot) ----------
  const ripples = LN.ripples; // { X, Y, size, born (ms), seed }; the water behind him draws them too
  LN.walk = WALK;
  // a boot touches down: the ripple starts at its sole, in the touch-down frame
  const spawn = (land, P, now) => {
    const b = boot(land.side, land.f);
    ripples.push({ X: P.ox + b.x * P.S, Y: P.oy + b.y * P.S, size: growAt(land.f / WALK.fps) * P.S, born: now, seed: Math.random() * 10 });
    while (ripples.length > MAX_RIPPLES) ripples.shift();
  };
  // the water under a standing boot doesn't move: whatever that boot does on the page (his approach, the camera
  // drifting back, walking in place), the ripples around his boots move with it, so a ripple stays where its
  // boot touched down and never runs ahead of him
  let held = null;   // { key, X, Y }: the boot holding the water, where it was last frame
  const holdWater = (f, P, jump) => {
    const b = ['left', 'right'].map(s => boot(s, f)).filter(x => x.planted).sort((m, n) => m.from - n.from)[0];
    if (!b) { held = null; return; }
    const key = b.side + b.from, X = P.ox + b.x * P.S, Y = P.oy + b.y * P.S;
    if (held && held.key === key && !jump) for (const r of ripples) { r.X += X - held.X; r.Y += Y - held.Y; }
    held = { key, X, Y };
  };

  // ---------- drawing ----------
  const ripA = new Float32Array(MAX_RIPPLES * 4), ripB = new Float32Array(MAX_RIPPLES * 4);
  let uploaded = null;
  const draw = (source, tau, P, now, moving) => {
    if (!prog || !canvas.width) return;
    const key = source === video || source === video2 ? `${source === video}:${tau}` : 'still';   // a new frame → upload it
    if (uploaded !== key) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); uploaded = key; }
    ripA.fill(0); ripB.fill(0);
    for (let i = ripples.length - 1; i >= 0; i--) if ((now - ripples[i].born) / 1000 > WALK.fade) ripples.splice(i, 1);
    ripples.forEach((r, i) => {
      ripA.set([(r.X - P.ox) / P.S, (r.Y - P.oy) / P.S, (now - r.born) / 1000, WALK.strength], i * 4);
      ripB.set([r.size / P.S, r.seed, WALK.fade, WALK.speed], i * 4);
    });
    const drop = ripples[ripples.length - 1];   // the newest touch-down throws the droplets
    gl.uniform4f(U.uDrop, drop ? (drop.X - P.ox) / P.S : 0, drop ? (drop.Y - P.oy) / P.S : 0, drop ? (now - drop.born) / 1000 : 9, drop ? drop.size / P.S : 0);
    gl.uniform1f(U.uDropSeed, drop ? drop.seed : 0);
    // his boots in the frame on screen, and the water level under him (the lower of the two)
    const f = frameAt(tau), bl = boot('left', f), br = boot('right', f);
    const ground = Math.max(bl.water, br.water), g = growAt(tau);
    gl.uniform4f(U.uBootL, bl.x0, bl.x1, bl.water, bl.planted ? 1 : 0);
    gl.uniform4f(U.uBootR, br.x0, br.x1, br.water, br.planted ? 1 : 0);
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uOff, (P.ox - canvasLeft) * dpr, (P.oy - canvasTop) * dpr);
    gl.uniform1f(U.uS, P.S * dpr);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uKey, WALK.key[0], WALK.key[1]);
    gl.uniform1f(U.uChoke, WALK.edgeChoke);
    gl.uniform1f(U.uSpill, WALK.despill);
    gl.uniform1f(U.uWrap, WALK.edgeGlow);
    gl.uniform3fv(U.uWrapColor, WALK.edgeGlowColor);
    gl.uniform1f(U.uSharp, WALK.sharpen);
    gl.uniform1i(U.uLabelTex, 1);
    gl.uniform1f(U.uLabelOn, labelReady ? 1 : 0);
    if (labelReady) {
      // the row of the exact video frame on screen, never blended with its neighbours (blending is what made it trail
      // the parcel). Frame n starts at n/24 s: a frame's own time (requestVideoFrameCallback) is rounded, the playback
      // clock, which runs on inside a frame, is rounded down.
      const exact = source !== video && source !== video2 ? false : exactOf(source), ft = tau * WALK.labelFps;
      const r = WALK.label[Math.max(0, Math.min(WALK.label.length - 1, exact ? Math.round(ft) : Math.floor(ft + 0.02)))];
      const gx = (r[2] - r[0]) * WALK.labelGrow / 2, gy = (r[3] - r[1]) * WALK.labelGrow / 2;
      gl.uniform4f(U.uLabel, r[0] - gx, r[1] - gy, r[2] + gx, r[3] + gy);
    }
    gl.uniform1f(U.uTime, moving ? (now / 1000) * WALK.wobbleSpeed : 0);
    gl.uniform1f(U.uWT, moving ? (now - LN.t0) / 1000 : 6);   // the open water's clock, shared with the water behind
    gl.uniform2f(U.uPage, L.pageW, L.pageH);
    gl.uniform1f(U.uPageX, canvasLeft);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uRipPx, 1 / (P.S * dpr));                    // one canvas pixel, in video px
    gl.uniform1f(U.uSink, WALK.sink);
    gl.uniform1f(U.uSplash, WALK.splash);
    gl.uniform1f(U.uWaves, WALK.waves);
    gl.uniform1f(U.uFigX, table(WALK.cx, tau) * FW);
    gl.uniform1f(U.uWobble, WALK.wobble);
    gl.uniform1f(U.uReflLen, (ground - table(WALK.top, tau) * FH) * WALK.reflectionLength);
    gl.uniform1f(U.uRefl, WALK.reflection);
    gl.uniform1f(U.uBlur, WALK.blur / P.S);
    gl.uniform1f(U.uLight, WALK.light);
    gl.uniform1f(U.uDark, WALK.dark);
    gl.uniform1f(U.uRefract, WALK.refract);
    gl.uniform1f(U.uSquash, WALK.squash);
    gl.uniform1f(U.uLambda, WALK.wavelength);
    gl.uniform1f(U.uContactDark, WALK.contactDark);
    gl.uniform1f(U.uScale, g);
    gl.uniform1f(U.uGround, ground);
    gl.uniform3fv(U.uTint, WALK.tint);
    gl.uniform3fv(U.uGlowColor, WALK.glow);
    gl.uniform4fv(U.uRipA, ripA);
    gl.uniform4fv(U.uRipB, ripB);
    gl.uniform4f(U.uGlow, WALK.end.x * FW, ground, 70 * g, WALK.glowStrength);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // ---------- animation: approach once, then one stride forever, two videos taking turns ----------
  const video2 = video.cloneNode();          // the second copy, waiting at the start of the stride
  video2.removeAttribute('class');
  video2.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0';
  let active = video, waiting = video2, looping = false, elapsed = 0, lastFrame = -1, prev = null, raf = 0, preroll = false;
  const T0 = () => WALK.loopStart, TEND = () => WALK.loopStart + WALK.stride;
  const LEAD = 0.5;   // the waiting copy starts this many seconds early, so it is already running smoothly at the hand-over
  // the time of the frame actually on screen: exact from requestVideoFrameCallback, but only while that is
  // current. The browser stops presenting a hidden source video now and then (and a copy that was just parked
  // still carries its old time), and trusting a stale time froze him on one frame while the video ran on;
  // then the playback clock is used instead.
  const exactOf = v => v._mt !== undefined && !v.seeking && Math.abs(v.currentTime - v._mt) < 2 / WALK.fps;
  const timeOf = v => (exactOf(v) ? v._mt : v.currentTime);
  const watch = v => {
    if (!v.requestVideoFrameCallback) return;
    const cb = (t, meta) => { v._mt = meta.mediaTime; v.requestVideoFrameCallback(cb); };
    v.requestVideoFrameCallback(cb);
  };
  const park = v => { if (v === waiting) preroll = false; v.pause(); v.playbackRate = 1; v._mt = undefined; v.currentTime = T0() - LEAD; };
  const parked = v => v.paused && v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - (T0() - LEAD)) < 0.05;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    // the browser may pause a hidden, muted video on its own (power saving): keep him walking
    if (active.paused && !active.ended && !document.hidden) active.play().catch(() => {});
    if (active.readyState < 2) return;
    let tau = timeOf(active), wrapped = false;
    if (prev && !active.paused) elapsed += Math.min(0.1, (now - prev.now) / 1000);   // time he has been walking
    if (!looping && tau >= T0()) looping = true;
    // near the end of the stride: start the waiting copy early and nudge its speed until it is exactly in step
    if (looping || tau >= T0() - LEAD) {
      const at = active.currentTime;
      if (at >= TEND() - LEAD && parked(waiting)) { preroll = true; waiting.play().catch(() => {}); }
      else if (preroll && waiting.paused && !waiting.seeking) waiting.play().catch(() => {});   // the browser paused it (power saving): carry on
      if (!waiting.paused) {
        const err = (waiting.currentTime - T0()) - (at - TEND());       // > 0: the copy is ahead
        waiting.playbackRate = Math.min(1.25, Math.max(0.8, 1 - err * 4));
      }
      if (at >= TEND() && !waiting.paused && waiting.currentTime >= T0() - 0.02) {   // hand over, in step
        const done = active;
        active = waiting; waiting = done;
        active.playbackRate = 1;
        preroll = false;
        park(done);
        tau = timeOf(active); wrapped = true;
      } else if (at >= Math.min(TEND() + 0.6, (active.duration || WALK.duration) - 0.1) || active.ended) {   // the copy never got going: jump back (rare)
        park(waiting);
        active._mt = undefined;
        active.currentTime = T0();
        if (active.paused) active.play().catch(() => {});
        tau = T0(); wrapped = true;
      }
    }
    const P = place(tau, elapsed), f = frameAt(tau);
    // the water stays put under the standing boot (not across the loop's seam, where the video jumps back)
    holdWater(f, P, wrapped);
    // touch-downs → ripples, on the frame the sole meets the water (never earlier)
    if (lastFrame >= 0 && !wrapped && f > lastFrame && f - lastFrame < 24) {
      for (const l of landings) if (l.f > lastFrame && l.f <= f) spawn(l, P, now);
    } else if (wrapped) {
      for (const l of landings) if (l.f > lastFrame && l.f <= frameAt(TEND())) spawn(l, P, now);   // a boot that landed right before the seam
    }
    lastFrame = f;
    prev = { oy: P.oy, S: P.S, now };
    canvas.style.opacity = Math.min(1, elapsed / WALK.fadeIn);
    draw(active, tau, P, now, true);
  };
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  // reduced motion, or no WebGL: his cut-out last frame at his final size and spot, still, no ripples
  const showStill = () => {
    const img = new Image();
    img.onload = () => {
      const paint = () => {
        layout();
        canvas.style.opacity = 1;
        const P = { S: L.s, ox: L.frameLeft0, oy: L.frameTop0 };   // the last frame at this size puts his boots on L.Yf
        if (prog) { ripples.length = 0; draw(img, WALK.duration, P, 0, false); return; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const x = P.ox - canvasLeft, y = P.oy - canvasTop, w = FW * P.S, h = FH * P.S, floor = L.Yf - canvasTop;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, y, w, h);
        ctx.save();                                   // reflection: flipped at his feet, faint, fading out
        ctx.globalAlpha = WALK.reflection * 0.8;
        ctx.translate(0, 2 * floor);
        ctx.scale(1, -1);
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
        const len = (WALK.endFeet - WALK.end.top) * FH * P.S * WALK.reflectionLength;
        const grad = ctx.createLinearGradient(0, floor, 0, floor + len);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = grad;
        ctx.fillRect(0, floor, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      };
      paint();
      repaint = paint;
      addEventListener('resize', paint);
    };
    img.src = video.dataset.still;
  };

  const load = () => {
    if (!wide.matches || canvas.dataset.on) return;
    canvas.dataset.on = '1';
    layout();
    makeLabel();
    if (still || !prog) { showStill(); return; }
    video.muted = video2.muted = true;
    video.preload = 'auto';   // buffer the whole clip: a copy that isn't ready can't take over, and the loop stalls
    video.src = video.dataset.src;
    watch(video);
    video.play().catch(() => {});
    // the second copy: loaded once the first is playing, then parked just before the start of the stride
    video.addEventListener('playing', () => {
      if (video2.getAttribute('src')) return;
      video.parentNode.insertBefore(video2, video.nextSibling);
      video2.preload = 'auto';
      video2.src = video.dataset.src;
      watch(video2);
      video2.addEventListener('loadeddata', () => { video2.currentTime = T0() - LEAD; }, { once: true });
      video2.load();
    }, { once: true });
    start();
    addEventListener('resize', layout);
    document.fonts?.ready.then(layout); // the headline's width changes once the web font has loaded
  };
  wide.addEventListener('change', load);
  document.addEventListener('visibilitychange', () => {
    if (!video.getAttribute('src')) return;
    if (document.hidden) { stop(); active.pause(); if (waiting.getAttribute('src')) park(waiting); }
    else { active.play().catch(() => {}); lastFrame = -1; held = null; prev = null; if (!lost) start(); }
  });
  // the browser can reset the GPU (driver hiccup, another tab, sleep): keep the last picture, wait for it, then
  // rebuild the shader and textures and carry on walking
  let lost = false;
  if (gl) {
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false;
      setup();
      uploaded = null; labelReady = false;
      makeLabel();
      if (!prog) return;
      if (video.getAttribute('src')) { lastFrame = -1; held = null; prev = null; start(); }
      else if (repaint) repaint();
    });
  }
  load();
})();
