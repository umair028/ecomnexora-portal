// Sign-in page "moon" (views/pages/login-moon.ejs): a huge copper moon rising behind drifting
// mist, a starry sky, and wet, cracked ground that mirrors it all. One fragment shader, rendered
// at a reduced resolution (the scene is soft), paused when the tab is hidden.
(() => {
  const canvas = document.querySelector('.lm-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return; // the CSS gradient on .lm stays as the background

  const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const frag = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
const float H = 0.36;   // horizon, 0 = bottom (64% down); the walker's feet in login-moon.css sit just below it

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= .5; }
  return v;
}
// distances to the nearest and second-nearest cell point
vec2 voro(vec2 x){
  vec2 n = floor(x), f = fract(x);
  float f1 = 8., f2 = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash2(n + g) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return vec2(sqrt(f1), sqrt(f2));
}

vec2 moonC(float aspect, float t){ return vec2(aspect * .5, .9 + sin(t * .05) * .006) + uMouse * vec2(.012, .008); }
const float MR = .38;

// sky: dark gradient, stars, the copper moon and its halo
vec3 sky(vec2 s, float aspect, float t){
  vec3 col = mix(vec3(.07, .045, .05), vec3(.012, .01, .012), smoothstep(H, .95, s.y));
  vec2 C = moonC(aspect, t);
  vec2 d = (s - C) / MR;
  float l = length(d);
  // stars, fading out near the moon
  vec2 g = s * 150.;
  vec2 cell = floor(g), f = fract(g) - .5;
  float h = hash(cell);
  if (h > .978) {
    vec2 o = hash2(cell) - .5;
    float tw = .5 + .5 * sin(t * (1. + h * 3.) + h * 50.);
    col += vec3(1., .94, .9) * smoothstep(.22, 0., length(f - o * .5)) * tw * smoothstep(1.15, 1.8, l) * .8;
  }
  // halo
  col += vec3(1., .32, .24) * exp(-max(l - 1., 0.) * 3.5) * .22 * step(1., l);
  col += vec3(1., .55, .45) * exp(-max(l - 1., 0.) * 14.) * .12 * step(1., l);
  if (l < 1.) {
    float z = sqrt(1. - l * l);
    vec2 p = d / (.55 + .45 * z);                       // wrap the surface around the sphere
    float a = t * .004; p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    float maria = fbm(p * 1.5 + 11.);
    float alb = .62 - .3 * smoothstep(.45, .7, maria) + .14 * (fbm(p * 7.) - .5);
    // craters: bright rims and darker floors, only in some cells and at two sizes, so they don't tile
    vec2 v1 = voro(p * 3.4 + 2.);
    float k1 = smoothstep(.58, .78, noise(p * 2.3 + 4.));
    alb += k1 * (.07 * exp(-pow((v1.x - .3) * 15., 2.)) - .08 * smoothstep(.28, 0., v1.x));
    vec2 v2 = voro(p * 9. + 7.);
    float k2 = smoothstep(.45, .7, noise(p * 5. + 9.));
    alb += k2 * (.07 * exp(-pow((v2.x - .26) * 18., 2.)) - .05 * smoothstep(.24, 0., v2.x));
    float shade = .32 + .68 * pow(z, .5);
    vec3 moon = alb * shade * vec3(1., .6, .5) * 1.08 + vec3(1., .3, .22) * pow(1. - z, 3.) * .35;
    col = mix(col, moon, smoothstep(1., .985, l));
  }
  return col;
}

// mist: heavy clouds rolling in from both sides, a thin layer of fog along the horizon
vec4 mist(vec2 s, float aspect, float t){
  vec2 q = vec2(s.x / aspect, s.y);
  float side = smoothstep(.1, .46, abs(q.x - .5));
  vec2 p = vec2(s.x * 1.3, s.y * 2.4);
  vec2 w = vec2(fbm(p * .8 + vec2(t * .03, 0.)), fbm(p * .8 + vec2(5.2, -t * .025)));
  float m = fbm(p + w * 1.7 + vec2(-t * .035 * sign(q.x - .5), t * .01));
  float top = H + .2 + side * .4;
  float band = smoothstep(H - .07, H + .04, s.y) * (1. - smoothstep(top - .2, top + .1, s.y));
  float dens = smoothstep(.22, .52, m) * band * (.35 + 1.25 * side);   // m averages ~.4
  dens += exp(-abs(s.y - H - .015) * 20.) * .6 * smoothstep(.15, .5, m);
  float lit = exp(-length(s - moonC(aspect, t)) * 1.2);
  vec3 c = mix(vec3(.15, .12, .125), vec3(.66, .56, .55), smoothstep(.25, .7, m)) * (.6 + 1.1 * lit) + vec3(.95, .26, .2) * lit * .25;
  return vec4(c, clamp(dens, 0., .93));
}

vec3 scene(vec2 s, float aspect, float t){
  vec4 m = mist(s, aspect, t);
  vec3 col = mix(sky(s, aspect, t), m.rgb, m.a);
  col += vec3(.95, .32, .26) * exp(-abs(s.y - H) * 50.) * .1;   // warm line where the light meets the ground
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 s = vec2(uv.x * aspect, uv.y);
  float t = uTime;
  vec3 col;

  if (s.y >= H) {
    col = scene(s, aspect, t);
  } else {
    // wet, cracked ground in perspective; puddles mirror the sky, dry plates crack
    float depth = (H - s.y) / H;
    float z = 1. / (depth + .05);
    vec2 wp = vec2((s.x - aspect * .5) * z * .6, z * 1.2);
    vec2 v = voro(wp * .9);
    float crack = (1. - smoothstep(0., .05 + depth * .03, v.y - v.x)) * smoothstep(.03, .25, depth);
    float wet = smoothstep(.4, .62, fbm(wp * .35 + 7.));
    float n = fbm(wp * vec2(1.5, 4.) + vec2(0., -t * .25)) - .5;
    vec2 rs = vec2(s.x + n * .012, 2. * H - s.y + n * .018 * (1. + depth));
    vec3 refl = scene(rs, aspect, t);
    vec3 base = vec3(.055, .043, .045) * (.7 + .6 * fbm(wp * 2.));
    col = mix(base, refl, mix(.25, .85, wet));
    col *= 1. - crack * .75 * (1. - wet);
    // fog lying on the ground near the horizon
    vec4 m = mist(vec2(s.x, H + .01), aspect, t);
    col = mix(col, m.rgb, m.a * exp(-depth * 5.) * .8);
    col *= 1. - depth * .45;
  }

  col = 1. - exp(-col * 1.5);
  vec2 q = uv - .5;
  col *= 1. - dot(q, q) * .6;
  gl_FragColor = vec4(col, 1.);
}`;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, vert), fs = shader(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  // one triangle that covers the screen
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scale = Math.min(window.devicePixelRatio || 1, 2) * (innerWidth < 768 ? .5 : .6);
  const MAX_PIXELS = 1e6; // keeps big / high-DPI screens at roughly the cost of a 1440×860 one
  const resize = () => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const s = Math.min(scale, Math.sqrt(MAX_PIXELS / Math.max(1, cw * ch)));
    const w = Math.max(1, Math.round(cw * s)), h = Math.max(1, Math.round(ch * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };

  // pointer parallax on the moon, eased
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    mouse.tx = e.clientX / innerWidth - .5;
    mouse.ty = .5 - e.clientY / innerHeight;
  }, { passive: true });

  const t0 = performance.now() - 8000; // start a few seconds in, so the first frame already looks settled
  let raf = 0, last = 0, slow = 0, frames = 0;
  const draw = now => {
    resize();
    mouse.x += (mouse.tx - mouse.x) * .04;
    mouse.y += (mouse.ty - mouse.y) * .04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!frames++) canvas.classList.add('on');

    // on slow GPUs drop the render resolution a step (gaps over 200ms are tab throttling, not the GPU)
    const dt = now - last;
    if (last && dt < 200) slow = dt > 28 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && scale > .25) { scale *= .75; slow = 0; }
    last = now;
    if (!still) raf = requestAnimationFrame(draw);
  };
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(draw); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : !still && start()));
  addEventListener('resize', () => still && requestAnimationFrame(draw));
  start();
})();
