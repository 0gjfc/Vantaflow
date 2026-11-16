// Background layer. Modes:
//   shader – default, an animated field of glowing controller-symbol outlines on near-black,
//            written for VantaFlow to match the feel of Itemzflow's default "PS symbols" shader
//   plain  – Itemzflow's clear colour (#1f1f1f)
//   image  – user-selected picture
// The shader renders at half resolution to stay light on TV browsers.

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

const FRAG = `
precision mediump float;
uniform float t;
uniform vec2 res;

float sdBox(vec2 p){ vec2 d = abs(p) - vec2(1.0); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdCircle(vec2 p){ return length(p) - 1.0; }
float sdTri(vec2 p){
  const float k = 1.7320508;
  p.x = abs(p.x) - 1.0; p.y += 1.0 / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0, 0.0);
  return -length(p) * sign(p.y);
}
float sdCross(vec2 p){
  p = abs(mat2(0.7071, -0.7071, 0.7071, 0.7071) * p);
  float bar1 = max(p.x - 1.15, p.y);
  float bar2 = max(p.y - 1.15, p.x);
  return min(bar1, bar2);
}
float shape(vec2 p, float id){
  float m = mod(id, 4.0);
  if (m < 1.0) return sdBox(p * 1.15);
  if (m < 2.0) return sdTri(p);
  if (m < 3.0) return sdCross(p);
  return sdCircle(p);
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float time = t * 0.035;
  vec2 origin = vec2(0.55 * sin(time * 1.3), 0.28 * cos(time * 0.9));
  vec3 teal = vec3(0.13, 0.62, 0.70);
  vec3 violet = vec3(0.58, 0.22, 0.86);
  vec3 col = vec3(0.012);
  col += vec3(0.55, 0.5, 0.85) * 0.05 / (length(uv - origin) + 0.08);

  for (int i = 0; i < 8; i++){
    float fi = float(i);
    float z = fract(fi / 8.0 + time * 0.6);          // 0 = far, 1 = near
    vec2 c = mix(origin, vec2(0.0), z);
    vec2 p = rot(fi * 1.7 + time * (1.0 + 0.2 * fi)) * (uv - c);
    float scale = mix(18.0, 0.9, z);
    float d = abs(shape(p * scale, fi)) / scale;
    float glow = 0.0016 / (d + 0.0025) * smoothstep(0.0, 0.25, z) * smoothstep(1.0, 0.75, z);
    float a = atan(p.y, p.x) / 6.2831 + 0.5;
    col += glow * mix(teal, violet, abs(fract(a + fi * 0.13) * 2.0 - 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function createBackground(canvas, imageLayer) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  let prog = null;
  let raf = 0;
  let state = { mode: 'plain', animated: false };
  const t0 = performance.now();

  if (gl) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    } catch (err) {
      console.warn('VantaFlow: background shader unavailable, using plain background.', err);
      prog = null;
    }
  }

  const uT = prog && gl.getUniformLocation(prog, 't');
  const uRes = prog && gl.getUniformLocation(prog, 'res');

  function draw(now = performance.now()) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uT, (now - t0) / 1000 + 40);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (state.mode === 'shader' && state.animated && prog && !raf) raf = requestAnimationFrame(loop);
  });

  return {
    hasShader: Boolean(prog),
    snapshot() {
      if (!prog) return null;
      if (canvas.width !== 960) { canvas.width = 960; canvas.height = 540; }
      draw();
      return canvas.toDataURL('image/jpeg', 0.7);
    },
    // mode: 'shader' | 'plain' | 'image'; image: data URL; dim: 0–100
    update({ mode, image, dim, animated }) {
      if (mode === 'shader' && !prog) mode = 'plain';
      if (mode === 'image' && !image) mode = 'shader';
      state = { mode, animated };
      canvas.hidden = mode !== 'shader';
      imageLayer.hidden = mode !== 'image';
      imageLayer.style.backgroundImage = mode === 'image' ? `url("${image}")` : '';
      document.documentElement.style.setProperty('--bg-dim', String(dim / 100));
      stop();
      if (mode !== 'shader') return;
      canvas.width = 960;
      canvas.height = 540;
      if (animated) raf = requestAnimationFrame(loop);
      else draw();
    },
  };
}
