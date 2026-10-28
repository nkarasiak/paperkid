// The 3D view: the same scene as the 2D game, drawn with WebGL2 from the same sprite recipes.
// Each recipe's boxes, quads, lines and rings become textured triangles; discs (heads, leaves) stay
// flat and face the camera, like the 2D sprites. Colours are the recipes' own, unlit, with their baked
// face shading, and a post pass draws the dark silhouette outline the 2D sprites carry.

import { Painter, dark, rgb, type Art, type Col, type V3 } from './pix'
import { groundTiles } from './sprites'
import type { Ride } from './ride'
import type { Surface } from './render'

const TPU = 2 // texels per world unit when baking a face's colour function
const SKY = '#8fcbea'

// ---------------------------------------------------------------- vectors and matrices

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3) => sc(a, 1 / Math.hypot(...a))
const at = (col: Col, u: number, v: number) => (typeof col === 'string' ? col : col(u, v))

/** View matrix (column-major) for world (s, l, z). l points right of travel, so it is flipped into a right-handed frame. */
function lookAt(e: V3, t: V3, up: V3 = [0, 0, 1]) {
  const E: V3 = [e[0], -e[1], e[2]], f = norm(sub([t[0], -t[1], t[2]], E)), r = norm(cross(f, [up[0], -up[1], up[2]])), u = cross(r, f)
  return [r[0], u[0], -f[0], 0, -r[1], -u[1], f[1], 0, r[2], u[2], -f[2], 0, -dot(r, E), -dot(u, E), dot(f, E), 1]
}
const perspective = (fov: number, a: number, n: number, f: number) => {
  const t = 1 / Math.tan((fov * Math.PI) / 360)
  return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]
}
const mul = (m: number[], v: number[]) => [0, 1, 2, 3].map(i => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3])

// ---------------------------------------------------------------- recipes → meshes

interface Patch { w: number; h: number; c: (i: number, j: number) => string }

/** A Painter that records geometry instead of pixels. Each face gets a patch of texels, packed into one texture per sprite. */
class Mesher extends Painter {
  patches: Patch[] = []
  solids = new Map<string, number>()
  v: number[] = [] // per vertex: s, l, z, billboard dx, dy, texel u, v, patch

  private patch(w: number, h: number, c: Patch['c']) { return this.patches.push({ w, h, c }) - 1 }
  private solid(c: string) {
    let p = this.solids.get(c)
    if (p === undefined) this.solids.set(c, (p = this.patch(1, 1, () => c)))
    return p
  }
  private vert(p: number, P: V3, u: number, v: number, dx = 0, dy = 0) { this.v.push(P[0], P[1], P[2], dx, dy, u, v, p) }
  /** Quad A B C D, textured with the patch texels (u0, v0)..(u1, v1). */
  private face(p: number, A: V3, B: V3, C: V3, D: V3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    this.vert(p, A, u0, v0); this.vert(p, B, u1, v0); this.vert(p, C, u1, v1)
    this.vert(p, A, u0, v0); this.vert(p, C, u1, v1); this.vert(p, D, u0, v1)
  }
  /** Box around the segment A→B with half-axes p1, p2. */
  private prism(A: V3, B: V3, p1: V3, p2: V3, c: string) {
    const p = this.solid(c), sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const cn = (P: V3, [i, j]: number[]) => add(add(P, sc(p1, i)), sc(p2, j))
    for (let n = 0; n < 4; n++) this.face(p, cn(A, sq[n]), cn(A, sq[(n + 1) % 4]), cn(B, sq[(n + 1) % 4]), cn(B, sq[n]))
    for (const P of [A, B]) this.face(p, cn(P, sq[0]), cn(P, sq[1]), cn(P, sq[2]), cn(P, sq[3]))
  }
  private cube(C: V3, t: number, c: string) { this.prism(sub(C, [0, 0, t]), add(C, [0, 0, t]), [t, 0, 0], [0, t, 0], c) }

  pt(s: number, l: number, z: number, c: string) { this.cube(sc([s, l, z], this.k), this.k / 2, c) }

  quad(a: V3, e1: V3, e2: V3, col: Col, tri = false) {
    const L1 = Math.hypot(...e1), L2 = Math.hypot(...e2), k = this.k
    let p: number, w = 1, h = 1
    if (typeof col === 'string') p = this.solid(col)
    else {
      w = Math.max(1, Math.ceil(L1 * TPU)); h = Math.max(1, Math.ceil(L2 * TPU))
      p = this.patch(w, h, (i, j) => col(((i + 0.5) / w) * L1, ((j + 0.5) / h) * L2))
    }
    const A = sc(a, k), B = sc(add(a, e1), k), C = sc(add(a, e2), k)
    if (tri) { this.vert(p, A, 0, 0); this.vert(p, B, w, 0); this.vert(p, C, 0, h); return }
    this.face(p, A, B, sc(add(add(a, e1), e2), k), C, 0, 0, w, h)
  }

  /** All faces but the bottom: the 2D sprite only needs the three it can see. */
  box(s0: number, s1: number, l0: number, l1: number, z0: number, z1: number, c: string, side?: Col, near?: Col, top?: Col) {
    if (s0 > s1) [s0, s1] = [s1, s0]
    super.box(s0, s1, l0, l1, z0, z1, c, side, near, top)
    this.quad([s1, l0, z0], [0, l1 - l0, 0], [0, 0, z1 - z0], near ?? dark(c, 0.68))
    this.quad([s0, l0, z0], [s1 - s0, 0, 0], [0, 0, z1 - z0], side ?? dark(c, 0.84))
  }

  line(a: V3, b: V3, c: string, w = 1) {
    const A = sc(a, this.k), B = sc(b, this.k), d = sub(B, A), len = Math.hypot(...d), t = (Math.max(1, w) * this.k) / 2
    if (len < 0.01) return this.cube(A, t, c)
    const u = sc(d, 1 / len), p1 = norm(cross(u, Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]))
    this.prism(sub(A, sc(u, t)), add(B, sc(u, t)), sc(p1, t), sc(cross(u, p1), t), c)
  }

  disc(c: V3, r: number, col: Col) {
    r *= this.k
    const R = Math.ceil(r), n = 2 * R + 1, e = R + 0.5, P = sc(c, this.k)
    const p = this.patch(n, n, (i, j) => { const dx = i - R, dy = j - R; return dx * dx + dy * dy <= r * r + 0.3 ? at(col, dx, dy) : '' })
    // A camera-facing square: texel row j = screen row dy, downward.
    this.vert(p, P, 0, 0, -e, e); this.vert(p, P, n, 0, e, e); this.vert(p, P, n, n, e, -e)
    this.vert(p, P, 0, 0, -e, e); this.vert(p, P, n, n, e, -e); this.vert(p, P, 0, n, -e, -e)
  }

  /** A ring becomes a short tyre: two flat annuli and the tread between them. */
  ring(c: V3, a: V3, b: V3, r: number, col: Col, thick = 1) {
    const k = this.k, C = sc(c, k), N = Math.max(12, Math.ceil(r * k * 3)), nb = Math.ceil(thick / 0.4 - 1e-9)
    const p = this.patch(N, nb, (i, j) => at(col, ((i + 0.5) / N) * Math.PI * 2, j * 0.4))
    const n = sc(norm(cross(a, b)), 0.6 * k)
    const P = (i: number, rr: number, side: number) => {
      const th = (i / N) * Math.PI * 2
      return add(add(C, sc(a, Math.cos(th) * rr * k)), add(sc(b, Math.sin(th) * rr * k), sc(n, side)))
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < nb; j++) {
        const r0 = r - j * 0.4, r1 = r - Math.min(thick, (j + 1) * 0.4)
        for (const sd of [-1, 1]) this.face(p, P(i, r0, sd), P(i + 1, r0, sd), P(i + 1, r1, sd), P(i, r1, sd), i, j, i + 1, j + 1)
      }
      this.face(p, P(i, r, -1), P(i + 1, r, -1), P(i + 1, r, 1), P(i, r, 1), i, 0, i + 1, 1)
    }
  }
}

interface Mesh { vao?: WebGLVertexArrayObject; tex?: WebGLTexture; n: number; mask: number }

function mesh(a: Art): Mesh {
  if (a.m) return a.m as Mesh
  const m = new Mesher()
  a.draw(m)
  if (!m.v.length) return (a.m = { n: 0, mask: 0 })
  // Shelf-pack the patches (tallest first, 1 texel apart) into one texture.
  const ps = m.patches, order = ps.map((_, i) => i).sort((x, y) => ps[y].h - ps[x].h)
  const TW = Math.max(...ps.map(p => p.w + 1), Math.ceil(Math.sqrt(ps.reduce((n, p) => n + (p.w + 1) * (p.h + 1), 0))))
  const pos: [number, number][] = []
  let x = 0, y = 0, row = 0
  for (const i of order) {
    if (x + ps[i].w > TW) { x = 0; y += row + 1; row = 0 }
    pos[i] = [x, y]
    x += ps[i].w + 1
    row = Math.max(row, ps[i].h)
  }
  const TH = y + row, tex = new Uint32Array(TW * TH)
  ps.forEach((p, i) => {
    const [x0, y0] = pos[i]
    for (let j = 0; j < p.h; j++) for (let k = 0; k < p.w; k++) { const c = p.c(k, j); if (c) tex[(y0 + j) * TW + x0 + k] = rgb(c) }
  })
  const out = new Float32Array((m.v.length / 8) * 11)
  for (let i = 0, o = 0; i < m.v.length; i += 8, o += 11) {
    const [x0, y0] = pos[m.v[i + 7]]
    out.set([m.v[i], m.v[i + 1], m.v[i + 2], m.v[i + 3], m.v[i + 4], (x0 + m.v[i + 5]) / TW, (y0 + m.v[i + 6]) / TH, 1, 1, 1, 1], o)
  }
  return (a.m = { vao: buffer(out).vao, tex: texture(new Uint8Array(tex.buffer), TW, TH), n: out.length / 11, mask: a.outline ? 1 : 0 })
}

// ---------------------------------------------------------------- WebGL

let gl: WebGL2RenderingContext | null | undefined, cv: HTMLCanvasElement
let main: WebGLProgram, post: WebGLProgram, fbo: WebGLFramebuffer, color: WebGLTexture, depth: WebGLTexture
const uni = new Map<string, WebGLUniformLocation | null>()
const u = (p: WebGLProgram, name: string) => {
  const key = (p === main ? 'm' : 'p') + name
  if (!uni.has(key)) uni.set(key, gl!.getUniformLocation(p, name))
  return uni.get(key)!
}
const textures: Record<string, WebGLTexture> = {}

const MAIN = [`#version 300 es
layout(location=0) in vec3 P; layout(location=1) in vec2 O; layout(location=2) in vec2 T; layout(location=3) in vec4 C;
uniform mat4 V, R; uniform vec3 U; out vec2 t; out vec4 c;
void main() { vec4 v = V * vec4(P + U, 1); v.xy += O; gl_Position = R * v; t = T; c = C; }`, `#version 300 es
precision highp float; uniform sampler2D S; uniform float M; in vec2 t; in vec4 c; out vec4 o;
void main() { vec4 x = texture(S, t) * c; if (x.a < .02) discard; o = vec4(x.rgb, c.a < 1. ? c.a : M); }`]
// Outline: a pixel next to a nearer outlined object (alpha 1) turns #161616, as the 2D sprites' outline does.
const POST = [`#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`, `#version 300 es
precision highp float; uniform sampler2D C, D; uniform vec2 K; out vec4 o;
float z(ivec2 p) { return 2. * K.x * K.y / (K.y + K.x - (2. * texelFetch(D, p, 0).r - 1.) * (K.y - K.x)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), m = textureSize(C, 0) - 1; vec4 c = texelFetch(C, p, 0); float d = z(p), e = 6. + d * .03;
  for (int i = 0; i < 4; i++) {
    ivec2 q = clamp(p + ivec2(i == 0 ? 1 : i == 1 ? -1 : 0, i == 2 ? 1 : i == 3 ? -1 : 0), ivec2(0), m);
    if (texelFetch(C, q, 0).a > .5 && z(q) < d - e) { c.rgb = vec3(22. / 255.); break; }
  }
  o = vec4(c.rgb, 1);
}`]

function program([vs, fs]: string[]) {
  const g = gl!, p = g.createProgram()!
  for (const [type, src] of [[g.VERTEX_SHADER, vs], [g.FRAGMENT_SHADER, fs]] as const) {
    const s = g.createShader(type)!
    g.shaderSource(s, src)
    g.compileShader(s)
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw Error(g.getShaderInfoLog(s) ?? 'shader')
    g.attachShader(p, s)
  }
  g.linkProgram(p)
  return p
}

function texture(src: Uint8Array | HTMLCanvasElement | null, w: number, h: number, repeat = false, fmt?: [number, number, number]) {
  const g = gl!, t = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, t)
  if (src instanceof HTMLCanvasElement) g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src)
  else g.texImage2D(g.TEXTURE_2D, 0, fmt?.[0] ?? g.RGBA, w, h, 0, fmt?.[1] ?? g.RGBA, fmt?.[2] ?? g.UNSIGNED_BYTE, src)
  const wrap = repeat ? g.REPEAT : g.CLAMP_TO_EDGE
  if (repeat) g.generateMipmap(g.TEXTURE_2D) // ground far away averages out instead of shimmering
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, repeat ? g.NEAREST_MIPMAP_LINEAR : g.NEAREST)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, wrap)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, wrap)
  return t
}

/** Vertex layout: position (3), billboard offset (2), uv (2), colour (4). */
function buffer(data: Float32Array, reuse?: { vao: WebGLVertexArrayObject; buf: WebGLBuffer }) {
  const g = gl!, vao = reuse?.vao ?? g.createVertexArray()!, buf = reuse?.buf ?? g.createBuffer()!
  g.bindVertexArray(vao)
  g.bindBuffer(g.ARRAY_BUFFER, buf)
  g.bufferData(g.ARRAY_BUFFER, data, reuse ? g.DYNAMIC_DRAW : g.STATIC_DRAW)
  if (!reuse) [3, 2, 2, 4].reduce((off, n, i) => { g.enableVertexAttribArray(i); g.vertexAttribPointer(i, n, g.FLOAT, false, 44, off * 4); return off + n }, 0)
  return { vao, buf }
}

function init(w: number, h: number) {
  if (gl !== undefined) return !!gl
  cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  gl = cv.getContext('webgl2', { antialias: false })
  if (!gl) return false
  main = program(MAIN)
  post = program(POST)
  textures.white = texture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  for (const [k, c] of Object.entries(groundTiles())) textures[k] = texture(c, 16, 16, true)
  color = texture(null, w, h)
  depth = texture(null, w, h, false, [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT])
  fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0)
  return true
}

// ---------------------------------------------------------------- views

// A 3D camera sits back units behind the kid and h above the ground (or, from above, top units straight up),
// framed for a lens of f0 degrees; at fov it dollies back so the kid keeps his size, and d scales the distance
// (zoom); yaw turns it around the kid, in degrees. It always aims so the kid sits 62% down the screen. A long
// lens keeps edges near parallel, like the old game's flat projection. Tuned in game with two fingers on a
// trackpad (main.ts), for this session only; 0 resets.
// The 2D views have no camera: flat = [zoom (screen pixels per sprite pixel), kid's screen x, y] for render.ts.
interface View { name: string; flat?: [number, number, number]; back?: number; h?: number; top?: number; d?: number; yaw?: number; f0?: number; fov?: number }
const VIEWS: View[] = [
  { name: '2D', flat: [2, 370, 250] },
  { name: '2D FAR', flat: [1.5, 256, 250] },
  { name: '3D BEHIND THE KID', back: 152, h: 72, d: 0.345, yaw: 0, f0: 70, fov: 38 },
  { name: '3D FROM ABOVE', top: 940, d: 0.5, yaw: 0, f0: 24, fov: 24 },
]
const DEFAULTS = VIEWS.map(v => ({ ...v }))
let view = 0
try {
  view = Number(localStorage.getItem('paper-kid-view')) % VIEWS.length || 0
} catch { /* private mode: defaults */ }
const label = (v: View) => 'VIEW: ' + (v.flat ? v.name
  : `${v.name}${v.top ? '' : ` · FOV ${Math.round(v.fov!)}°`} · ZOOM ${(1 / v.d!).toFixed(1)}×${Math.round(v.yaw!) ? ` · TURN ${Math.round(v.yaw!)}°` : ''}`)
export const viewInfo = { name: label(VIEWS[view]), t: 0 }
export const flat2D = () => VIEWS[view].flat ?? VIEWS[0].flat!
/** Canvas resolution multiplier: a fractional 2D zoom renders at 2× so every sprite pixel stays a whole square. */
export const canvasScale = () => (Number.isInteger(flat2D()[0]) ? 1 : 2)
const save = () => {
  Object.assign(viewInfo, { name: label(VIEWS[view]), t: performance.now() })
  try { localStorage.setItem('paper-kid-view', String(view)) } catch { /* keep it for this session */ }
}

/** V cycles the views; the 3D ones are skipped where WebGL2 is missing. */
export function nextView() {
  view = (view + 1) % VIEWS.length
  if (!VIEWS[view].flat && !init(512, 384)) view = 0
  save()
}

/** Steps the 3D lens (4° a step), zoom (15% a step; + moves away) and turn (degrees).
 * Fractional steps are fine (trackpads). In 2D, a whole step of zoom flips 2D / 2D FAR. */
let zoomAcc = 0
export function tuneView(dFov: number, dZoom = 0, dYaw = 0) {
  const v = VIEWS[view]
  if (v.flat) {
    if (Math.abs((zoomAcc += dZoom)) >= 1) { view = zoomAcc > 0 ? 1 : 0; zoomAcc = 0; save() }
    else if (dFov) Object.assign(viewInfo, { name: 'LENS: 3D VIEWS, PRESS V', t: performance.now() })
    return
  }
  if (v.top) [dFov, dZoom] = [0, dZoom + dFov / 5] // from above a wider lens only stretches roofs up at you: pinch zooms
  v.fov = Math.max(8, Math.min(90, v.fov! + dFov * 4))
  v.d = Math.max(0.2, Math.min(3, v.d! * 1.15 ** dZoom))
  v.yaw = ((((v.yaw! + dYaw + 180) % 360) + 360) % 360) - 180
  save()
}

/** 0 puts the current 3D camera back to its defaults. */
export function resetView() {
  if (VIEWS[view].flat) return
  Object.assign(VIEWS[view], DEFAULTS[view])
  save()
}

// ---------------------------------------------------------------- one frame

type Batch = { v: number[]; segs: [string, number][]; gpu?: { vao: WebGLVertexArrayObject; buf: WebGLBuffer } }
const batch = (): Batch => ({ v: [], segs: [] })
const ground = batch(), blobs = batch(), polys = batch()
let puts: [Art, number, number, number][] = [], labels: [number, number, string, string][] = []
let Vm: number[] = [], Pm: number[] = []
const NEAR = 4, FAR = 8000

const rgba = (c: string, a = 1) => {
  if (c.length < 7) c = '#' + [...c.slice(1)].map(x => x + x).join('')
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]
}
function tri(b: Batch, tex: string, ...vs: number[][]) {
  const last = b.segs[b.segs.length - 1]
  if (last?.[0] === tex) last[1] += vs.length
  else b.segs.push([tex, vs.length])
  for (const v of vs) b.v.push(...v)
}
/** Camera-facing fan around a world point; pts are screen offsets, y down. */
function fan(b: Batch, s: number, l: number, z: number, pts: number[], c: string) {
  const k = rgba(c), v = (i: number) => [s, l, z, pts[i], -pts[i + 1], 0, 0, ...k]
  for (let i = 2; i + 3 < pts.length; i += 2) tri(b, 'white', v(0), v(i), v(i + 2))
}

/** Starts a 3D frame and hands back its surface, or null in the 2D view. */
export function surface3D(ctx: CanvasRenderingContext2D, r: Ride): Surface | null {
  const V = VIEWS[view]
  if (V.flat) return null
  if (!init(ctx.canvas.width, ctx.canvas.height)) { view = 0; return null } // no WebGL2: back to 2D, so the keys match what's drawn
  const b = r.bike, A: V3 = [b.s, b.l, 0]
  const t = Math.tan((V.fov! * Math.PI) / 360), dolly = Math.tan((V.f0! * Math.PI) / 360) / t
  // Offsets from the kid for the eye, a point it looks at, and screen-up, before turning them by yaw.
  let E: V3, F: V3, up: V3 = [0, 0, 1]
  if (V.top) { // straight down, the way he rides at the top of the screen
    const H = V.top * dolly * V.d!
    E = [0.24 * H * t, 0, H]
    F = sub(E, [0, 0, 1])
    up = [1, 0, 0]
  } else {
    E = [-V.back! * dolly * V.d!, 0, V.h! * dolly * V.d!]
    const down = Math.atan2(E[2] - 15, -E[0]) - Math.atan(0.24 * t) // 15 = the kid's middle
    F = [E[0] + Math.cos(down), 0, E[2] - Math.sin(down)]
  }
  const y = (V.yaw! * Math.PI) / 180, turn = (p: V3): V3 => [p[0] * Math.cos(y) - p[1] * Math.sin(y), p[0] * Math.sin(y) + p[1] * Math.cos(y), p[2]]
  Vm = lookAt(add(A, turn(E)), add(A, turn(F)), turn(up))
  Pm = perspective(V.fov!, cv.width / cv.height, NEAR, FAR)
  for (const x of [ground, blobs, polys]) { x.v = []; x.segs = [] }
  puts = []
  labels = []
  const flat = (s0: number, s1: number, l0: number, l1: number, fill: string) => {
    const pat = !fill.startsWith('#'), k = pat ? [1, 1, 1, 1] : rgba(fill)
    const v = (s: number, l: number) => [s, l, 0, 0, 0, pat ? l / 16 : 0, pat ? s / 16 : 0, ...k]
    tri(ground, pat ? fill : 'white', v(s0, l0), v(s1, l0), v(s1, l1), v(s0, l0), v(s1, l1), v(s0, l1))
  }
  flat(b.s - 9000, b.s + 9000, -9000, 9000, '#4e9139') // grass out to the horizon
  return {
    range: [b.s - 600, b.s + 3000], // a long lens sees far up the street
    put: (a, s, l, z = 0) => puts.push([a, s, l, z]),
    flat,
    blob(s, l, rx, ry, a) {
      const k = rgba('#000000', a), v = (i: number) => [s + Math.cos(i * 0.4) * rx, l + Math.sin(i * 0.4) * ry * 1.6, 0, 0, 0, 0, 0, ...k]
      for (let i = 1; i < 15; i++) tri(blobs, 'white', v(0), v(i), v(i + 1))
    },
    poly: (s, l, z, pts, c) => fan(polys, s, l, z, pts, c),
    disc: (s, l, dx, dy, rr, c) => fan(polys, s, l, 0, [...Array(12)].flatMap((_, i) => [dx + Math.cos(i * 0.52) * rr, dy + Math.sin(i * 0.52) * rr]), c),
    label(s, l, z, t, c) {
      const [x, y, , w] = mul(Pm, mul(Vm, [s, l, z, 1]))
      if (w > 0) labels.push([((x / w + 1) / 2) * cv.width, ((1 - y / w) / 2) * cv.height, t, c])
    },
  }
}

function draw(b: Batch) {
  const g = gl!
  if (!b.v.length) return
  b.gpu = buffer(new Float32Array(b.v), b.gpu)
  let first = 0
  for (const [tex, n] of b.segs) {
    g.bindTexture(g.TEXTURE_2D, textures[tex])
    g.drawArrays(g.TRIANGLES, first, n)
    first += n
  }
}

/** Renders the frame, copies it onto the 2D canvas, and returns the popup labels in screen pixels. */
export function finish3D(ctx: CanvasRenderingContext2D) {
  const g = gl!
  g.bindFramebuffer(g.FRAMEBUFFER, fbo)
  g.viewport(0, 0, cv.width, cv.height)
  g.clearColor(...(rgba(SKY, 0) as [number, number, number, number]))
  g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT)
  g.useProgram(main)
  g.uniformMatrix4fv(u(main, 'V'), false, Vm)
  g.uniformMatrix4fv(u(main, 'R'), false, Pm)
  g.uniform3f(u(main, 'U'), 0, 0, 0)
  g.activeTexture(g.TEXTURE0)
  // Ground in submission order like the 2D painter, without depth, so objects always stand on it.
  g.disable(g.DEPTH_TEST)
  g.uniform1f(u(main, 'M'), 0)
  draw(ground)
  g.enable(g.BLEND)
  g.blendFuncSeparate(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA, g.ZERO, g.ONE) // shadows darken colour, keep the outline mask
  draw(blobs)
  g.disable(g.BLEND)
  g.enable(g.DEPTH_TEST)
  for (const [a, s, l, z] of puts) {
    const m = mesh(a)
    if (!m.n) continue
    g.uniform3f(u(main, 'U'), s, l, z)
    g.uniform1f(u(main, 'M'), m.mask)
    g.bindTexture(g.TEXTURE_2D, m.tex!)
    g.bindVertexArray(m.vao!)
    g.drawArrays(g.TRIANGLES, 0, m.n)
  }
  g.uniform3f(u(main, 'U'), 0, 0, 0)
  g.uniform1f(u(main, 'M'), 1)
  draw(polys)

  g.bindFramebuffer(g.FRAMEBUFFER, null)
  g.disable(g.DEPTH_TEST)
  g.useProgram(post)
  g.activeTexture(g.TEXTURE1)
  g.bindTexture(g.TEXTURE_2D, depth)
  g.activeTexture(g.TEXTURE0)
  g.bindTexture(g.TEXTURE_2D, color)
  g.uniform1i(u(post, 'C'), 0)
  g.uniform1i(u(post, 'D'), 1)
  g.uniform2f(u(post, 'K'), NEAR, FAR)
  g.drawArrays(g.TRIANGLES, 0, 3)
  ctx.drawImage(cv, 0, 0)
  return labels
}
